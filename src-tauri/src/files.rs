// Logique de fichiers du noyau (lot V2.2a) : uniquement la bibliothèque standard, donc testable seule.
// Noms de sauvegarde, empreinte SHA-256, remplacement atomique d'un fichier, verrou d'instance, garde de suppression.
// Aucune logique métier : ce sont des primitives que pilote le code TypeScript (src/data/backup-service.ts).
use std::{
    fs::{self, File, OpenOptions, TryLockError},
    io::{Read, Write},
    path::{Path, PathBuf},
    thread,
    time::Duration,
};

pub const KINDS: [&str; 4] = ["manual", "auto", "pre-migration", "pre-restore"];

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/// AAAAMMJJ-HHMMSS (UTC) à partir de secondes Unix.
pub fn stamp_from_secs(secs: i64) -> String {
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

pub fn utc_stamp_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    stamp_from_secs(secs)
}

// ---------------------------------------------------------------------------
// Noms de sauvegarde : ba-mentor-AAAAMMJJ-HHMMSS-<type>[-<n>].db
// ---------------------------------------------------------------------------

#[derive(Debug, PartialEq, Eq, Clone)]
pub struct ParsedName {
    pub stamp: String,
    pub kind: String,
    /// 1 pour le premier fichier d'une seconde donnée, 2 et plus en cas de collision de nom.
    pub seq: u32,
}

pub fn backup_file_name(stamp: &str, kind: &str, seq: u32) -> String {
    if seq <= 1 {
        format!("ba-mentor-{stamp}-{kind}.db")
    } else {
        format!("ba-mentor-{stamp}-{kind}-{seq}.db")
    }
}

fn is_stamp(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 15 && b[8] == b'-' && b.iter().enumerate().all(|(i, c)| i == 8 || c.is_ascii_digit())
}

pub fn parse_backup_name(name: &str) -> Option<ParsedName> {
    let rest = name.strip_prefix("ba-mentor-")?.strip_suffix(".db")?;
    if rest.len() < 17 || !rest.is_char_boundary(15) {
        return None;
    }
    let (stamp, after) = rest.split_at(15);
    if !is_stamp(stamp) {
        return None;
    }
    let after = after.strip_prefix('-')?;
    for kind in KINDS {
        if after == kind {
            return Some(ParsedName { stamp: stamp.to_string(), kind: kind.to_string(), seq: 1 });
        }
        if let Some(tail) = after.strip_prefix(kind).and_then(|t| t.strip_prefix('-')) {
            if !tail.is_empty() && tail.bytes().all(|c| c.is_ascii_digit()) {
                if let Ok(n) = tail.parse::<u32>() {
                    if n >= 2 {
                        return Some(ParsedName { stamp: stamp.to_string(), kind: kind.to_string(), seq: n });
                    }
                }
            }
        }
    }
    None
}

/// Premier nom libre dans `dir` pour (stamp, kind).
pub fn free_backup_path(dir: &Path, stamp: &str, kind: &str) -> PathBuf {
    let mut seq = 1;
    loop {
        let p = dir.join(backup_file_name(stamp, kind, seq));
        if !p.exists() {
            return p;
        }
        seq += 1;
    }
}

// ---------------------------------------------------------------------------
// SHA-256 (FIPS 180-4), écrit ici pour ne pas ajouter de dépendance ; vérifié contre hashlib dans les tests.
// ---------------------------------------------------------------------------

const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

pub struct Sha256 {
    h: [u32; 8],
    buf: [u8; 64],
    buf_len: usize,
    total: u64,
}

impl Sha256 {
    pub fn new() -> Self {
        Sha256 {
            h: [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19],
            buf: [0; 64],
            buf_len: 0,
            total: 0,
        }
    }

    fn compress(&mut self, block: &[u8; 64]) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([block[4 * i], block[4 * i + 1], block[4 * i + 2], block[4 * i + 3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = self.h;
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let t1 = h.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);
            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b;
            b = a;
            a = t1.wrapping_add(t2);
        }
        for (slot, v) in self.h.iter_mut().zip([a, b, c, d, e, f, g, h]) {
            *slot = slot.wrapping_add(v);
        }
    }

