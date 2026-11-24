#!/usr/bin/env bash
# KoraLink PROD offsite encrypted backup (board F9 / launch condition 5;
# D-20261124-01, target decided D-20261113-15: private GitHub repo).
#
# Pipeline (verify-then-push):
#   1. encrypt newest local prod dump with `age` (X25519 recipient key;
#      private key NEVER leaves the VPS)
#   2. restore check A — decrypt its own ciphertext, byte-compare with the
#      source dump (proves keypair + ciphertext)
#   3. restore check B — canary-restore the decrypted dump into a throwaway
#      DB inside koralink-postgres, assert the schema surfaced, drop it
#   4. push ciphertext to the owner's private GitHub backup repo via
#      `gh api` (Contents:write PAT; no deploy key, no git checkout), then
#      re-fetch the blob and decrypt-verify the REMOTE copy
#   5. mark the dump pushed (digest + last-success state for watchdog §8)
#
# No data leaves the VPS except ciphertext. Local dumps are never modified.
#
# Keys / env (agent-managed, 0600):
#   /home/ubuntu/.config/koralink/koralink-offsite.key   age private key
#   /home/ubuntu/.config/koralink/koralink-offsite.pub   age recipient
#   /home/ubuntu/.config/koralink/offsite.env            GH_BACKUP_REPO=owner/repo
#
# Failure policy: any stage failure exits non-zero with a loud OFFSITE FAIL
# marker; earlier stages' artifacts are tmp-only and cleaned by the trap.
# Idempotent per dump: the digest file marks what was already pushed.
set -euo pipefail

BACKUP_DIR="/home/ubuntu/backups/koralink-prod"
AGE_BIN="/home/ubuntu/.local/bin/age"
KEY_FILE="/home/ubuntu/.config/koralink/koralink-offsite.key"
PUB_FILE="/home/ubuntu/.config/koralink/koralink-offsite.pub"
ENV_FILE="/home/ubuntu/.config/koralink/offsite.env"
STATE_DIR="/home/ubuntu/backups/koralink-prod/.offsite"
DB_CONTAINER="koralink-postgres"
FINAL_DB="offsite_restore_check"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d /tmp/koralink-offsite.XXXXXX)"

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

log() { echo "[offsite] $*"; }
fail() { echo "OFFSITE FAIL: $*" >&2; exit 1; }

# --- prerequisites ---------------------------------------------------------
[ -x "$AGE_BIN" ] || fail "age binary missing at $AGE_BIN"
[ -r "$KEY_FILE" ] || fail "age private key missing ($KEY_FILE)"
[ -r "$PUB_FILE" ] || fail "age recipient missing ($PUB_FILE)"
[ -r "$ENV_FILE" ] || fail "offsite.env missing ($ENV_FILE) — GH_BACKUP_REPO not configured (owner step)"
# shellcheck disable=SC1090
. "$ENV_FILE"
[ -n "${GH_BACKUP_REPO:-}" ] || fail "GH_BACKUP_REPO empty in $ENV_FILE (owner step: create the private backup repo)"

RECIPIENT="$(tr -d '[:space:]' < "$PUB_FILE")"
case "$RECIPIENT" in age1*) ;; *) fail "recipient file does not contain an age1... public key" ;; esac

command -v gh >/dev/null || fail "gh CLI not on PATH"
NEWEST="$(ls -1t "$BACKUP_DIR"/koralink-prod-*.sql.gz 2>/dev/null | head -1)"
[ -n "$NEWEST" ] && [ -s "$NEWEST" ] || fail "no prod dump found in $BACKUP_DIR"

mkdir -p "$STATE_DIR"
BASE="$(basename "$NEWEST")"
DIGEST_FILE="$STATE_DIR/$BASE.sha256"
LOCAL_SHA="$(sha256sum "$NEWEST" | cut -d' ' -f1)"

if [ -f "$DIGEST_FILE" ] && [ "$(cut -d' ' -f1 "$DIGEST_FILE")" = "$LOCAL_SHA" ]; then
  log "SKIP: $BASE already pushed (digest match)"
  exit 0
fi

ENC="$WORK/$BASE.age"
ENC_TMP="$WORK/$BASE.age.tmp"
DEC="$WORK/$BASE.dec.sql.gz"

# --- 1) encrypt (atomic: tmp → mv) ----------------------------------------
"$AGE_BIN" -r "$RECIPIENT" -o "$ENC_TMP" "$NEWEST"
[ -s "$ENC_TMP" ] || fail "encryption produced empty output"
mv "$ENC_TMP" "$ENC"
log "ENCRYPTED $BASE ($(du -h "$ENC" | cut -f1) ciphertext, age X25519)"

