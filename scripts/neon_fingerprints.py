#!/usr/bin/env python3
"""Extract a existence-probe fingerprint (object name + kind) per migration file.
Used to reconcile what Neon actually has vs what the repo expects — the journal
row count alone is not trustworthy (VPS drift proved that)."""
import os, re, sys

DRIZZLE = "/home/ubuntu/projects/koralink/apps/api/drizzle"
out = {}
for fn in sorted(os.listdir(DRIZZLE)):
    if not (fn.startswith("00") and fn.endswith(".sql")):
        continue
    idx = fn.split("_")[0]
    sql = open(os.path.join(DRIZZLE, fn)).read()
    probes = []
    # CREATE TABLE x / CREATE TYPE x / CREATE EXTENSION x
    for m in re.finditer(r'CREATE\s+(TABLE|TYPE|EXTENSION)\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([\w.]+)', sql, re.I):
        probes.append((m.group(1).lower(), m.group(2)))
    # ALTER TABLE x ADD COLUMN c  → probe column existence
    for m in re.finditer(r'ALTER\s+TABLE\s+(?:ONLY\s+)?["`]?([\w.]+)["`]?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)', sql, re.I):
        probes.append(("column", f"{m.group(1)}.{m.group(2)}"))
    # ALTER TABLE x ALTER/DROP/RENAME etc → probe the table
    for m in re.finditer(r'ALTER\s+TABLE\s+(?:ONLY\s+)?["`]?([\w.]+)["`]?\s+(?!ADD\s+COLUMN)', sql, re.I):
        probes.append(("table", m.group(1)))
    # CREATE (UNIQUE )? INDEX x ON t
    for m in re.finditer(r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?["`]?(\w+)', sql, re.I):
        probes.append(("index", m.group(1)))
    if probes:
        out[idx] = (fn, probes[:4])  # cap probes per file

for idx in sorted(out):
    fn, probes = out[idx]
    print(f"{idx}|{fn}|{probes}")