    pub fn update(&mut self, mut data: &[u8]) {
        self.total += data.len() as u64;
        if self.buf_len > 0 {
            let take = (64 - self.buf_len).min(data.len());
            self.buf[self.buf_len..self.buf_len + take].copy_from_slice(&data[..take]);
            self.buf_len += take;
            data = &data[take..];
            if self.buf_len == 64 {
                let block = self.buf;
                self.compress(&block);
                self.buf_len = 0;
            }
        }
        while data.len() >= 64 {
            let mut block = [0u8; 64];
            block.copy_from_slice(&data[..64]);
            self.compress(&block);
            data = &data[64..];
        }
        if !data.is_empty() {
            self.buf[..data.len()].copy_from_slice(data);
            self.buf_len = data.len();
        }
    }

    pub fn finish_hex(mut self) -> String {
        let bit_len = self.total.wrapping_mul(8);
        let mut pad = vec![0x80u8];
        let used = (self.buf_len + 1) % 64;
        let zeros = if used <= 56 { 56 - used } else { 120 - used };
        pad.extend(std::iter::repeat(0u8).take(zeros));
        pad.extend_from_slice(&bit_len.to_be_bytes());
        let total = self.total;
        self.update(&pad);
        self.total = total;
        self.h.iter().map(|x| format!("{x:08x}")).collect()
    }
}

pub fn sha256_hex(data: &[u8]) -> String {
    let mut s = Sha256::new();
    s.update(data);
    s.finish_hex()
}

pub fn sha256_file(path: &Path) -> Result<String, String> {
    let mut f = File::open(path).map_err(|e| format!("Lecture impossible ({}) : {e}", path.display()))?;
    let mut s = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf).map_err(|e| format!("Lecture impossible ({}) : {e}", path.display()))?;
        if n == 0 {
            break;
        }
        s.update(&buf[..n]);
    }
    Ok(s.finish_hex())
}

// ---------------------------------------------------------------------------
// Lecture d'un fichier texte choisi par l'utilisateur (import V1, lot V2.2b)
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub struct TextRead {
    pub text: String,
    pub size: u64,
    /// Empreinte SHA-256 des octets du fichier tels qu'ils sont sur le disque (marque d'ordre des octets comprise).
    pub sha256: String,
}

/// Lit un fichier UTF-8 d'au plus `max_bytes` octets. Le contenu n'est jamais lu au-delà de la limite : un fichier énorme est refusé sans être chargé.
/// Une marque d'ordre des octets UTF-8 éventuelle est retirée du texte, pas de l'empreinte.
pub fn read_text_limited(path: &Path, max_bytes: u64) -> Result<TextRead, String> {
    let f = File::open(path).map_err(|e| format!("Lecture impossible ({}) : {e}", path.display()))?;
    let declared = f.metadata().map_err(|e| format!("Lecture impossible ({}) : {e}", path.display()))?.len();
    if declared > max_bytes {
        return Err(format!("Fichier trop volumineux ({} Mo) : la limite est de {} Mo.", declared / 1_048_576, max_bytes / 1_048_576));
    }
    let mut bytes = Vec::new();
    // take(max + 1) : si le fichier grossit pendant la lecture, on le détecte quand même.
    f.take(max_bytes + 1).read_to_end(&mut bytes).map_err(|e| format!("Lecture impossible ({}) : {e}", path.display()))?;
    if bytes.len() as u64 > max_bytes {
        return Err(format!("Fichier trop volumineux : la limite est de {} Mo.", max_bytes / 1_048_576));
    }
    let sha256 = sha256_hex(&bytes);
    let body = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) { &bytes[3..] } else { &bytes[..] };
    let text = String::from_utf8(body.to_vec()).map_err(|_| "Ce fichier n'est pas un texte UTF-8 valide : ce n'est pas un export JSON de BA-Mentor.".to_string())?;
    Ok(TextRead { text, size: bytes.len() as u64, sha256 })
}

// ---------------------------------------------------------------------------
// Écriture durable et remplacement de fichier
// ---------------------------------------------------------------------------

/// Force l'écriture sur le support. Sous Windows, FlushFileBuffers exige un accès en écriture : on rouvre donc en écriture.
pub fn sync_file(path: &Path) -> Result<(), String> {
    let f = OpenOptions::new().write(true).open(path).map_err(|e| format!("Synchronisation impossible ({}) : {e}", path.display()))?;
    f.sync_all().map_err(|e| format!("Synchronisation impossible ({}) : {e}", path.display()))
}

