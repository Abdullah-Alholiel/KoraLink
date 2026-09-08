#!/usr/bin/env python3
"""Reconcile Neon's drizzle journal after the sequence-collision abort.

Ground-truth driven: for every repo migration whose sha256 is missing from
Neon's journal, run existence fingerprints. If ALL fingerprints pass, the SQL
is already applied → backfill the journal row. If any probe fails, leave the
file pending for migrate-vps.mjs (its statements are IF-NOT-EXISTS tolerant).
Finally, fix the SERIAL sequence so future journal INSERTs cannot collide.
Never prints the connection URL.
"""
import hashlib, subprocess, re, sys, time, os

URL_FILE = "/tmp/neon_url.env"
DRIZZLE = "/home/ubuntu/projects/koralink/apps/api/drizzle"
url = open(URL_FILE).read().strip()
if not url:
    sys.exit("no URL")

def psql(q, capture=True):
    r = subprocess.run(
        ["docker", "exec", "koralink-postgres", "psql", url, "-t", "-A", "-c", q],
        capture_output=capture, text=True, timeout=60)
    if r.returncode != 0:
        print("PSQL_ERR:", (r.stderr or "")[:300])
    return (r.stdout or "").strip()

# ── 1. ground truth: journal rows vs repo files ─────────────────────────────
journal = {}  # hash -> id
for line in psql("SELECT id||'|'||hash FROM drizzle.__drizzle_migrations ORDER BY id").splitlines():
    if "|" in line:
        i, h = line.split("|", 1)
        journal[h] = int(i)
print(f"journal rows on Neon: {len(journal)}")

files = sorted(f for f in os.listdir(DRIZZLE) if re.match(r"^\d{4}_.*\.sql$", f))
file_hashes = {}
for f in files:
    content = open(os.path.join(DRIZZLE, f), "rb").read()
    file_hashes[f] = hashlib.sha256(content).hexdigest()

missing = [f for f in files if file_hashes[f] not in journal]
print(f"repo files: {len(files)} | missing from journal: {missing}")

# ── 2. fingerprints ─────────────────────────────────────────────────────────
def probe(kind, name):
    name = name.split(".")[-1].strip('"')  # last segment survives schema-qualified refs
    if kind == "table":
        q = f"SELECT to_regclass('public.{name}') IS NOT NULL"
    elif kind == "column":
        tbl, col = name.split(".", 1)
        q = f"SELECT COUNT(*) FROM information_schema.columns WHERE table_name='{tbl}' AND column_name='{col}'"
    elif kind == "index":
        q = f"SELECT COUNT(*) FROM pg_indexes WHERE indexname='{name}'"
    elif kind == "type":
        q = f"SELECT to_regtype('{name}') IS NOT NULL"
    elif kind == "extension":
        q = f"SELECT COUNT(*) FROM pg_extension WHERE extname='{name}'"
    else:
        return None  # unknown probe kind → treat as inconclusive
    out = psql(q)
    return out == "t" or out == "1"

backfilled = 0
left_pending = []
for f in missing:
    idx = f.split("_")[0]
    sql_text = open(os.path.join(DRIZZLE, f)).read()
    probes = []
    for m in re.finditer(r'CREATE\s+(TABLE|TYPE|EXTENSION)\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([\w.]+)', sql_text, re.I):
        probes.append((m.group(1).lower(), m.group(2)))
    for m in re.finditer(r'ALTER\s+TABLE\s+(?:ONLY\s+)?["`]?([\w.]+)["`]?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)', sql_text, re.I):
        probes.append(("column", f"{m.group(1)}.{m.group(2)}"))
    for m in re.finditer(r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?["`]?(\w+)', sql_text, re.I):
        probes.append(("index", m.group(1)))
    probes = probes[:4]
    results = [probe(k, n) for k, n in probes]
    if probes and all(r is True for r in results):
        psql(f"INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('{file_hashes[f]}', {int(time.time()*1000)})")
        print(f"  BACKFILL {f} — fingerprints all pass {results}")
        backfilled += 1
    else:
        left_pending.append(f)
        print(f"  PENDING  {f} — probes inconclusive/failed {results}")

# ── 3. fix the SERIAL sequence (collision root cause) ──────────────────────
mx = psql("SELECT COALESCE(MAX(id),0) FROM drizzle.__drizzle_migrations")
psql(f"SELECT setval('drizzle.__drizzle_migrations_id_seq', {mx})")
seq = psql("SELECT last_value FROM drizzle.__drizzle_migrations_id_seq")
print(f"sequence setval → MAX(id)={mx}, seq now={seq}")

print(f"backfilled={backfilled} | left for applier={left_pending}")
