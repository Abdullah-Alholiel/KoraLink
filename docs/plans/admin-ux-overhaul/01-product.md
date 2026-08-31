# Gate 1 — Product Spec: Admin & Partner Console UX Overhaul

## Problem statement
The operations console (apps/admin) fails both of its audiences:
- **Admin (HQ):** sees the partner portal tabs that aren't his, has no Pitches tab at all, and lacks
  the hands-on tools to resolve real problems (rename a match, transfer a pitch/venue to a new owner,
  reopen a decided dispute or report, edit an outcome). Arabic mode is left-sided — not RTL-native.
- **Partner (venue owner):** dashboard shows four numbers and a table; editing venues/pitches means
  placeholder-only forms that shift page content; the schedule manager is an inline accordion that
  pushes everything down and can only be closed by re-clicking the same button.

## User stories

### Admin (HQ) — P0
| ID | Story | Priority |
|----|-------|----------|
| A1 | As an admin, I see ONLY HQ tabs (dashboard, users, matches, venues, pitches, disputes, reports, transactions, settlements, settings, audit) — no partner group. | P0 |
| A2 | As an admin, I have a **Pitches** tab listing all pitches with venue + owner, so I can find any pitch quickly. | P0 |
| A3 | As an admin, I can **edit a match** (title, scheduled_at, duration) from the matches list/detail, because external requests come to me by phone. | P0 |
| A4 | As an admin, I can **transfer ownership** of a venue or pitch to another user (the "external request" case). | P0 |
| A5 | As an admin, when a dispute/report is closed I can still **reopen it** and **edit the outcome** (decision/resolution text, internal note), because new evidence arrives after decisions. | P0 |
| A6 | As an admin, every screen renders **RTL-native in Arabic** — menu on the right, layout mirrored, no hardcoded English. | P0 |

### Partner (venue owner) — P0/P1
| ID | Story | Priority |
|----|-------|----------|
| B1 | As a partner, my dashboard shows this week's picture: utilization, upcoming matches (list, not just count), revenue today + 7-day mini-trend, my next 5 upcoming matches, and quick links (add pitch, manage schedule). | P0 |
| B2 | As a partner, editing my venue happens in a proper **drawer** (labels above inputs, validation, save/cancel states) — not an inline panel that shifts the page. | P0 |
| B3 | As a partner, editing a pitch uses the same drawer pattern with the same quality bar. | P0 |
| B4 | As a partner, "Manage schedule" opens a **standalone slide-over** dedicated to that pitch — full-height, focus, Esc/X/backdrop close, with the week grid + generator inside. Closing never requires re-clicking a toggle. | P0 |
| B5 | As a partner, the "Add pitch" flow is a real form: labeled fields, sensible defaults, validation messages under fields, review-before-submit (price preview), success state. | P1 |

### Both
| ID | Story | Priority |
|----|-------|----------|
| C1 | Every new/changed string exists in en.json AND ar.json. Disputes/reports detail pages are fully localized. | P0 |

## Scope boundaries

### IN SCOPE
- apps/admin (sidebar/rbac, layout shell, all touched pages/components, i18n en+ar)
- apps/api: new admin endpoints (match edit, pitch/venue owner transfer, dispute/report reopen+update),
  new `GET /admin/pitches`, extended partner dashboard aggregate
- Drizzle migration only if a new column is strictly required (target: none — status enums already
  have the values we need)

### OUT OF SCOPE
- PWA changes (except untouched sibling WIP stays untouched)
- Real payment integration, dispute money side-effects (P1-29 blocker stands)
- Role system beyond Admin/VenueOwner (Player stays empty)
- Audit log UI changes (log entries are written, not re-designed)
- Dark mode, virtualized tables (lists here are small)

## Success criteria
1. Login as admin (`+966500000000`): sidebar shows exactly the 11 HQ tabs, no partner group.
2. `/pitches` (admin) lists all pitches with venue/owner; search works.
3. Admin match edit: title/duration/schedule change persists, audited, broadcast; players unaffected otherwise.
4. Admin owner transfer on venue AND pitch: new owner sees it in `/partner`; old owner doesn't. Audited.
5. Closed dispute/report: reopen → status returns to open queue; edit decision → text persists. Audited.
6. Arabic mode: sidebar on the RIGHT, all content mirrored, disputes/reports pages fully Arabic, zero
   hardcoded English strings on those pages (grep-verifiable).
7. Partner schedule opens as slide-over; Esc/X/backdrop close it; page content never shifts.
8. Add-pitch and edit flows use labeled, validated forms with the 5 UX states.
9. `turbo run build` zero errors; all touched type-checks green.

## Open questions for Gate 2
1. Owner transfer semantics: hard transfer (ownership + visibility switch immediately) vs "pending
   acceptance" flow? **Default proposal: immediate hard transfer + audit + activity notifications to
   both parties** (matches "external request" phone-driven workflow — no acceptance round-trip).
2. Match edit guardrails: forbid edits when status is Completed/Cancelled? **Default: only
   Open/InProgress editable, scheduled_at must stay in the future.**
3. Reopen semantics: `rejected → opened` too, or only `resolved → opened`? **Default: both** (admin
   judgment is the point).

## Risks
- Owner transfer is a trust-sensitive mutation → must be audited + notified, API-enforced Admin-only.
- Match reschedule reuses P1-13 logic (slot locks, money re-derivation) — must NOT duplicate money
  movement; admin edit changes metadata + schedule via the existing guarded path where possible.
- RTL sweep touches many files → do it as one dedicated slice with a mechanical grep gate
  (`grep -rn "left-0\|pl-64\|text-left\|text-right" apps/admin/src` = 0 hits on touched files).
