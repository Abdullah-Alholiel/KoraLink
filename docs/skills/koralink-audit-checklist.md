---
name: koralink-audit-checklist
description: "Pre-cycle: z-index, dead UI, format mapping, DB checks."
version: 1.0.0
---

# KoraLink Pre-Cycle Audit Checklist

Use when starting a new feature cycle or reviewing a PR. Run each checklist BEFORE writing code. These patterns recur across every KoraLink cycle and catch the most expensive bugs early.

---

## 1. Z-Index Audit (CRITICAL)

All bottom sheets MUST use `z-[60]` (backdrop) and `z-[70]` (sheet). `z-50` is the BottomNav's z-index — content renders behind nav.

```bash
grep -rn "z-50" src/components/ | grep "fixed"
```

---

## 2. Dead UI Audit

Every interactive element MUST have `onClick` OR `href`. Common dead spots: profile menu items, notification bells, search icons, "View All Comments", feed cards as `<div>`.

---

## 3. Duplicate MobileFrame Audit

Pages under `(main)` get `MobileFrame` + `BottomNav` from layout — MUST NOT render their own. Outside `(main)` pages (host, match/[id], clubs/[id]) correctly have own wrappers.

---

## 4. Format/Max-Players Mapping (CRITICAL)

`Match.format` = `pitch.size` ("11v11"), NOT `match_type` ("Casual"). TeamLineup parses `format.split('v')[0]` — falls back to 7 if wrong.

- **HostMatchForm:** `parseInt(format.split('v')[0]) * 2` — never `charAt(0)`
- **Adapters:** `detail.pitch?.size` / `row.pitch_size`
- **DB:** max_players must match pitch.size (5v5→10, 7v7→14, 8v8→16, 11v11→22)

---

## 5. Filled Spots Consistency

Host IS a player and MUST be counted. Feed SQL uses `COUNT(mp.id)::int` (no filter), detail adapter uses `players.length`. A new match with only a host shows 1/X, not 0/X. Rule changed in `b719de5`.

---

## 6. Silent 500s (varchar = uuid)

Schema uses `varchar(36)`, raw SQL casts `::uuid` — error 42883. Fix: cast `::text`.
Debug: `journalctl --user -u koralink-api -n 100 | grep "Failed query:" -A 50`
