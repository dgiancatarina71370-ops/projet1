// BA-Mentor Portable Ultimate Edition - noyau Tauri (lot V2.1).
// Aucune logique métier ici : ouvrir la base, exécuter des instructions SQL avec paramètres liés, sauvegarder, et ouvrir la fenêtre.
// Les requêtes, les migrations et les règles vivent côté TypeScript (src/data).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{backup::Backup, params_from_iter, types::Value as SqlValue, types::ValueRef, Connection};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::{
    fs,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

/// Connexion unique, ou la raison pour laquelle elle n'a pas pu être ouverte (affichée par l'interface).
struct Db {
    conn: Mutex<Option<Connection>>,
    error: Option<String>,
}

struct Paths {
    data_dir: PathBuf,
    db_file: PathBuf,
}

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

fn open_db(path: &PathBuf) -> Result<Connection, String> {
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
        None => Err(db.error.clone().unwrap_or_else(|| "Base indisponible.".into())),
    }
}

fn utc_stamp() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    stamp_from_secs(secs)
}

fn stamp_from_secs(secs: i64) -> String {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // Date civile à partir du nombre de jours depuis 1970 (algorithme de H. Hinnant).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mth = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if mth <= 2 { 1 } else { 0 };
    format!("{y:04}{mth:02}{d:02}-{h:02}{m:02}{s:02}")
}

#[tauri::command]
fn app_info(app: tauri::AppHandle, paths: State<'_, Paths>, db: State<'_, Db>) -> Value {
    json!({
        "version": app.package_info().version.to_string(),
        "dataDir": paths.data_dir.to_string_lossy(),
        "dbFile": paths.db_file.to_string_lossy(),
        "mode": "portable",
        "dbError": db.error,
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

/// Sauvegarde cohérente par l'API de sauvegarde en ligne de SQLite, vérifiée par integrity_check.
/// (Empreinte SHA-256, rotation, restauration et déclencheurs : lot V2.2.)
#[tauri::command]
async fn db_backup(db: State<'_, Db>, paths: State<'_, Paths>, kind: String) -> Result<Value, String> {
    if !["manual", "auto", "pre-migration", "pre-restore"].contains(&kind.as_str()) {
        return Err("Type de sauvegarde inconnu.".into());
    }
    let dir = paths.data_dir.join("backups");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = utc_stamp();
    let mut target = dir.join(format!("ba-mentor-{stamp}-{kind}.db"));
    let mut n = 2;
    while target.exists() {
        target = dir.join(format!("ba-mentor-{stamp}-{kind}-{n}.db"));
        n += 1;
    }
    with_conn(&db, |conn| {
        let verdict = {
            let mut dst = Connection::open(&target).map_err(|e| e.to_string())?;
            {
                let b = Backup::new(conn, &mut dst).map_err(|e| e.to_string())?;
                b.run_to_completion(100, Duration::from_millis(0), None).map_err(|e| e.to_string())?;
            }
            dst.query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?
        };
        if verdict != "ok" {
            let _ = fs::remove_file(&target);
            return Err(format!("La copie n'a pas passé la vérification d'intégrité : {verdict}"));
        }
        let size = fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
        Ok(json!({ "file": target.to_string_lossy(), "sizeBytes": size }))
    })
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = exe_dir().join("BAMentorData");
            let _ = fs::create_dir_all(&data_dir);
            let db_file = data_dir.join("ba-mentor.db");
            let (conn, error) = match open_db(&db_file) {
                Ok(c) => (Some(c), None),
                Err(e) => (None, Some(e)),
            };
            app.manage(Db { conn: Mutex::new(conn), error });
            app.manage(Paths { data_dir: data_dir.clone(), db_file });
            // Données de WebView2 à côté de l'exécutable : rien n'est écrit dans le profil de l'utilisateur (validé par T4).
            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("BA-Mentor Portable Ultimate Edition")
                .inner_size(1200.0, 800.0)
                .min_inner_size(900.0, 600.0)
                .data_directory(data_dir.join("webview"))
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_info, db_select, db_execute, db_transaction, db_backup])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de BA-Mentor");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamp_matches_known_dates() {
        assert_eq!(stamp_from_secs(0), "19700101-000000");
        assert_eq!(stamp_from_secs(1_700_000_000), "20231114-221320");
        assert_eq!(stamp_from_secs(1_709_164_800), "20240229-000000");
    }

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
