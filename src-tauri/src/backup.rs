// Primitives de sauvegarde et de restauration (lot V2.2a).
// Le noyau exécute ; la politique (quand sauvegarder, combien en garder, quoi accepter) vit côté TypeScript (src/data/backup-service.ts).
use crate::files::{self, parse_backup_name, KINDS};
use rusqlite::{backup::Backup, Connection, OpenFlags};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecondaryResult {
    pub ok: bool,
    pub file: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Created {
    pub file: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub secondary: Option<SecondaryResult>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub file: String,
    pub name: String,
    pub kind: String,
    pub stamp: String,
    pub seq: u32,
    pub size_bytes: u64,
    pub schema_version: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Verified {
    pub ok: bool,
    pub message: String,
    pub sha256: String,
    pub schema_version: Option<i64>,
    pub size_bytes: u64,
}

fn integrity_of(conn: &Connection) -> Result<String, String> {
    conn.query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())
}

/// Sauvegarde cohérente (API de sauvegarde en ligne de SQLite) vérifiée par integrity_check, puis empreinte SHA-256.
/// En cas d'échec, la copie est supprimée. Si `secondary` est fourni, la copie y est aussi déposée ; son échec n'invalide pas la sauvegarde principale.
pub fn create_backup(conn: &Connection, backups_dir: &Path, kind: &str, secondary: Option<&Path>) -> Result<Created, String> {
    if !KINDS.contains(&kind) {
        return Err("Type de sauvegarde inconnu.".into());
    }
    fs::create_dir_all(backups_dir).map_err(|e| format!("Dossier de sauvegarde inaccessible : {e}"))?;
    let stamp = files::utc_stamp_now();
    let target = files::free_backup_path(backups_dir, &stamp, kind);

    let made = (|| -> Result<(), String> {
        let verdict = {
            let mut dst = Connection::open(&target).map_err(|e| e.to_string())?;
            {
                let b = Backup::new(conn, &mut dst).map_err(|e| e.to_string())?;
                b.run_to_completion(100, Duration::from_millis(0), None).map_err(|e| e.to_string())?;
            }
            integrity_of(&dst)?
        }; // la connexion de destination est fermée ici
        if verdict != "ok" {
            return Err(format!("La copie n'a pas passé la vérification d'intégrité : {verdict}"));
        }
        files::sync_file(&target)
    })();
    if let Err(e) = made {
        let _ = fs::remove_file(&target);
        return Err(e);
    }

    let (sha256, size_bytes) = match files::sha256_file(&target) {
        Ok(h) => (h, fs::metadata(&target).map(|m| m.len()).unwrap_or(0)),
        Err(e) => {
            let _ = fs::remove_file(&target);
            return Err(e);
        }
    };

    let secondary = secondary.map(|dir| {
        let attempt = (|| -> Result<PathBuf, String> {
            fs::create_dir_all(dir).map_err(|e| format!("Dossier secondaire inaccessible : {e}"))?;
            let dest = files::free_backup_path(dir, &stamp, kind);
            files::copy_durable(&target, &dest)?;
            if files::sha256_file(&dest)? != sha256 {
                let _ = fs::remove_file(&dest);
                return Err("La copie secondaire ne correspond pas à l'original.".into());
            }
            Ok(dest)
        })();
        match attempt {
            Ok(p) => SecondaryResult { ok: true, file: Some(p.to_string_lossy().to_string()), error: None },
            Err(e) => SecondaryResult { ok: false, file: None, error: Some(e) },
        }
    });

    Ok(Created { file: target.to_string_lossy().to_string(), size_bytes, sha256, secondary })
}

fn schema_version_of(path: &Path) -> Option<i64> {
    let c = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
    let v: String = c.query_row("SELECT value FROM meta WHERE key = 'schema_version'", [], |r| r.get(0)).ok()?;
    v.trim().parse().ok()
}

/// Liste les sauvegardes d'un dossier. Le dossier est la source de vérité (backups_log n'est qu'un historique).
pub fn list_backups(dir: &Path) -> Result<Vec<Entry>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for e in fs::read_dir(dir).map_err(|e| format!("Lecture du dossier impossible : {e}"))? {
        let e = e.map_err(|e| e.to_string())?;
        let name = e.file_name().to_string_lossy().to_string();
        let Some(p) = parse_backup_name(&name) else { continue };
        let path = e.path();
        if !path.is_file() {
            continue;
        }
        out.push(Entry {
            file: path.to_string_lossy().to_string(),
            name,
            kind: p.kind,
            stamp: p.stamp,
            seq: p.seq,
            size_bytes: e.metadata().map(|m| m.len()).unwrap_or(0),
            schema_version: schema_version_of(&path),
        });
    }
    out.sort_by(|a, b| (a.stamp.as_str(), a.seq).cmp(&(b.stamp.as_str(), b.seq)));
    Ok(out)
}

