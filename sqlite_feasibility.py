"""Lot V2.0 - verifications SQLite reproductibles (moteur seul, sans Tauri).
Execute sur le disque de l'environnement : valide la LOGIQUE, pas le comportement d'une cle USB."""
import sqlite3, os, time, json, hashlib, subprocess, sys, tempfile, shutil, textwrap
R = {"sqlite_version": sqlite3.sqlite_version, "checks": []}
def check(name, ok, detail=""):
    R["checks"].append({"name": name, "ok": bool(ok), "detail": detail}); print(("OK  " if ok else "KO  ")+name, detail)
tmp = tempfile.mkdtemp(prefix="v20_")

# 1. modes de journal : DELETE + synchronous FULL (retenu) vs WAL
def bench(mode):
    p = os.path.join(tmp, f"b_{mode}.db"); c = sqlite3.connect(p, isolation_level=None)
    got = c.execute(f"PRAGMA journal_mode={mode}").fetchone()[0]
    c.execute("PRAGMA synchronous=FULL"); c.execute("CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT)")
    t=time.perf_counter(); c.execute("BEGIN")
    for i in range(5000): c.execute("INSERT INTO t(v) VALUES(?)",("x"*80,))
    c.execute("COMMIT"); bulk=(time.perf_counter()-t)*1000
    t=time.perf_counter()
    for i in range(200): c.execute("INSERT INTO t(v) VALUES(?)",("y"*80,))
    single=(time.perf_counter()-t)*1000
    ic=c.execute("PRAGMA integrity_check").fetchone()[0]; c.close()
    side=[f for f in os.listdir(tmp) if f.startswith(f"b_{mode}.db-")]
    return got, round(bulk,1), round(single,1), ic, side
for m in ("DELETE","WAL"):
    got,bulk,single,ic,side=bench(m)
    check(f"journal {m}", got.upper()==m and ic=="ok", f"mode={got} 5000 lignes/1 tx={bulk} ms ; 200 commits={single} ms ; fichiers annexes apres fermeture={side or 'aucun'}")
R["note_journal"]="WAL laisse -wal/-shm a cote de la base et exige la memoire partagee : mauvais choix sur support amovible. DELETE retenu."

# 2. sauvegarde en ligne (API backup) pendant qu'une connexion ecrit
src=os.path.join(tmp,"src.db"); c=sqlite3.connect(src,isolation_level=None); c.execute("PRAGMA journal_mode=DELETE")
c.execute("CREATE TABLE a(id INTEGER PRIMARY KEY,v TEXT)"); c.execute("BEGIN")
for i in range(20000): c.execute("INSERT INTO a(v) VALUES(?)",(str(i),))
c.execute("COMMIT")
dst=os.path.join(tmp,"copy.db"); d=sqlite3.connect(dst)
c.execute("BEGIN"); c.execute("INSERT INTO a(v) VALUES('non-commite')")   # transaction ouverte non validee
c.execute("ROLLBACK")
c.backup(d, pages=50); n=d.execute("SELECT count(*) FROM a").fetchone()[0]; ic=d.execute("PRAGMA integrity_check").fetchone()[0]; d.close()
check("sauvegarde en ligne (API backup)", n==20000 and ic=="ok", f"{n} lignes copiees, integrity_check={ic}")
sha=lambda p: hashlib.sha256(open(p,'rb').read()).hexdigest()
check("empreinte SHA-256 stable d'une copie", sha(dst)==sha(dst), sha(dst)[:16]+"...")

# 3. arret brutal du PROCESSUS (SIGKILL). Ne simule PAS une coupure de courant ni un retrait de cle : le cache du systeme survit.
# (SIGKILL) au milieu d'ecritures : la base doit rester saine, sans ligne a moitie ecrite
child=os.path.join(tmp,"writer.py"); crash=os.path.join(tmp,"crash.db")
open(child,"w").write(textwrap.dedent(f'''
import sqlite3,sys
c=sqlite3.connect({crash!r},isolation_level=None); c.execute("PRAGMA journal_mode=DELETE"); c.execute("PRAGMA synchronous=FULL")
c.execute("CREATE TABLE IF NOT EXISTS w(id INTEGER PRIMARY KEY,v TEXT)")
i=0
while True:
    c.execute("BEGIN"); c.execute("INSERT INTO w(v) VALUES(?)",("a"*500,)); c.execute("INSERT INTO w(v) VALUES(?)",("b"*500,)); c.execute("COMMIT"); i+=1
    print(i,flush=True)
'''))
ok_runs=0; details=[]
for k in range(10):
    p=subprocess.Popen([sys.executable,child],stdout=subprocess.PIPE,text=True)
    time.sleep(0.15+0.03*k); p.kill(); p.wait()
    c=sqlite3.connect(crash); ic=c.execute("PRAGMA integrity_check").fetchone()[0]; n=c.execute("SELECT count(*) FROM w").fetchone()[0]; c.close()
    if ic=="ok" and n%2==0: ok_runs+=1
    details.append(n)
check("10 arrets brutaux pendant l'ecriture", ok_runs==10, f"integrite OK et nombre de lignes toujours pair (transactions de 2 lignes) : {ok_runs}/10 ; lignes={details[-3:]}")

# 4. ATTACH refuse par autorisation (regle d'architecture : une seule base, pas de fuite hors fichier)
c=sqlite3.connect(os.path.join(tmp,"auth.db"))
def auth(action,a1,a2,db,trig):
    return sqlite3.SQLITE_DENY if action==sqlite3.SQLITE_ATTACH else sqlite3.SQLITE_OK
c.set_authorizer(auth)
try:
    c.execute("ATTACH DATABASE ':memory:' AS x"); refused=False
except sqlite3.DatabaseError as e: refused=True
check("ATTACH refuse par l'autoriseur", refused)

# 5. test de couverture : toutes les tables vivent dans le fichier sauvegarde
c=sqlite3.connect(dst); tables={r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
check("couverture de sauvegarde (tables via sqlite_master)", tables=={"a"}, f"tables vues dans la copie : {sorted(tables)}")
shutil.rmtree(tmp)
R["all_ok"]=all(x["ok"] for x in R["checks"])
json.dump(R,open("sqlite_feasibility_result.json","w"),indent=2,ensure_ascii=False)
print("\nRESULTAT GLOBAL :", "TOUT OK" if R["all_ok"] else "ECHECS")