/// Supprime les fichiers annexes SQLite d'une base fermée. Un journal périmé appliqué à un fichier restauré le corromprait.
pub fn remove_side_files(db_file: &Path) {
    let base = db_file.to_string_lossy().to_string();
    for suffix in ["-journal", "-wal", "-shm"] {
        let _ = fs::remove_file(format!("{base}{suffix}"));
    }
}

/// Copie `src` vers un fichier voisin de `dst`, l'écrit durablement, puis le renomme sur `dst`.
/// Le renommage remplace la destination d'un coup : on ne voit jamais un fichier à moitié écrit.
/// Réessaie brièvement : un antivirus peut retenir un fichier une fraction de seconde sous Windows.
pub fn replace_file(src: &Path, dst: &Path) -> Result<(), String> {
    let tmp = PathBuf::from(format!("{}.restoring", dst.to_string_lossy()));
    fs::copy(src, &tmp).map_err(|e| format!("Copie impossible vers {} : {e}", tmp.display()))?;
    let result = sync_file(&tmp).and_then(|_| {
        let mut last = String::new();
        for attempt in 0..5 {
            match fs::rename(&tmp, dst) {
                Ok(_) => return Ok(()),
                Err(e) => {
                    last = e.to_string();
                    thread::sleep(Duration::from_millis(150 * (attempt + 1)));
                }
            }
        }
        Err(format!("Remplacement impossible de {} : {last}", dst.display()))
    });
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

/// Copie `src` vers `dst` (fichier nouveau) en l'écrivant durablement.
pub fn copy_durable(src: &Path, dst: &Path) -> Result<(), String> {
    fs::copy(src, dst).map_err(|e| format!("Copie impossible vers {} : {e}", dst.display()))?;
    sync_file(dst)
}

// ---------------------------------------------------------------------------
// Suppression : jamais autre chose qu'une sauvegarde nommée comme il faut, dans un dossier autorisé
// ---------------------------------------------------------------------------

pub fn check_deletable(file: &Path, allowed_dirs: &[PathBuf]) -> Result<(), String> {
    let name = file.file_name().and_then(|n| n.to_str()).ok_or("Nom de fichier invalide.")?;
    if parse_backup_name(name).is_none() {
        return Err("Seules les sauvegardes de BA-Mentor peuvent être supprimées.".into());
    }
    let parent = file.parent().ok_or("Chemin invalide.")?;
    let parent = fs::canonicalize(parent).map_err(|e| format!("Dossier introuvable : {e}"))?;
    for dir in allowed_dirs {
        if let Ok(d) = fs::canonicalize(dir) {
            if d == parent {
                return Ok(());
            }
        }
    }
    Err("Ce fichier n'est pas dans un dossier de sauvegarde de BA-Mentor.".into())
}

// ---------------------------------------------------------------------------
// Verrou d'instance : un seul BA-Mentor à la fois sur un dossier de données
// ---------------------------------------------------------------------------

pub enum LockError {
    /// Un autre BA-Mentor tient déjà le verrou.
    AlreadyRunning,
    Io(String),
}

/// Prend un verrou exclusif sur BAMentor.lock. Il est libéré par le système à la fermeture du processus, même en cas de plantage : jamais de verrou orphelin.
/// Le fichier retourné doit rester en vie aussi longtemps que l'application.
pub fn lock_data_dir(dir: &Path) -> Result<File, LockError> {
    let f = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(false)
        .open(dir.join("BAMentor.lock"))
        .map_err(|e| LockError::Io(format!("Fichier de verrou inaccessible : {e}")))?;
    match f.try_lock() {
        Ok(()) => {
            let _ = (&f).write_all(b"");
            Ok(f)
        }
        Err(TryLockError::WouldBlock) => Err(LockError::AlreadyRunning),
        Err(TryLockError::Error(e)) => Err(LockError::Io(format!("Verrou impossible : {e}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn temp_dir(tag: &str) -> PathBuf {
        static N: AtomicU32 = AtomicU32::new(0);
        let p = std::env::temp_dir().join(format!("bamentor-files-{}-{}-{}", std::process::id(), tag, N.fetch_add(1, Ordering::SeqCst)));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn read_text_limited_reads_hashes_and_strips_bom() {
        let d = temp_dir("readtext");
        let p = d.join("a.json");
        fs::write(&p, b"\xEF\xBB\xBF{\"x\":\"\xC3\xA9\"}").unwrap();
        let r = read_text_limited(&p, 1024).unwrap();
        assert_eq!(r.text, "{\"x\":\"é\"}");
        assert_eq!(r.size, 13);
        assert_eq!(r.sha256, sha256_hex(b"\xEF\xBB\xBF{\"x\":\"\xC3\xA9\"}"));
    }

    #[test]
    fn read_text_limited_refuses_too_big_and_non_utf8() {
        let d = temp_dir("readtext2");
        let big = d.join("big.json");
        fs::write(&big, vec![b'a'; 2048]).unwrap();
        assert!(read_text_limited(&big, 1024).unwrap_err().contains("trop volumineux"));
        let bad = d.join("bad.json");
        fs::write(&bad, [0xFF, 0xFE, 0x00]).unwrap();
        assert!(read_text_limited(&bad, 1024).unwrap_err().contains("UTF-8"));
        assert!(read_text_limited(&d.join("absent.json"), 1024).is_err());
        // pile à la limite : accepté
        let exact = d.join("exact.json");
        fs::write(&exact, vec![b'a'; 1024]).unwrap();
        assert_eq!(read_text_limited(&exact, 1024).unwrap().size, 1024);
    }

    #[test]
    fn stamp_matches_known_dates() {
        assert_eq!(stamp_from_secs(0), "19700101-000000");
        assert_eq!(stamp_from_secs(1_700_000_000), "20231114-221320");
        assert_eq!(stamp_from_secs(1_709_164_800), "20240229-000000");
    }

    #[test]
    fn sha256_known_vectors() {
        assert_eq!(sha256_hex(b""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_eq!(
            sha256_hex(b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        );
    }

    #[test]
    fn sha256_matches_hashlib_on_lengths_around_block_boundaries() {
        // Données : octet i = (i * 7 + 3) mod 251 ; empreintes calculées avec hashlib (Python).
        let cases: [(usize, &str); 7] = [
            (55, "1deace58c745f3ecadde68a5923f494c3703fa73f0306483ccb898a5826e8d70"),
            (56, "06dbe23685750e4d3881ded95047abaf93fa8f9c5d3501dc57c717a72ff1398e"),
            (63, "47fb38b12335c9298d09280515c0666489a189d1554bb0ac1a0740806ce9d8b6"),
            (64, "dfa798724b1a8014994f363e5da7474ed26ce3757fb29e07aa47ad5a9352d37b"),
            (65, "dd2eab5a5507d7717c63ce953d9ac61752c21e664425ad1227054722a0d97f69"),
            (119, "c6e0f435df5d7d265baacca31e0602c00aa22fa6d3819aed664649294c743756"),
            (200_000, "d2979f63fc353288130be1837d34f088e378e76c5baa67b8a6077c950db3c286"),
        ];
        for (len, expected) in cases {
            let data: Vec<u8> = (0..len).map(|i| ((i * 7 + 3) % 251) as u8).collect();
            assert_eq!(sha256_hex(&data), expected, "longueur {len}");
            // Même résultat en morceaux irréguliers.
            let mut s = Sha256::new();
            for chunk in data.chunks(37) {
                s.update(chunk);
            }
            assert_eq!(s.finish_hex(), expected, "longueur {len} par morceaux");
        }
    }

    #[test]
    fn sha256_file_equals_sha256_of_content() {
        let d = temp_dir("sha");
        let f = d.join("x.bin");
        let data: Vec<u8> = (0..150_000usize).map(|i| ((i * 7 + 3) % 251) as u8).collect();
        fs::write(&f, &data).unwrap();
        assert_eq!(sha256_file(&f).unwrap(), sha256_hex(&data));
    }

    #[test]
    fn parse_names_roundtrip_and_rejections() {
        for kind in KINDS {
            for seq in [1u32, 2, 17] {
                let n = backup_file_name("20261120-144120", kind, seq);
                let p = parse_backup_name(&n).unwrap_or_else(|| panic!("{n} doit être reconnu"));
                assert_eq!((p.stamp.as_str(), p.kind.as_str(), p.seq), ("20261120-144120", kind, seq));
            }
        }
        for bad in [
            "ba-mentor.db",
            "ba-mentor-20261120-144120-manual.txt",
            "ba-mentor-20261120-144120-inconnu.db",
            "ba-mentor-20261120-144120-manual-1.db",
            "ba-mentor-20261120-144120-manual-0.db",
            "ba-mentor-20261120-144120-manual-x.db",
            "ba-mentor-2026112-0144120-manual.db",
            "ba-mentor-20261120-144120-manual-.db",
            "../ba-mentor-20261120-144120-manual.db",
            "ba-mentor-été-été-été-été-été.db",
            "",
        ] {
            assert!(parse_backup_name(bad).is_none(), "{bad} doit être refusé");
        }
    }

    #[test]
    fn free_backup_path_avoids_collisions() {
        let d = temp_dir("free");
        let a = free_backup_path(&d, "20261120-144120", "auto");
        fs::write(&a, b"1").unwrap();
        let b = free_backup_path(&d, "20261120-144120", "auto");
        assert_ne!(a, b);
        assert_eq!(parse_backup_name(b.file_name().unwrap().to_str().unwrap()).unwrap().seq, 2);
    }

    #[test]
    fn replace_file_replaces_content_and_leaves_no_temp_file() {
        let d = temp_dir("replace");
        let src = d.join("src.bin");
        let dst = d.join("dst.bin");
        fs::write(&src, b"nouveau").unwrap();
        fs::write(&dst, b"ancien contenu plus long").unwrap();
        replace_file(&src, &dst).unwrap();
        assert_eq!(fs::read(&dst).unwrap(), b"nouveau");
        assert_eq!(fs::read(&src).unwrap(), b"nouveau", "la source reste intacte");
        assert!(!d.join("dst.bin.restoring").exists());
        // Source absente : erreur, destination inchangée.
        assert!(replace_file(&d.join("absent"), &dst).is_err());
        assert_eq!(fs::read(&dst).unwrap(), b"nouveau");
    }

    #[test]
    fn remove_side_files_removes_journal_wal_shm_only() {
        let d = temp_dir("side");
        let db = d.join("ba-mentor.db");
        for n in ["ba-mentor.db", "ba-mentor.db-journal", "ba-mentor.db-wal", "ba-mentor.db-shm", "autre.txt"] {
            fs::write(d.join(n), b"x").unwrap();
        }
        remove_side_files(&db);
        assert!(db.exists() && d.join("autre.txt").exists());
        for n in ["-journal", "-wal", "-shm"] {
            assert!(!d.join(format!("ba-mentor.db{n}")).exists());
        }
    }

    #[test]
    fn check_deletable_accepts_only_named_backups_in_allowed_dirs() {
        let root = temp_dir("del");
        let backups = root.join("backups");
        let secondary = root.join("secondaire");
        let other = root.join("autre");
        for p in [&backups, &secondary, &other] {
            fs::create_dir_all(p).unwrap();
        }
        let allowed = vec![backups.clone(), secondary.clone()];
        let good = backups.join("ba-mentor-20261120-144120-manual.db");
        let good2 = secondary.join("ba-mentor-20261120-144120-auto-2.db");
        assert!(check_deletable(&good, &allowed).is_ok());
        assert!(check_deletable(&good2, &allowed).is_ok());
        // Mauvais nom, même dans un dossier autorisé.
        assert!(check_deletable(&backups.join("ba-mentor.db"), &allowed).is_err());
        assert!(check_deletable(&backups.join("notes.txt"), &allowed).is_err());
        // Bon nom, dossier non autorisé.
        assert!(check_deletable(&other.join("ba-mentor-20261120-144120-manual.db"), &allowed).is_err());
        // Échappement par « .. » : le dossier réel est résolu avant la comparaison.
        let sneaky = backups.join("..").join("autre").join("ba-mentor-20261120-144120-manual.db");
        assert!(check_deletable(&sneaky, &allowed).is_err());
    }

    #[test]
    fn lock_is_exclusive_and_released_on_drop() {
        let d = temp_dir("lock");
        let first = match lock_data_dir(&d) {
            Ok(f) => f,
            Err(_) => panic!("le premier verrou doit réussir"),
        };
        match lock_data_dir(&d) {
            Err(LockError::AlreadyRunning) => {}
            Err(LockError::Io(e)) => panic!("erreur inattendue : {e}"),
            Ok(_) => panic!("le second verrou doit être refusé"),
        }
        drop(first);
        assert!(lock_data_dir(&d).is_ok(), "le verrou est libéré à la fermeture");
    }
}