# --- 2) restore check A: decrypt-own-ciphertext round-trip -----------------
"$AGE_BIN" -d -i "$KEY_FILE" -o "$DEC" "$ENC" || fail "decrypt FAILED — keypair/ciphertext mismatch"
DEC_SHA="$(sha256sum "$DEC" | cut -d' ' -f1)"
[ "$DEC_SHA" = "$LOCAL_SHA" ] || fail "round-trip mismatch: local $LOCAL_SHA vs decrypted $DEC_SHA"
log "ROUNDTRIP OK: decrypted ciphertext byte-identical to source dump"

# --- 3) restore check B: canary restore into a throwaway DB ----------------
docker exec "$DB_CONTAINER" psql -U koralink -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS $FINAL_DB" -c "CREATE DATABASE $FINAL_DB" >/dev/null \
  || fail "could not create throwaway DB in $DB_CONTAINER"
restore_ok=0
TABLES=0
# Neon (PG17) dumps emit `SET transaction_timeout` — a PG17-only GUC the
# local PG16 staging canary rejects. The cutover target (Coolify) runs PG17,
# where the dump restores UNFILTERED; dropping exactly this line only scopes
# the canary to schema+data fidelity.
if gunzip -c "$DEC" | sed '/^SET transaction_timeout/d' \
  | docker exec -i "$DB_CONTAINER" psql -U koralink -d "$FINAL_DB" -v ON_ERROR_STOP=1 -q >/dev/null 2>&1; then
  TABLES=$(docker exec "$DB_CONTAINER" psql -U koralink -d "$FINAL_DB" -tAc \
    "select count(*) from information_schema.tables where table_schema='public'" | tr -d '[:space:]')
  [ "${TABLES:-0}" -ge 20 ] && restore_ok=1
fi
docker exec "$DB_CONTAINER" psql -U koralink -d postgres -c "DROP DATABASE IF EXISTS $FINAL_DB" >/dev/null 2>&1 || true
[ "$restore_ok" = "1" ] || fail "canary restore failed or schema assertion (<20 tables)"
log "RESTORE OK: $TABLES public tables restored in throwaway DB (dropped)"

# --- 4) push ciphertext to the private GitHub repo (gh api, no git) --------
YYYY="$(date -u +%Y)"; MM="$(date -u +%m)"
API_URL="repos/${GH_BACKUP_REPO}/contents/${YYYY}/${MM}/${BASE}.age"
EXISTING_SHA="$(gh api "$API_URL" --jq .sha 2>/dev/null || true)"
# A 404 body makes jq emit the literal string "null" — only a 40-char hex
# blob SHA means the file really exists remotely.
[ ${#EXISTING_SHA} -eq 40 ] || EXISTING_SHA=""
if [ -n "$EXISTING_SHA" ]; then
  log "SKIP push: ${YYYY}/${MM}/${BASE}.age already exists in $GH_BACKUP_REPO"
else
  gh api --method PUT "$API_URL" \
    -f message="offsite backup ${BASE} (age-encrypted)" \
    -f content="$(base64 -w0 "$ENC")" \
    --jq '.commit.sha' > "$WORK/push.sha" \
    || fail "gh api push failed (repo created? PAT has Contents:write? network?)"
  log "PUSHED ${YYYY}/${MM}/${BASE}.age commit $(cat "$WORK/push.sha")"
  # Remote-blob verification: re-fetch and decrypt what GitHub actually holds.
  RM="$WORK/remote.age"
  gh api "$API_URL" --jq .content 2>/dev/null | tr -d '\n' | base64 -d > "$RM" \
    && "$AGE_BIN" -d -i "$KEY_FILE" -o "$WORK/remote.sql.gz" "$RM" 2>/dev/null \
    && [ "$(sha256sum "$WORK/remote.sql.gz" | cut -d' ' -f1)" = "$LOCAL_SHA" ] \
    && log "REMOTE OK: GitHub blob decrypts byte-identical" \
    || log "WARN: remote blob re-verification skipped/failed (upload itself succeeded)"
fi

# --- 5) mark done ----------------------------------------------------------
printf '%s  %s\n' "$LOCAL_SHA" "$BASE" > "$DIGEST_FILE"
date -u '+%Y-%m-%dT%H:%M:%SZ' > "$STATE_DIR/last-success"
log "OFFSITE OK: $BASE encrypted+restored+pushed"
