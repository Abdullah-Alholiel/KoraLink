# 00 — Retrospective — Admin Table Restructure

**Cycle:** 2026-09-07 · **Source:** Abdullah's Instagram reel transcript: "Your table on a phone? Don't shrink it. Restructure it."

## Retro
- 2026-08-31 console UX overhaul added drawers/forms/i18n parity — but every list kept `<table>` inside `overflow-x-auto`. This cycle kills that anti-pattern.
- No open regressions from run #20 lessons (no money-flow writes, no quiet hours).
- Skill-level drop already completed (migration 0035 + spec test) — no pending drift.

## The six moves (binding for this cycle)
1. Rank columns by use: **identity → value → state**. IDs never survive the cut ("the ID leaves first").
2. Two lines per row on phones: name left, amount right, thumb-sized. No horizontal scroll.
3. One slot for the value: top-right, every row, `tabular-nums`, no header row on cards.
4. Label the ambiguous: bare "March 4th" means nothing → "Due 4 Mar" / "Joined 4 Mar". Money needs no label.
5. Hidden ≠ deleted: tap the row → full record (ID, notes, actions) in the drawer. Sorting moves to a server-side whitelist control.
6. The breakpoint belongs to the **table**, not the screen: CSS container query at 700px. Same table in a narrow desktop side panel restructures to cards automatically.

## Status
- [x] Gate 0 retro
- [x] Gates 1‑3 (product, architecture, program design)
- [x] Gate 4 vertical slices (component family → all pages → API sort whitelists; build passes)
- `turbo run build` exit 0; i18n parity 544=544