/// Contrôle un fichier sans le modifier : lisible par SQLite, integrity_check, empreinte, numéro de schéma.
pub fn verify_file(path: &Path) -> Result<Verified, String> {
    let size_bytes = fs::metadata(path).map_err(|e| format!("Fichier introuvable : {e}"))?.len();
    let sha256 = files::sha256_file(path)?;
    let probe = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| e.to_string())
        .and_then(|c| integrity_of(&c));
    let (ok, message) = match probe {
        Ok(v) if v == "ok" => (true, "ok".to_string()),
        Ok(v) => (false, v),
        Err(e) => (false, e),
    };
    let schema_version = if ok { schema_version_of(path) } else { None };
    Ok(Verified { ok, message, sha256, schema_version, size_bytes })
}

fn reopen_checked(open: &dyn Fn(&Path) -> Result<Connection, String>, db_file: &Path) -> Result<Connection, String> {
    let c = open(db_file)?;
    let verdict = integrity_of(&c)?;
    if verdict != "ok" {
        return Err(format!("La base restaurée ne passe pas la vérification d'intégrité : {verdict}"));
    }
    Ok(c)
}

/// Remplace la base par `source`. La connexion est fermée, le fichier remplacé d'un coup, puis rouvert et contrôlé.
/// Si une étape échoue : retour à `rollback` (la sauvegarde pre-restore) quand il est fourni.
/// Sans connexion au départ (base illisible), l'ancien fichier est conservé sous le nom ba-mentor.damaged-<date>.db.
pub fn restore_database(
    slot: &mut Option<Connection>,
    db_file: &Path,
    source: &Path,
    rollback: Option<&Path>,
    open: &dyn Fn(&Path) -> Result<Connection, String>,
) -> Result<(), String> {
    let v = verify_file(source)?;
    if !v.ok {
        return Err(format!("Le fichier choisi est inutilisable : {}", v.message));
    }
    if v.schema_version.is_none() {
        return Err("Ce fichier n'est pas une base BA-Mentor (numéro de schéma absent).".into());
    }

    let had_connection = slot.is_some();
    drop(slot.take()); // ferme la connexion
    if !had_connection && db_file.exists() {
        let aside = db_file.with_file_name(format!("ba-mentor.damaged-{}.db", files::utc_stamp_now()));
        let _ = fs::rename(db_file, aside);
    }
    files::remove_side_files(db_file);

    let attempt = files::replace_file(source, db_file).and_then(|_| reopen_checked(open, db_file));
    match attempt {
        Ok(c) => {
            *slot = Some(c);
            Ok(())
        }
        Err(e) => {
            if let Some(rb) = rollback {
                files::remove_side_files(db_file);
                match files::replace_file(rb, db_file).and_then(|_| reopen_checked(open, db_file)) {
                    Ok(c) => {
                        *slot = Some(c);
                        Err(format!("Restauration échouée, la base précédente a été rétablie : {e}"))
                    }
                    Err(e2) => Err(format!("Restauration échouée ({e}) et retour arrière impossible ({e2}). La sauvegarde pre-restore reste disponible dans le dossier backups."))
                }
            } else {
                // Rien n'a été remplacé si la copie a échoué : on tente de retrouver la base d'origine.
                if let Ok(c) = reopen_checked(open, db_file) {
                    *slot = Some(c);
                }
                Err(e)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn temp_dir(tag: &str) -> PathBuf {
        static N: AtomicU32 = AtomicU32::new(0);
        let p = std::env::temp_dir().join(format!("bamentor-backup-{}-{}-{}", std::process::id(), tag, N.fetch_add(1, Ordering::SeqCst)));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn open(path: &Path) -> Result<Connection, String> {
        let c = Connection::open(path).map_err(|e| e.to_string())?;
        c.execute_batch("PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;").map_err(|e| e.to_string())?;
        Ok(c)
    }

    fn make_db(path: &Path, schema: i64, rows: &[&str]) -> Connection {
        let c = open(path).unwrap();
        c.execute_batch("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS t (v TEXT);").unwrap();
        c.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)", [schema.to_string()]).unwrap();
        for r in rows {
            c.execute("INSERT INTO t (v) VALUES (?)", [r]).unwrap();
        }
        c
    }

    fn rows(c: &Connection) -> Vec<String> {
        let mut s = c.prepare("SELECT v FROM t ORDER BY rowid").unwrap();
        s.query_map([], |r| r.get::<_, String>(0)).unwrap().map(|r| r.unwrap()).collect()
    }

    #[test]
    fn create_list_verify_roundtrip_with_secondary() {
        let root = temp_dir("create");
        let conn = make_db(&root.join("ba-mentor.db"), 1, &["a", "b"]);
        let backups = root.join("backups");
        let secondary = root.join("secondaire");
        let c = create_backup(&conn, &backups, "manual", Some(&secondary)).unwrap();
        assert!(c.size_bytes > 0);
        assert_eq!(c.sha256, files::sha256_file(Path::new(&c.file)).unwrap());
        let sec = c.secondary.unwrap();
        assert!(sec.ok, "{:?}", sec.error);
        assert_eq!(files::sha256_file(Path::new(&sec.file.unwrap())).unwrap(), c.sha256);

        let list = list_backups(&backups).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!((list[0].kind.as_str(), list[0].schema_version), ("manual", Some(1)));

        let v = verify_file(Path::new(&c.file)).unwrap();
        assert!(v.ok);
        assert_eq!(v.sha256, c.sha256);
        assert_eq!(v.schema_version, Some(1));
        // Deux sauvegardes dans la même seconde ne s'écrasent pas.
        let c2 = create_backup(&conn, &backups, "manual", None).unwrap();
        assert_ne!(c.file, c2.file);
        assert_eq!(list_backups(&backups).unwrap().len(), 2);
    }

    #[test]
    fn secondary_failure_does_not_fail_primary() {
        let root = temp_dir("secfail");
        let conn = make_db(&root.join("ba-mentor.db"), 1, &["a"]);
        let blocker = root.join("fichier");
        fs::write(&blocker, b"x").unwrap();
        // Un dossier « sous » un fichier ne peut pas être créé.
        let c = create_backup(&conn, &root.join("backups"), "auto", Some(&blocker.join("sous"))).unwrap();
        let sec = c.secondary.unwrap();
        assert!(!sec.ok && sec.error.is_some());
        assert!(Path::new(&c.file).exists());
    }

    #[test]
    fn unknown_kind_is_refused() {
        let root = temp_dir("kind");
        let conn = make_db(&root.join("ba-mentor.db"), 1, &[]);
        assert!(create_backup(&conn, &root.join("backups"), "../x", None).is_err());
    }

    #[test]
    fn verify_refuses_garbage_and_missing_files() {
        let root = temp_dir("garbage");
        let junk = root.join("junk.db");
        fs::write(&junk, vec![7u8; 5000]).unwrap();
        let v = verify_file(&junk).unwrap();
        assert!(!v.ok && v.schema_version.is_none());
        assert!(verify_file(&root.join("absent.db")).is_err());
    }

    #[test]
    fn restore_replaces_content_and_keeps_connection_usable() {
        let root = temp_dir("restore");
        let db_file = root.join("ba-mentor.db");
        let conn = make_db(&db_file, 1, &["avant"]);
        let backup = create_backup(&conn, &root.join("backups"), "manual", None).unwrap();
        conn.execute("INSERT INTO t (v) VALUES ('après')", []).unwrap();
        assert_eq!(rows(&conn), vec!["avant", "après"]);
        let mut slot = Some(conn);
        restore_database(&mut slot, &db_file, Path::new(&backup.file), None, &open).unwrap();
        assert_eq!(rows(slot.as_ref().unwrap()), vec!["avant"]);
        assert!(!root.join("ba-mentor.db.restoring").exists());
    }

    #[test]
    fn restore_refuses_bad_sources_without_touching_the_current_base() {
        let root = temp_dir("restore-bad");
        let db_file = root.join("ba-mentor.db");
        let conn = make_db(&db_file, 1, &["intact"]);
        let junk = root.join("junk.db");
        fs::write(&junk, vec![7u8; 5000]).unwrap();
        let foreign = root.join("etranger.db");
        {
            let c = open(&foreign).unwrap();
            c.execute_batch("CREATE TABLE x (a)").unwrap(); // SQLite valide, mais pas une base BA-Mentor
        }
        let mut slot = Some(conn);
        assert!(restore_database(&mut slot, &db_file, &junk, None, &open).is_err());
        assert!(restore_database(&mut slot, &db_file, &foreign, None, &open).is_err());
        assert_eq!(rows(slot.as_ref().unwrap()), vec!["intact"], "la connexion et les données n'ont pas bougé");
    }

    #[test]
    fn restore_rolls_back_to_pre_restore_when_reopening_the_restored_file_fails() {
        let root = temp_dir("restore-rollback");
        let db_file = root.join("ba-mentor.db");
        let conn = make_db(&db_file, 1, &["courant"]);
        let source = create_backup(&make_db(&root.join("autre.db"), 1, &["ancien"]), &root.join("backups"), "manual", None).unwrap();
        let rollback = create_backup(&conn, &root.join("backups"), "pre-restore", None).unwrap();
        let calls = Cell::new(0);
        let flaky = |p: &Path| -> Result<Connection, String> {
            calls.set(calls.get() + 1);
            if calls.get() == 1 { Err("échec simulé".into()) } else { open(p) }
        };
        let mut slot = Some(conn);
        let err = restore_database(&mut slot, &db_file, Path::new(&source.file), Some(Path::new(&rollback.file)), &flaky).unwrap_err();
        assert!(err.contains("rétablie"), "{err}");
        assert_eq!(rows(slot.as_ref().unwrap()), vec!["courant"]);
    }

    #[test]
    fn restore_without_connection_keeps_the_damaged_file_aside() {
        let root = temp_dir("restore-damaged");
        let db_file = root.join("ba-mentor.db");
        fs::write(&db_file, vec![9u8; 4096]).unwrap();
        let good = make_db(&root.join("bonne.db"), 1, &["sauvé"]);
        let source = create_backup(&good, &root.join("backups"), "manual", None).unwrap();
        let mut slot: Option<Connection> = None;
        restore_database(&mut slot, &db_file, Path::new(&source.file), None, &open).unwrap();
        assert_eq!(rows(slot.as_ref().unwrap()), vec!["sauvé"]);
        let aside: Vec<_> = fs::read_dir(&root).unwrap().filter_map(|e| e.ok()).filter(|e| e.file_name().to_string_lossy().starts_with("ba-mentor.damaged-")).collect();
        assert_eq!(aside.len(), 1);
    }
}
