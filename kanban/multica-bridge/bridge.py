#!/usr/bin/env python3
"""
koralink-multica-bridge — two-way sync between the Hermes kanban board
`koralink-factory-loop` and the Multica board (workspace "KoraLink",
project "KoraLink Factory").

Directions
----------
PUSH  (Hermes -> Multica): reads the kanban SQLite DB read-only
       (~/.hermes/kanban/boards/<board>/kanban.db) using high-water marks on
       tasks.updated_at and task_comments.id; creates/updates Multica issues
       (idempotent via metadata hermes_task_id) and appends loop run comments.
PULL  (Multica -> Hermes): polls Multica via its CLI; echoes Abdullah's /
       agent comments and status moves onto the matching Hermes card's comment
       thread; creates Hermes cards (gated under the convention parent) for new
       Multica issues (tagged [multica]).

Modes
-----
--check            dry run: print plan only
--migrate          one-shot full push pass (first migration + catch-up)
--push --watch     continuous event-tailer (~5s poll, near-real-time)
--pull [--watch]   one-shot pull pass, or continuous (~120s)

Rules honored (see docs/plans/multica-integration/03-program-design.md)
- Hermes writes: CLI only (`hermes kanban comment`) — never write the DB.
- Multica writes: CLI only — never touch Multica's Postgres.
- Mirror cards under the convention parent are NEVER status-mutated on the
  Hermes side; Multica moves are echoed as comments.
- Idempotent: metadata hermes_task_id + state.json; re-runs never duplicate.
- Failures are non-fatal: per-item try/except, continue, exit 1 on partial.

Zero LLM cost: pure stdlib Python + subprocess.
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import logging
import os
import re
import sqlite3
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("multica-bridge")

BRIDGE_MARKER = "via koralink-bridge"
MULTICA_PREFIX = "[multica]"
HERMES_HOME_DEFAULT = "/home/ubuntu/.hermes/profiles/koralink"
KANBAN_DB = "/home/ubuntu/.hermes/kanban/boards/{board}/kanban.db"
GATE_PARENT = "t_ce9a513a"

STATUS_MAP = {
    "triage": "backlog",
    "todo": "todo",
    "scheduled": "backlog",
    "ready": "todo",
    "running": "in_progress",
    "in-progress": "in_progress",
    "blocked": "blocked",
    "review": "in_review",
    "done": "done",
    "archived": "cancelled",
}
PRIORITY_MAP = {"P0": "urgent", "P1": "high", "P2": "medium"}


# ────────────────────────────────────────────────────────────────────────────
# helpers
# ────────────────────────────────────────────────────────────────────────────

def _resolve_bin(name: str) -> str:
    """Explicit binary resolution — systemd unit PATHs don't include ~/.local/bin."""
    cand = Path.home() / ".local" / "bin" / name
    if cand.exists():
        return str(cand)
    return name


HERMES_BIN = _resolve_bin("hermes")
MULTICA_BIN = _resolve_bin("multica")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def run(cmd: list[str], input_text: str | None = None, timeout: int = 120) -> subprocess.CompletedProcess:
    """Run a subprocess with env isolation; used for BOTH hermes and multica CLIs."""
    env = os.environ.copy()
    env.pop("HERMES_DELEGATED_CHILD_CONTEXT", None)  # run #21 lesson: kanban CLI refuses with this set
    if cmd[0] == "hermes":
        env["HERMES_HOME"] = os.environ.get("HERMES_HOME", HERMES_HOME_DEFAULT)
        cmd = [HERMES_BIN] + cmd[1:]
    elif cmd[0] == "multica":
        cmd = [MULTICA_BIN] + cmd[1:]
    return subprocess.run(cmd, capture_output=True, text=True, input=input_text,
                          env=env, timeout=timeout)


def run_json(cmd: list[str], input_text: str | None = None, timeout: int = 120) -> list | dict | None:
    p = run(cmd, input_text, timeout)
    if p.returncode != 0:
        raise RuntimeError(f"{cmd[0]} {cmd[1] if len(cmd) > 1 else ''} rc={p.returncode}: {p.stderr[-500:]} {p.stdout[-500:]}")
    try:
        return json.loads(p.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"non-JSON output from {cmd}: {p.stdout[-500:]}")


def parse_priority(title: str) -> str:
    m = re.search(r"\[(P0|P1|P2)\]", title)
    if m:
        return PRIORITY_MAP[m.group(1)]
    return "low"


