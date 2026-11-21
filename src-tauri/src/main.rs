// BA-Mentor Portable Ultimate Edition - noyau Tauri (lot V2.2b).
// Aucune logique métier ici : ouvrir la base, exécuter des instructions SQL avec paramètres liés, sauvegarder, restaurer, verrouiller, ouvrir la fenêtre.
// Les requêtes, les migrations et les règles (quand sauvegarder, combien conserver) vivent côté TypeScript (src/data).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backup;
mod files;

use rusqlite::{params_from_iter, types::Value as SqlValue, types::ValueRef, Connection};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{atomic::{AtomicBool, Ordering}, Mutex},
    time::Duration,
};
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

/// Connexion unique, ou la raison pour laquelle elle n'a pas pu être ouverte (affichée par l'interface).
struct Db {
    conn: Mutex<Option<Connection>>,
    error: Mutex<Option<String>>,
    /// Un autre BA-Mentor tient déjà les données : cette instance ne doit rien écrire ni restaurer.
    locked_out: bool,
    /// Le verrou n'a pas pu être posé (système de fichiers sans verrou) : l'application fonctionne, avec un avertissement.
    lock_warning: Option<String>,
}

struct Paths {
    data_dir: PathBuf,
    db_file: PathBuf,
    backups_dir: PathBuf,
}

/// Garde le fichier de verrou ouvert aussi longtemps que l'application.
#[allow(dead_code)]
struct LockHolder(Option<fs::File>);

/// Passe à vrai à la première demande de fermeture : la seconde ferme sans attendre.
struct Closing(AtomicBool);

#[derive(Deserialize)]
struct Stmt {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn open_db(path: &Path) -> Result<Connection, String> {
    let c = Connection::open(path).map_err(|e| format!("Ouverture de la base impossible : {e}"))?;
    // Mode de journal classique et écriture synchrone : choix validé par le lot V2.0 pour une base sur clé USB.
    c.execute_batch("PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
        .map_err(|e| format!("Réglage de la base impossible : {e}"))?;
    Ok(c)
}

/// Retire espaces et commentaires de tête, puis renvoie le premier mot en majuscules.
fn first_keyword(sql: &str) -> String {
    let mut s = sql;
    loop {
        s = s.trim_start();
        if s.starts_with("--") {
            s = s.find('\n').map(|i| &s[i + 1..]).unwrap_or("");
        } else if s.starts_with("/*") {
            s = s.find("*/").map(|i| &s[i + 2..]).unwrap_or("");
        } else {
            break;
        }
    }
    s.chars().take_while(|c| c.is_ascii_alphabetic() || *c == '_').collect::<String>().to_uppercase()
}

/// Défense en profondeur : le garde TypeScript refuse déjà ces instructions, le noyau les refuse aussi.
fn guard(sql: &str) -> Result<(), String> {
    match first_keyword(sql).as_str() {
        "" => Err("Instruction SQL vide.".into()),
        kw @ ("ATTACH" | "DETACH" | "PRAGMA" | "VACUUM") => Err(format!("Instruction refusée : {kw}. Aucune donnée ne peut vivre hors du fichier de base.")),
        _ => Ok(()),
    }
}

fn to_sql_values(params: &[Value]) -> Result<Vec<SqlValue>, String> {
    params
        .iter()
        .map(|v| match v {
            Value::Null => Ok(SqlValue::Null),
            Value::Bool(b) => Ok(SqlValue::Integer(*b as i64)),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Ok(SqlValue::Integer(i))
                } else if let Some(f) = n.as_f64() {
                    Ok(SqlValue::Real(f))
                } else {
                    Err("Nombre non pris en charge.".to_string())
                }
            }
            Value::String(s) => Ok(SqlValue::Text(s.clone())),
            _ => Err("Paramètre non pris en charge : seuls null, nombre et texte sont acceptés.".to_string()),
        })
        .collect()
}

