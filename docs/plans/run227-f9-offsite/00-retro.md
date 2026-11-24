# Run #227 — F9 Offsite Encrypted Backup: Gates 0–3 compact

**Item:** F9 offsite backup target (launch condition 5) — Life-OS worker directive
D-20261124-01; target decided by owner D-20261113-15 (**private GitHub repo**; the production
plan's "owner picks B2 vs GitHub" row was stale). Scripts-only + VPS ops; NO app code, NO
schema, NO migrations → no turbo impact (hard gate N/A for this item; tree gates still run
before push for the repo files).

## Design (decided)
- Encryption: `age` v1.3.2 (X25519), binary installed agent-side at ~/.local/bin/age
  (arm64, sha256 6b8dc433… recorded; verified from the canonical FiloSottile release over
  TLS — no checksum file exists for old tags and no minisign verifier on this VPS; disclosed).
- Keypair: ~/.config/koralink/koralink-offsite.key (0600, NEVER leaves the VPS) + .pub
  recipient. Losing the key = losing the backups (escrow = owner step, in OWNER-QUEUE).
- Pipeline in scripts/db-offsite-push.sh (VERIFY-THEN-PUSH): encrypt → decrypt-roundtrip
  (byte-compare) → canary restore into throwaway DB in koralink-postgres (assert ≥20 public
  tables, drop) → push ciphertext via `gh api` Contents PUT (no deploy key needed; the
  factory PAT already carries Contents:write) → re-fetch remote blob and decrypt-verify.
- Idempotent per dump (digest file); state .offsite/last-success feeds watchdog §8b.
- Neon-truth trap fixed live: dumps carry `SET transaction_timeout` (PG17-only GUC) → canary
  on PG16 staging filters exactly that line (documented); cutover PG17 restores unfiltered.
- `gh api --jq .sha` on 404 emits literal "null" → false "already exists" branch (caught
  LIVE, first full run marked a never-pushed dump as pushed) → SHA validated 40-hex before
  trusting; state cleared and re-run proved loud push failure instead.

## Scope
IN: push script, freshness probe, watchdog §8b, age + keypair, live verification exercise.
OUT (owner steps): create the private backup repo, escrow the age key, then flip
offsite.env GH_BACKUP_REPO to owner/repo and (optionally) re-run once to confirm end-to-end.

## Verification (2026-11-24, live)
- ENCRYPTED koralink-prod-20261120-032325.sql.gz (12K ciphertext, age X25519) ✓
- ROUNDTRIP OK: decrypted ciphertext byte-identical to source dump ✓
- RESTORE OK: 32 public tables restored in throwaway DB (dropped) ✓
- PUSH: fails LOUD until the owner creates the repo + GH_BACKUP_REPO is set ✓ (exact gate)