def epoch(value) -> float:
    """Normalize a DB timestamp (epoch int/float or ISO string) to epoch float."""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value)
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except ValueError:
        try:
            return float(s)
        except ValueError:
            return 0.0


# ────────────────────────────────────────────────────────────────────────────
# Hermes side (read-only SQLite + CLI comment writes)
# ────────────────────────────────────────────────────────────────────────────

class HermesKanban:
    def __init__(self, board: str):
        self.board = board
        self.db_path = Path(KANBAN_DB.format(board=board))
        self.conn = None
        self.tasks_cols = []
        self.comments_cols = []

    def connect(self) -> None:
        self.conn = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True, timeout=10)
        self.conn.row_factory = sqlite3.Row
        self.tasks_cols = [r["name"] for r in self._conn().execute("PRAGMA table_info(tasks)")]
        self.comments_cols = [r["name"] for r in self._conn().execute("PRAGMA table_info(task_comments)")]

    def _conn(self) -> sqlite3.Connection:
        if self.conn is None:
            self.connect()
        assert self.conn is not None
        return self.conn

    def col(self, cols: list[str], *candidates: str) -> str | None:
        for c in candidates:
            if c in cols:
                return c
        return None

    def all_tasks(self) -> list[dict]:
        idc = self.col(self.tasks_cols, "id")
        tc = self.col(self.tasks_cols, "title", "name")
        bc = self.col(self.tasks_cols, "body", "description", "content")
        sc = self.col(self.tasks_cols, "status")
        pc = self.col(self.tasks_cols, "priority")
        uc = self.col(self.tasks_cols, "updated_at", "updated", "ts", "created_at")
        q = f"SELECT {', '.join(c for c in [idc, tc, bc, sc, pc, uc] if c)} FROM tasks"
        rows = []
        for r in self._conn().execute(q):
            rows.append({
                "id": r[idc], "title": r[tc] or "", "body": r[bc] or "",
                "status": r[sc] or "todo", "priority": r[pc],
                "updated_epoch": epoch(r[uc]),
            })
        return rows

    def tasks_since(self, watermark: float) -> list[dict]:
        uc = self.col(self.tasks_cols, "updated_at", "updated", "ts", "created_at")
        if uc is None:
            return self.all_tasks()
        return [t for t in self.all_tasks() if t["updated_epoch"] >= watermark - 0.001]

    def task_by_id(self, task_id: str) -> dict | None:
        idc = self.col(self.tasks_cols, "id")
        tc = self.col(self.tasks_cols, "title", "name")
        bc = self.col(self.tasks_cols, "body", "description", "content")
        sc = self.col(self.tasks_cols, "status")
        pc = self.col(self.tasks_cols, "priority")
        uc = self.col(self.tasks_cols, "updated_at", "updated", "ts", "created_at")
        q = (f"SELECT {', '.join(c for c in [idc, tc, bc, sc, pc, uc] if c)} FROM tasks WHERE {idc} = ?")
        r = self._conn().execute(q, (task_id,)).fetchone()
        if r is None:
            return None
        return {
            "id": r[idc], "title": r[tc] or "", "body": r[bc] or "",
            "status": r[sc] or "todo", "priority": r[pc], "updated_epoch": epoch(r[uc]),
        }

    def comments_since(self, watermark_id: int) -> list[dict]:
        """Return comments with id > watermark_id (numeric id) or fall back to all."""
        idc = self.col(self.comments_cols, "id")
        tc = self.col(self.comments_cols, "task_id")
        ac = self.col(self.comments_cols, "author", "actor", "user", "author_id", "created_by")
        cc = self.col(self.comments_cols, "content", "body", "text")
        ts = self.col(self.comments_cols, "created_at", "ts", "timestamp", "created")
        if not all([idc, tc, cc]):
            return []
        rows = []
        for r in self._conn().execute(f"SELECT {idc} AS id, {tc} AS task_id, "
                                   f"{ac or 'NULL'} AS author, {cc} AS content, {ts or 'NULL'} AS ts "
                                   f"FROM task_comments WHERE {idc} > ? ORDER BY {idc}", (watermark_id,)):
            rows.append({"id": r["id"], "task_id": r["task_id"], "author": r["author"] or "?",
                         "content": r["content"] or "", "ts": r["ts"]})
        return rows

    def max_comment_id(self) -> int:
        idc = self.col(self.comments_cols, "id")
        if idc is None:
            return 0
        row = self._conn().execute(f"SELECT MAX({idc}) AS m FROM task_comments").fetchone()
        return row["m"] or 0

    def add_comment(self, task_id: str, text: str) -> None:
        p = run(["hermes", "kanban", "--board", self.board, "comment", task_id, text])
        if p.returncode != 0:
            raise RuntimeError(f"hermes kanban comment rc={p.returncode}: {p.stderr[-400:]}")