fn with_conn<T>(db: &Db, f: impl FnOnce(&mut Connection) -> Result<T, String>) -> Result<T, String> {
    let mut guard = db.conn.lock().map_err(|_| "Verrou de la base indisponible.".to_string())?;
    match guard.as_mut() {
        Some(c) => f(c),
        None => Err(db.error.lock().ok().and_then(|e| e.clone()).unwrap_or_else(|| "Base indisponible.".into())),
    }
}

#[tauri::command]
fn app_info(app: tauri::AppHandle, paths: State<'_, Paths>, db: State<'_, Db>) -> Value {
    json!({
        "version": app.package_info().version.to_string(),
        "dataDir": paths.data_dir.to_string_lossy(),
        "dbFile": paths.db_file.to_string_lossy(),
        "mode": "portable",
        "dbError": db.error.lock().ok().and_then(|e| e.clone()),
        "lockWarning": db.lock_warning,
        "lockedOut": db.locked_out,
        "backupsDir": paths.backups_dir.to_string_lossy(),
    })
}

#[tauri::command]
async fn db_select(db: State<'_, Db>, sql: String, params: Vec<Value>) -> Result<Vec<Map<String, Value>>, String> {
    guard(&sql)?;
    let values = to_sql_values(&params)?;
    with_conn(&db, |conn| {
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        if !stmt.readonly() {
            return Err("Cette voie ne permet que la lecture : utiliser mutate() pour écrire.".into());
        }
        let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let mut rows = stmt.query(params_from_iter(values)).map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let mut obj = Map::new();
            for (i, name) in names.iter().enumerate() {
                let v = match row.get_ref(i).map_err(|e| e.to_string())? {
                    ValueRef::Null => Value::Null,
                    ValueRef::Integer(n) => json!(n),
                    ValueRef::Real(f) => json!(f),
                    ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).to_string()),
                    ValueRef::Blob(_) => return Err("Les données binaires ne sont pas prises en charge.".into()),
                };
                obj.insert(name.clone(), v);
            }
            out.push(obj);
        }
        Ok(out)
    })
}

#[tauri::command]
async fn db_execute(db: State<'_, Db>, sql: String, params: Vec<Value>) -> Result<Value, String> {
    guard(&sql)?;
    let values = to_sql_values(&params)?;
    with_conn(&db, |conn| {
        let changes = conn.execute(&sql, params_from_iter(values)).map_err(|e| e.to_string())?;
        Ok(json!({ "changes": changes, "lastInsertRowid": conn.last_insert_rowid() }))
    })
}

