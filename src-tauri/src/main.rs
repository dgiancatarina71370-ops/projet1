// BA-Mentor V2.0 - programme de validation technique. Aucun code metier.
// Objectifs : (1) l'exe unique demarre depuis une cle USB, (2) les donnees restent a cote de l'exe,
// (3) WebView2 n'ecrit pas dans le profil utilisateur, (4) SQLite en journal DELETE + synchronous FULL tient aux coupures.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{backup::Backup, Connection};
use serde_json::{json, Value};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{WebviewUrl, WebviewWindowBuilder};

static WRITER_ON: AtomicBool = AtomicBool::new(false);
static WRITER_COUNT: AtomicU64 = AtomicU64::new(0);

fn exe_dir() -> PathBuf {
    std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf())).unwrap_or_else(|| PathBuf::from("."))
}
fn data_dir() -> PathBuf {
    let d = exe_dir().join("BAMentorData");
    let _ = fs::create_dir_all(&d);
    d
}
fn open(mode: &str) -> Result<Connection, String> {
    let mode = match mode { "DELETE" => "DELETE", "WAL" => "WAL", _ => return Err("mode inconnu".into()) };
    let c = Connection::open(data_dir().join(format!("poc-{}.db", mode.to_lowercase()))).map_err(|e| e.to_string())?;
    c.pragma_update(None, "journal_mode", mode).map_err(|e| e.to_string())?;
    c.pragma_update(None, "synchronous", "FULL").map_err(|e| e.to_string())?;
    c.execute_batch("CREATE TABLE IF NOT EXISTS t(id INTEGER PRIMARY KEY, v TEXT);").map_err(|e| e.to_string())?;
    Ok(c)
}
fn integrity(c: &Connection) -> String {
    c.query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0)).unwrap_or_else(|e| e.to_string())
}
fn now_stamp() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) }

#[tauri::command]
fn probe() -> Value {
    let dir = exe_dir();
    let probe_file = data_dir().join("write-probe.tmp");
    let writable = fs::write(&probe_file, b"ok").is_ok();
    let _ = fs::remove_file(&probe_file);
    json!({
        "exe_dir": dir.to_string_lossy(), "data_dir": data_dir().to_string_lossy(),
        "data_dir_writable": writable, "os": std::env::consts::OS, "arch": std::env::consts::ARCH,
        "webview_data_dir": data_dir().join("webview").to_string_lossy(),
    })
}

#[tauri::command]
fn db_test(mode: String) -> Result<Value, String> {
    let c = open(&mode)?;
    let t = Instant::now();
    c.execute_batch("BEGIN").map_err(|e| e.to_string())?;
    for _ in 0..5000 { c.execute("INSERT INTO t(v) VALUES(?1)", ["x".repeat(80)]).map_err(|e| e.to_string())?; }
    c.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    let bulk = t.elapsed().as_millis() as u64;
    let t = Instant::now();
    for _ in 0..200 { c.execute("INSERT INTO t(v) VALUES(?1)", ["y".repeat(80)]).map_err(|e| e.to_string())?; }
    let single = t.elapsed().as_millis() as u64;
    let rows: i64 = c.query_row("SELECT count(*) FROM t", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let jm: String = c.query_row("PRAGMA journal_mode", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    Ok(json!({"mode": mode, "journal_mode_actif": jm, "ms_5000_lignes_1_tx": bulk, "ms_200_commits": single, "lignes": rows, "integrity_check": integrity(&c)}))
}

#[tauri::command]
fn db_backup() -> Result<Value, String> {
    let src = open("DELETE")?;
    let dir = data_dir().join("backups");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("poc-{}.db", now_stamp()));
    let t = Instant::now();
    let mut dst = Connection::open(&path).map_err(|e| e.to_string())?;
    {
        let b = Backup::new(&src, &mut dst).map_err(|e| e.to_string())?;
        b.run_to_completion(100, Duration::from_millis(0), None).map_err(|e| e.to_string())?;
    }
    let rows: i64 = dst.query_row("SELECT count(*) FROM t", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    Ok(json!({"fichier": path.to_string_lossy(), "ms": t.elapsed().as_millis() as u64, "lignes_copiees": rows, "integrity_check": integrity(&dst)}))
}

// Test du retrait de cle : ecrit une ligne validee toutes les 50 ms ; on debranche la cle pendant l'ecriture.
#[tauri::command]
fn writer_start() -> Result<Value, String> {
    if WRITER_ON.swap(true, Ordering::SeqCst) { return Ok(json!({"deja_demarre": true})); }
    WRITER_COUNT.store(0, Ordering::SeqCst);
    let c = open("DELETE")?;
    std::thread::spawn(move || {
        while WRITER_ON.load(Ordering::SeqCst) {
            if c.execute("INSERT INTO t(v) VALUES('writer')", []).is_err() { WRITER_ON.store(false, Ordering::SeqCst); break; }
            WRITER_COUNT.fetch_add(1, Ordering::SeqCst);
            std::thread::sleep(Duration::from_millis(50));
        }
    });
    Ok(json!({"demarre": true}))
}
#[tauri::command]
fn writer_status() -> Value { json!({"actif": WRITER_ON.load(Ordering::SeqCst), "lignes_validees": WRITER_COUNT.load(Ordering::SeqCst)}) }
#[tauri::command]
fn writer_stop() -> Value { WRITER_ON.store(false, Ordering::SeqCst); json!({"arrete": true}) }

// Apres retrait de cle puis relance : integrite + nombre de lignes (a comparer au dernier compteur affiche).
#[tauri::command]
fn db_check() -> Result<Value, String> {
    let c = open("DELETE")?;
    let rows: i64 = c.query_row("SELECT count(*) FROM t WHERE v='writer'", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    Ok(json!({"integrity_check": integrity(&c), "lignes_writer": rows}))
}

#[tauri::command]
fn save_report(text: String) -> Result<String, String> {
    let p = data_dir().join(format!("rapport-v20-{}.json", now_stamp()));
    fs::write(&p, text).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Dossier de donnees WebView2 a cote de l'exe : sinon WebView2 ecrit dans %LOCALAPPDATA%.
            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("BA-Mentor - validation technique V2.0")
                .inner_size(980.0, 760.0)
                .data_directory(data_dir().join("webview"))
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![probe, db_test, db_backup, writer_start, writer_status, writer_stop, db_check, save_report])
        .run(tauri::generate_context!())
        .expect("erreur au lancement");
}