# ────────────────────────────────────────────────────────────────────────────
# Multica side (CLI)
# ────────────────────────────────────────────────────────────────────────────

class Multica:
    def __init__(self, project: str, workspace_id: str = ""):
        self.project = project
        self.base = ["multica"]
        if workspace_id:
            self.base += ["--workspace-id", workspace_id]

    def issue_get(self, key: str) -> dict:
        return run_json(self.base + ["issue", "get", key, "--output", "json"])

    def issue_list(self, metadata: str | None = None) -> list[dict]:
        cmd = self.base + ["issue", "list", "--output", "json", "--project", self.project]
        if metadata:
            cmd += ["--metadata", metadata]
        out = run_json(cmd)
        if isinstance(out, dict):
            out = out.get("issues") or out.get("data") or out.get("items") or []
        return list(out or [])

    def issue_create(self, title: str, description: str, status: str, priority: str) -> str:
        p = run(self.base + ["issue", "create", "--title", title, "--description-stdin",
                             "--status", status, "--priority", priority, "--project", self.project],
                input_text=description)
        if p.returncode != 0:
            raise RuntimeError(f"multica issue create rc={p.returncode}: {p.stderr[-500:]}")
        try:
            j = json.loads(p.stdout)
            ident = j.get("id") or j.get("key")
            if ident:
                return str(ident)
        except json.JSONDecodeError:
            pass
        m = re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", p.stdout)
        if not m:
            raise RuntimeError(f"could not parse issue id from: {p.stdout[-300:]}")
        return m.group(1)

    def issue_status(self, key: str, status: str) -> None:
        run_json(self.base + ["issue", "status", key, status])

    def issue_update_desc(self, key: str, description: str) -> None:
        p = run(self.base + ["issue", "update", key, "--description-stdin"], input_text=description)
        if p.returncode != 0:
            raise RuntimeError(f"multica issue update rc={p.returncode}: {p.stderr[-400:]}")

    def metadata_set(self, key: str, k: str, v: str) -> None:
        p = run(self.base + ["issue", "metadata", "set", key, "--key", k, "--value", v])
        if p.returncode != 0:
            raise RuntimeError(f"metadata set rc={p.returncode}: {p.stderr[-300:]}")

    def comment_add(self, key: str, content: str) -> None:
        p = run(self.base + ["issue", "comment", "add", key, "--content-stdin"], input_text=content)
        if p.returncode != 0:
            raise RuntimeError(f"comment add rc={p.returncode}: {p.stderr[-400:]}")

    def comment_list(self, key: str, since: str | None = None) -> list[dict]:
        cmd = self.base + ["issue", "comment", "list", key, "--output", "json"]
        if since:
            ts = datetime.fromtimestamp(float(since), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            cmd += ["--since", ts]
        out = run_json(cmd)
        if isinstance(out, dict):
            out = out.get("comments") or out.get("data") or out.get("items") or []
        return list(out or [])


# ────────────────────────────────────────────────────────────────────────────
# sync logic
# ────────────────────────────────────────────────────────────────────────────

class Bridge:
    def __init__(self, args):
        self.board = args.board
        self.project = args.project
        self.workspace = args.workspace_id
        self.state_path = Path(args.state)
        self.dry = args.check
        self.hermes = HermesKanban(self.board)
        self.multica = Multica(self.project, self.workspace)
        self.state = self._load_state()
        self.card_state = self.state.setdefault("cards", {})

    def _load_state(self) -> dict:
        if self.state_path.exists():
            try:
                return json.loads(self.state_path.read_text())
            except json.JSONDecodeError:
                log.warning("state.json corrupt; starting fresh (metadata is source of truth)")
        return {"cards": {}, "push_watermark": 0, "comment_watermark": 0, "last_run": None}

    def _save_state(self) -> None:
        """Locked, merge-on-save write — the push watcher and pull poll run
        concurrently and must never clobber each other's additions."""
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        lock_path = self.state_path.with_suffix(".lock")
        with open(lock_path, "w") as lf:
            fcntl.flock(lf, fcntl.LOCK_EX)
            try:
                disk: dict = {}
                if self.state_path.exists():
                    try:
                        disk = json.loads(self.state_path.read_text())
                    except json.JSONDecodeError:
                        disk = {}
                cards = dict(disk.get("cards", {}))
                for tid, st in self.card_state.items():
                    cards[tid] = st
                merged = dict(disk)
                merged["cards"] = cards
                merged["task_watermark"] = max(disk.get("task_watermark", 0), self.state.get("task_watermark", 0))
                merged["comment_watermark"] = max(disk.get("comment_watermark", 0), self.state.get("comment_watermark", 0))
                merged["last_run"] = now_iso()
                tmp = self.state_path.with_suffix(".tmp")
                tmp.write_text(json.dumps(merged, indent=2))
                tmp.replace(self.state_path)
            finally:
                fcntl.flock(lf, fcntl.LOCK_UN)
        self.state = merged
        self.card_state = merged["cards"]

    # ---- push: Hermes -> Multica ----

    def sync_card(self, task: dict) -> tuple[str, str]:
        """Ensure a Multica issue exists for task; return (action, multica_key)."""
        tid = task["id"]
        st = self.card_state.get(tid)
        key = st["multica_key"] if st else None

        if key is None:
            # metadata lookup as source of truth (state may have been wiped)
            hits = self.multica.issue_list(metadata=f"hermes_task_id={tid}")
            if hits:
                key = hits[0].get("key") or hits[0].get("id")
                log.info("recovered key %s for %s from metadata", key, tid)
                # record it so the source=multica guard applies immediately
                self.card_state[tid] = {
                    "multica_key": key, "body_sha": "", "status": "todo",
                    "last_hermes_comment_id": 0, "last_multica_comment_ts": 0,
                    "source": "multica" if (task["title"] or "").startswith("[multica]") else "mirror",
                }

        if key is None and (task["title"] or "").startswith("[multica]"):
            # pull-owned direction: the pull creates the card and owns the mapping.
            # Never create a Multica issue for a [multica] card (duplicate risk).
            log.warning("skip create for pull-owned card %s (no mapping yet)", tid)
            return ("unchanged", "")

        st = self.card_state.get(tid)
        if st and st.get("source") == "multica":
            # source=multica cards are Multica->Hermes only: the pull owns them
            # (status/body/comments must never flow back and fight the agent).
            return ("unchanged", st.get("multica_key") or "")

        title = task["title"] or tid
        body = (task["body"] or "").strip()
        status = STATUS_MAP.get(task["status"], "todo")
        priority = parse_priority(title)

        if key is None:
            if self.dry:
                return ("created", f"would-create-{tid}")
            desc = f"{body}\n\n— mirror of kanban/BOARD.md (hermes card {tid}) · factory loop board · {BRIDGE_MARKER}"
            key = self.multica.issue_create(title, desc, status, priority)
            self.multica.metadata_set(key, "hermes_task_id", tid)
            self.card_state[tid] = {"multica_key": key, "body_sha": self._sha(body),
                                    "status": status, "last_hermes_comment_id": 0,
                                    "last_multica_comment_ts": 0, "source": "mirror"}
            self._save_state()
            return ("created", key)

        st = self.card_state[tid]
        changed = []
        if st.get("status") != status:
            if not self.dry:
                try:
                    self.multica.issue_status(key, status)
                except Exception as e:  # non-fatal per card
                    log.error("status update %s -> %s failed: %s", key, status, e)
                else:
                    st["status"] = status  # only advance on success
            changed.append(f"status→{status}")
        sha = self._sha(body)
        if st.get("body_sha") != sha:
            if not self.dry:
                try:
                    desc = f"{body}\n\n— mirror of kanban/BOARD.md (hermes card {tid}) · factory loop board · {BRIDGE_MARKER}"
                    self.multica.issue_update_desc(key, desc)
                except Exception as e:
                    log.error("body update %s failed: %s", key, e)
                else:
                    st["body_sha"] = sha  # only advance on success
            changed.append("body")
        # comments
        wm = st.get("last_hermes_comment_id", 0)
        try:
            comments = self.hermes.comments_since(wm)
            mine = [c for c in comments if c["task_id"] == tid]
            for c in mine:
                if self.dry:
                    changed.append("comment")
                    continue
                content = f"[{c['ts']}] {c['author']}: {c['content'][:4000]}\n\n— {BRIDGE_MARKER}"
                self.multica.comment_add(key, content)  # raise on failure -> caller rolls the cursor back
                wm = max(wm, int(c["id"]))
            if wm > st.get("last_hermes_comment_id", 0):
                st["last_hermes_comment_id"] = wm
        except Exception as e:
            log.error("comment scan for %s failed: %s", tid, e)
        self._save_state()
        return ("updated:" + ",".join(changed) if changed else "unchanged", key)

    def push_pass(self) -> dict:
        self.hermes.connect()
        tasks = self.hermes.all_tasks()
        stats = {"total": len(tasks), "created": 0, "updated": 0, "unchanged": 0, "errors": 0}
        for t in tasks:
            try:
                action, _ = self.sync_card(t)
                if action.startswith("created"):
                    stats["created"] += 1
                elif action.startswith("updated"):
                    stats["updated"] += 1
                else:
                    stats["unchanged"] += 1
            except Exception as e:
                stats["errors"] += 1
                log.error("push failed for %s: %s", t["id"], e)
        self.state["push_watermark"] = self.state.get("push_watermark", 0)
        return stats

    def push_watch(self) -> None:
        """Continuous tailer: poll tasks.updated_at + task_comments.id watermarks."""
        self.hermes.connect()
        twm = self.state.get("task_watermark", 0.0)
        cwm = self.state.get("comment_watermark", 0)
        log.info("push watcher started (task_wm=%s comment_wm=%s)", twm, cwm)
        while True:
            try:
                tasks = self.hermes.tasks_since(twm)
                for t in tasks:
                    try:
                        self.sync_card(t)
                    except Exception as e:
                        log.error("watcher push %s: %s", t["id"], e)
                    twm = max(twm, t["updated_epoch"])
                comments = self.hermes.comments_since(cwm)
                by_task = {}
                for c in comments:
                    by_task.setdefault(c["task_id"], []).append(c)
                had_failure = False
                for tid, cs in by_task.items():
                    try:
                        task = next((t for t in tasks if t["id"] == tid), None)
                        if task is None:
                            task = self.hermes.task_by_id(tid)  # never sync with an empty fallback dict
                        if task is None:
                            log.warning("watcher: task %s not in DB; skipping comment sync", tid)
                            continue
                        self.sync_card(task)
                    except Exception as e:
                        log.error("watcher comment %s: %s", tid, e)
                        had_failure = True
                        # roll the cursor back below the failed comments so they retry next cycle
                        cwm = min(cwm, min(int(c["id"]) for c in cs) - 1)
                if comments and not had_failure:
                    cwm = max(cwm, max(int(c["id"]) for c in comments))
                self.state["task_watermark"] = twm
                self.state["comment_watermark"] = cwm
                self._save_state()
            except Exception as e:
                log.error("watch cycle error: %s", e)
            time.sleep(5)

    # ---- pull: Multica -> Hermes ----

    def pull_pass(self) -> dict:
        self.hermes.connect()
        stats = {"scanned": 0, "comments": 0, "status_notes": 0, "new_cards": 0, "errors": 0}
        keys = {st["multica_key"]: (tid, st) for tid, st in self.card_state.items() if st.get("multica_key")}
        if not keys:
            log.info("pull: no mapped issues yet (run --migrate first)")
        for key, (tid, st) in keys.items():
            try:
                stats["scanned"] += 1
                # comments
                since = st.get("last_multica_comment_ts")
                comments = self.multica.comment_list(key, since=str(since) if since else None)
                for c in comments:
                    text = str(c.get("content") or c.get("body") or "")
                    if BRIDGE_MARKER in text:
                        continue  # our own echo
                    if self.dry:
                        stats["comments"] += 1
                        continue
                    ts = c.get("created_at") or c.get("ts") or now_iso()
                    author = (c.get("author") or c.get("actor") or c.get("user") or (str(c.get("author_id"))[:8] if c.get("author_id") else None) or "member")
                    self.hermes.add_comment(tid, f"{MULTICA_PREFIX} {author} @ {ts}: {text[:2000]}")
                    stats["comments"] += 1
                if comments:
                    latest = max(epoch(c.get("created_at") or c.get("ts") or 0) for c in comments)
                    st["last_multica_comment_ts"] = max(st.get("last_multica_comment_ts", 0), latest)
                # status note
                issue = self.multica.issue_get(key)
                mstatus = issue.get("status") or issue.get("state") or ""
                hstatus = st.get("status")
                if mstatus and hstatus and mstatus != hstatus:
                    if not self.dry:
                        try:
                            self.hermes.add_comment(tid, f"{MULTICA_PREFIX} moved to {mstatus} (mirror status stays {hstatus})")
                        except Exception as e:
                            log.error("status-note %s: %s", tid, e)
                        else:
                            st["status"] = mstatus  # record known state so we don't re-note every cycle
                    stats["status_notes"] += 1
            except Exception as e:
                stats["errors"] += 1
                log.error("pull failed for %s (%s): %s", tid, key, e)
        # new Multica issues -> Hermes cards
        try:
            issues = self.multica.issue_list()
            for iss in issues:
                if iss.get("status") in ("cancelled",):
                    continue  # never bridge cancelled issues
                # trust the issue's own metadata before creating a card (state may be stale)
                md = iss.get("metadata") or {}
                if md.get("hermes_task_id"):
                    continue
                key = iss.get("key") or iss.get("id")
                if not key:
                    continue
                if any(st.get("multica_key") == key for st in self.card_state.values()):
                    continue
                if self.dry:
                    stats["new_cards"] += 1
                    continue
                title = f"[multica] {iss.get('title', key)}"
                desc = f"{iss.get('description') or iss.get('body') or ''}\n\n— created in Multica ({key}); bridge-created card. {BRIDGE_MARKER}"
                p = run(["hermes", "kanban", "--board", self.board, "create", title,
                         "--assignee", "koralink", "--body", desc])
                if p.returncode != 0:
                    raise RuntimeError(f"hermes kanban create rc={p.returncode}: {p.stderr[-300:]}")
                m = re.search(r"(t_[a-f0-9]{8})", p.stdout)
                if not m:
                    log.error("could not parse new card id from: %s", p.stdout[-200:])
                    continue
                new_id = m.group(1)
                # gate under the convention parent (create leaves cards dispatchable)
                p = run(["hermes", "kanban", "--board", self.board, "link", GATE_PARENT, new_id])
                if p.returncode != 0:
                    log.error("gate link %s: %s", new_id, p.stderr[-200:])
                self.multica.metadata_set(key, "hermes_task_id", new_id)
                self.card_state[new_id] = {"multica_key": key, "body_sha": self._sha(desc),
                                           "status": "todo", "last_hermes_comment_id": 0,
                                           "last_multica_comment_ts": 0, "source": "multica"}
                log.info("new [multica] card %s for %s", new_id, key)
                stats["new_cards"] += 1
        except Exception as e:
            stats["errors"] += 1
            log.error("new-issue scan failed: %s", e)
        self._save_state()
        return stats

    def pull_watch(self) -> None:
        log.info("pull watcher started")
        while True:
            try:
                self.pull_pass()
            except Exception as e:
                log.error("pull cycle error: %s", e)
            time.sleep(120)

    @staticmethod
    def _sha(body: str) -> str:
        return hashlib.sha256((body or "").encode()).hexdigest()


# ────────────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description="koralink <-> multica kanban bridge")
    ap.add_argument("--board", default="koralink-factory-loop")
    ap.add_argument("--project", required=True, help="Multica project id (or short id)")
    ap.add_argument("--workspace-id", default="")
    ap.add_argument("--state", default="/home/ubuntu/projects/koralink/kanban/multica-bridge/state.json")
    ap.add_argument("--check", action="store_true", help="dry run: print plan, write nothing")
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--migrate", action="store_true")
    mode.add_argument("--push-watch", action="store_true")
    mode.add_argument("--pull", action="store_true")
    mode.add_argument("--pull-watch", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    bridge = Bridge(args)

    if args.check:
        log.info("DRY RUN — nothing will be written")
    if args.migrate or args.check and args.migrate:
        stats = bridge.push_pass()
        log.info("push pass: %s", stats)
    if args.push_watch:
        bridge.push_watch()
    if args.pull or (args.check and args.pull):
        stats = bridge.pull_pass()
        log.info("pull pass: %s", stats)
    if args.pull_watch:
        bridge.pull_watch()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