/// Toutes les instructions dans une seule transaction : si l'une échoue, rien n'est écrit.
#[tauri::command]
async fn db_transaction(db: State<'_, Db>, statements: Vec<Stmt>) -> Result<Vec<Value>, String> {
    with_conn(&db, |conn| {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let mut out = Vec::with_capacity(statements.len());
        for (i, s) in statements.iter().enumerate() {
            guard(&s.sql).map_err(|e| format!("instruction {} : {e}", i + 1))?;
            let values = to_sql_values(&s.params).map_err(|e| format!("instruction {} : {e}", i + 1))?;
            let changes = tx.execute(&s.sql, params_from_iter(values)).map_err(|e| format!("instruction {} : {e}", i + 1))?;
            out.push(json!({ "changes": changes, "lastInsertRowid": tx.last_insert_rowid() }));
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(out)
    })
}

fn refuse_if_locked_out(db: &Db) -> Result<(), String> {
    if db.locked_out {
        Err("BA-Mentor est déjà ouvert sur ces données : cette fenêtre ne peut ni sauvegarder, ni restaurer, ni supprimer.".into())
    } else {
        Ok(())
    }
}

/// Sauvegarde cohérente, vérifiée, avec empreinte SHA-256 ; copie facultative dans un dossier secondaire.
#[tauri::command]
async fn backup_create(db: State<'_, Db>, paths: State<'_, Paths>, kind: String, secondary_dir: Option<String>) -> Result<backup::Created, String> {
    refuse_if_locked_out(&db)?;
    let secondary = secondary_dir.filter(|d| !d.trim().is_empty()).map(PathBuf::from);
    with_conn(&db, |conn| backup::create_backup(conn, &paths.backups_dir, &kind, secondary.as_deref()))
}

/// Liste d'un dossier de sauvegardes (le dossier de l'application par défaut, ou le dossier secondaire).
#[tauri::command]
async fn backup_list(paths: State<'_, Paths>, dir: Option<String>) -> Result<Vec<backup::Entry>, String> {
    match dir.filter(|d| !d.trim().is_empty()) {
        Some(d) => backup::list_backups(Path::new(&d)),
        None => backup::list_backups(&paths.backups_dir),
    }
}

#[tauri::command]
async fn backup_verify(file: String) -> Result<backup::Verified, String> {
    backup::verify_file(Path::new(&file))
}

/// Remplace la base par une sauvegarde (ou par un fichier venu d'un autre poste). `rollback_file` : copie pre-restore pour le retour arrière.
#[tauri::command]
async fn backup_restore(db: State<'_, Db>, paths: State<'_, Paths>, file: String, rollback_file: Option<String>) -> Result<(), String> {
    refuse_if_locked_out(&db)?;
    let mut slot = db.conn.lock().map_err(|_| "Verrou de la base indisponible.".to_string())?;
    let rollback = rollback_file.map(PathBuf::from);
    backup::restore_database(&mut slot, &paths.db_file, Path::new(&file), rollback.as_deref(), &|p| open_db(p))?;
    if let Ok(mut e) = db.error.lock() {
        *e = None;
    }
    Ok(())
}

/// Supprime une sauvegarde : uniquement un fichier nommé comme une sauvegarde, dans le dossier de l'application ou le dossier secondaire.
#[tauri::command]
async fn backup_delete(db: State<'_, Db>, paths: State<'_, Paths>, file: String, secondary_dir: Option<String>) -> Result<(), String> {
    refuse_if_locked_out(&db)?;
    let mut allowed = vec![paths.backups_dir.clone()];
    if let Some(d) = secondary_dir.filter(|d| !d.trim().is_empty()) {
        allowed.push(PathBuf::from(d));
    }
    let path = PathBuf::from(&file);
    files::check_deletable(&path, &allowed)?;
    fs::remove_file(&path).map_err(|e| format!("Suppression impossible : {e}"))
}

/// Boîte de dialogue système : choisir une base .db (restauration depuis un autre poste).
#[tauri::command]
async fn pick_database_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().add_filter("Base BA-Mentor", &["db"]).blocking_pick_file();
    match picked {
        Some(p) => Ok(Some(p.into_path().map_err(|e| e.to_string())?.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

/// Boîte de dialogue système : choisir un dossier (dossier de sauvegarde secondaire).
#[tauri::command]
async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    match picked {
        Some(p) => Ok(Some(p.into_path().map_err(|e| e.to_string())?.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

/// Fichier texte lu par le noyau pour l'import V1 : l'interface reçoit le texte et l'empreinte, jamais un chemin à rouvrir.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PickedText {
    path: String,
    name: String,
    size_bytes: u64,
    sha256: String,
    text: String,
}

/// Limite de taille d'un export V1 (50 Mo) : un export réel fait quelques dizaines de Ko.
const MAX_IMPORT_BYTES: u64 = 50 * 1024 * 1024;

/// Boîte de dialogue système : choisir un export JSON de la V1, puis le lire (UTF-8, 50 Mo au plus). None si l'utilisateur annule.
#[tauri::command]
async fn import_pick_file(app: tauri::AppHandle) -> Result<Option<PickedText>, String> {
    let picked = app.dialog().file().add_filter("Export BA-Mentor V1 (JSON)", &["json"]).blocking_pick_file();
    let Some(p) = picked else { return Ok(None) };
    let path = p.into_path().map_err(|e| e.to_string())?;
    let read = files::read_text_limited(&path, MAX_IMPORT_BYTES)?;
    Ok(Some(PickedText {
        name: path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        path: path.to_string_lossy().to_string(),
        size_bytes: read.size,
        sha256: read.sha256,
        text: read.text,
    }))
}

/// Fermeture demandée par l'interface une fois la sauvegarde de fermeture faite.
#[tauri::command]
fn app_exit(app: tauri::AppHandle) {
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = exe_dir().join("BAMentorData");
            let _ = fs::create_dir_all(&data_dir);
            let db_file = data_dir.join("ba-mentor.db");
            let backups_dir = data_dir.join("backups");

            // Un seul BA-Mentor à la fois sur un dossier de données : la restauration remplace le fichier de base.
            let (lock, locked_out, lock_warning) = match files::lock_data_dir(&data_dir) {
                Ok(f) => (Some(f), false, None),
                Err(files::LockError::AlreadyRunning) => (None, true, None),
                Err(files::LockError::Io(e)) => (None, false, Some(format!("Protection contre l'ouverture multiple indisponible : {e}"))),
            };

            // Reste d'une restauration interrompue (clé retirée avant le renommage) : la base d'origine est intacte, ce fichier est inutile.
            // Seulement si nous détenons le verrou : une autre instance pourrait être en pleine restauration.
            if !locked_out {
                let _ = fs::remove_file(data_dir.join("ba-mentor.db.restoring"));
            }

            let (conn, error) = if locked_out {
                (None, Some("BA-Mentor est déjà ouvert sur ces données (autre fenêtre, ou autre poste utilisant cette clé). Fermez l'autre instance puis relancez BA-Mentor.".to_string()))
            } else {
                match open_db(&db_file) {
                    Ok(c) => (Some(c), None),
                    Err(e) => (None, Some(e)),
                }
            };
            app.manage(Db { conn: Mutex::new(conn), error: Mutex::new(error), locked_out, lock_warning });
            app.manage(Paths { data_dir: data_dir.clone(), db_file, backups_dir });
            app.manage(LockHolder(lock));
            app.manage(Closing(AtomicBool::new(false)));

            // Données de WebView2 à côté de l'exécutable : rien n'est écrit dans le profil de l'utilisateur (validé par T4).
            // Une instance refusée utilise son propre dossier pour ne pas partager le profil de l'instance en cours.
            let webview_dir = data_dir.join(if locked_out { "webview-secondaire" } else { "webview" });
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("BA-Mentor Portable Ultimate Edition")
                .inner_size(1200.0, 800.0)
                .min_inner_size(900.0, 600.0)
                .data_directory(webview_dir)
                .build()?;

            // Fermeture : on laisse l'interface faire la sauvegarde de fermeture, puis elle demande app_exit.
            // Filet de sécurité : si l'interface ne répond pas en 15 s, on ferme quand même. Un second clic sur la croix ferme tout de suite.
            let handle = app.handle().clone();
            let win = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let closing = handle.state::<Closing>();
                    if closing.0.swap(true, Ordering::SeqCst) {
                        return;
                    }
                    api.prevent_close();
                    let _ = win.eval("window.dispatchEvent(new Event('bamentor-close'))");
                    let h = handle.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_secs(15));
                        h.exit(0);
                    });
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            db_select,
            db_execute,
            db_transaction,
            backup_create,
            backup_list,
            backup_verify,
            backup_restore,
            backup_delete,
            pick_database_file,
            pick_folder,
            import_pick_file,
            app_exit
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de BA-Mentor");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guard_refuses_attach_pragma_and_empty() {
        assert!(guard("ATTACH DATABASE 'x.db' AS x").is_err());
        assert!(guard("  /* commentaire */ attach database 'x.db' as x").is_err());
        assert!(guard("-- commentaire\nDETACH DATABASE x").is_err());
        assert!(guard("PRAGMA foreign_keys = OFF").is_err());
        assert!(guard("   ").is_err());
        assert!(guard("SELECT 1").is_ok());
        assert!(guard("INSERT INTO projects (name) VALUES (?)").is_ok());
    }

    #[test]
    fn first_keyword_skips_comments() {
        assert_eq!(first_keyword("/* a */ -- b\n  select 1"), "SELECT");
    }
}
