# Gate 3 — Program Design (CONTRACT GATE) — REVISED 2026-09-09

Every shape below is copy-paste exact. Frontend and backend implement against THIS document.
Revisions: conditional refund matrix (4h window + waitlist backfill + forfeit), mode-aware
responsibility labeling (self = stronger warning), per-episode idempotency keys (run #20 lesson).

## 1. Schema (migration `0039_player_host_payout.sql`)

```sql
-- enum first (idempotent)
DO $$ BEGIN
  CREATE TYPE "HostPayoutState" AS ENUM ('held', 'released', 'cancelled', 'not_applicable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_player_hosted boolean NOT NULL DEFAULT false;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS host_payout_state "HostPayoutState" NOT NULL DEFAULT 'not_applicable';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS host_accepted_terms_at timestamptz;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS fee_paid_sar numeric(10,2);
CREATE INDEX IF NOT EXISTS matches_payout_state_idx ON matches (host_payout_state) WHERE host_payout_state='held';
```
Journal row: `0039_player_host_payout` in `public.__drizzle_migrations` (gap-guarded applier).
Defaults make every legacy row `false`/`not_applicable` → zero behavior change.

## 2. MatchesService — method signatures (explicit returns)

```ts
// createMatch — dto gains optional consent flag; service enforces it (BOTH modes)
async createMatch(hostId: string, dto: CreateMatchDto): Promise<MatchDetailApi>
//   RULE: !dto.acceptedHostingTerms
//     → BadRequestException('Hosting terms must be accepted before booking.')
//   persists: host_accepted_terms_at = now, is_player_hosted = (host.role==='Player')
//   host_payout_state = (is_player_hosted && price_per_player > 0) ? 'held' : 'not_applicable'
//   koralink mode additionally: slot book + cost debit (existing, unchanged)

// joinMatch — NEW optional dto (fee enforced for BOTH modes when fee condition true)
async joinMatch(userId: string, matchId: string, dto?: JoinMatchDto): Promise<MatchDetailApi>
//   fee match (is_player_hosted && price_per_player > 0):
//     !dto?.idempotencyKey → BadRequestException('Payment verification key required')
//     insufficient balance → ConflictException('join_insufficient_balance') [409]
//     tx: insert match_players (episode) → guarded wallet debit price_per_player
//         → MATCH_FEE ledger (idempotency_key = `join-fee-${dto.idempotencyKey}`, client-UUID)
//         — atomic: seat cannot exist without its fee; roster unique constraint blocks retries

// leaveMatch — CONDITIONAL REFUND ENGINE (REFUND_WINDOW_HOURS=4, common/constants)
async leaveMatch(userId: string, matchId: string): Promise<MatchDetailApi & { your_leave_refund: LeaveRefundOutcome | null }>
type LeaveRefundOutcome = 'refunded' | 'backfilled_refunded' | 'forfeited' | null
//   null = no fee on this roster row (free match / legacy row) → FE shows no toast
//   tx: FOR UPDATE match + read roster row (fee_paid_sar, episode id):
//     fee_paid_sar null/0                    → outcome null, no money ops
//     NOW() >= scheduled_at - 4h             → CREDIT leaver fee, ledger REFUND
//                                              key `refund-join-${mpId}` → 'refunded'
//     NOW() <  scheduled_at - 4h             → waitlist backfill IN THIS TX:
//         promoteNextInTx seats next queued WITH fee collection (paid, atomic)
//           seated  → CREDIT leaver fee (`refund-join-${mpId}`) → 'backfilled_refunded'
//           no seat → CREDIT HOST fee (`host-forfeit-${mpId}`, ref_type REFUND —
//                     forfeit semantics documented in reference_id prefix) → 'forfeited'
//   forfeited fees are NEVER refunded to the leaver, even on later cancellation (ToS)
//   response = { ...this.findOne(matchId), your_leave_refund: outcome }  (findOne OUTSIDE tx)

// removePlayer (host removes) — 100% refund ALWAYS (host decision ≠ player fault)
async removePlayer(hostId: string, matchId: string, targetUserId: string): Promise<MatchDetailApi>
//   if removed row has fee_paid_sar > 0: CREDIT target + REFUND ledger `refund-join-${mpId}`
//   (in the existing tx, before promoteNextInTx)

// cancelMatch + auto-cancel — refund EVERY CURRENT-roster payer 100%
//   (host pitch-cost refund unchanged; forfeited fees stay with host; ToS-stated)
//   then: UPDATE matches SET host_payout_state='cancelled' WHERE id=? AND host_payout_state='held'

// completeMatch + autoCompletePastMatches — in the SAME tx as the status flip:
releaseHostPayoutInTx(tx, matchId): Promise<{ paid: boolean; amountSar: string }>
//   payout = round2(SUM(fee_paid_sar of CURRENT roster rows) − margin×count), floor 0
//     margin = PlatformSettingsService.getNumber('platform_margin_sar', 5) — NOT hardcoded
//   (forfeited amounts were credited to the host at leave-time and are NOT re-counted)
//   payout > 0 → guarded wallet CREDIT host → PRIZE ledger (`host-payout-${matchId}`)
//   single-shot: UPDATE matches SET host_payout_state='released'
//     WHERE id=? AND host_payout_state='held' → rowCount 0 ⇒ already settled (no-op, idempotent)
```

**Idempotency key rules (run #20 lesson — UNIQUE constraint):**
- Join fee: `join-fee-${clientUUID}` — client-generated per attempt (retry after 409 = new UUID).
- Refund / forfeit: `refund-join-${mpId}` / `host-forfeit-${mpId}` — derived from the roster
  **episode** id, NEVER `{matchId}-{userId}` (a legal leave→rejoin must never collide).
- Host payout: `host-payout-${matchId}` — once per match (guarded by state column too).

## 3. Exact JSON — `GET /matches/:id` (changed fields only; all other fields unchanged)
```json
{
  "id": "m-123",
  "is_player_hosted": true,
  "host_payout_state": "held",
  "booking_mode": "self",
  "host": { "id": "u-1", "full_name": "Faisal", "avatar_url": "..." },
  "price_per_player": 41.43
}
```
`GET /matches` feed rows + `GET /users/me/matches` rows additionally carry (snake_case, flat):
```json
{ "is_player_hosted": true, "booking_mode": "self", "host_payout_state": "held" }
```
`DELETE /matches/:id/join` (leave) response = match detail + viewer-scoped field
(established pattern: `your_waitlist_position`):
```json
{ "...matchDetail": "…", "your_leave_refund": "backfilled_refunded" }
```

## 4. Frontend types (types/index.ts)
```ts
export type HostPayoutState = 'held' | 'released' | 'cancelled' | 'not_applicable';
export type LeaveRefundOutcome = 'refunded' | 'backfilled_refunded' | 'forfeited';
export interface Match {
  // ...existing
  isPlayerHosted?: boolean;   // adapter: !!row.is_player_hosted
  hostPayoutState?: HostPayoutState;
}
```
Adapter contract: `adaptNearbyMatch` / `adaptMatchDetail` map `is_player_hosted → isPlayerHosted`
and `host_payout_state → hostPayoutState`. No other mapping changes.

## 5. Frontend hooks
```ts
// useMatchActions.ts
useJoinMatch(): UseMutationResult<unknown, FetchError, string | { matchId: string; idempotencyKey?: string }>
//   string form → POST /matches/:id/join (no body) — free matches, unchanged
//   object form → POST /matches/:id/join { idempotencyKey }  (crypto.randomUUID())
//   409 join_insufficient_balance → errors.joinInsufficientBalance toast
//   400 payment-key               → errors.joinPaymentRequired toast

// useLeaveMatch — reads res.your_leave_refund → localized toast (money-flow standard):
//   refunded            → matchDetail.leaveRefunded         ("Refund sent — your fee is back in your wallet")
//   backfilled_refunded → matchDetail.leaveBackfillRefunded ("A waitlisted player took your spot — you've been refunded in full")
//   forfeited           → matchDetail.leaveForfeit          ("Late cancellation — fee forfeited to the host per the refund policy")
//   null / absent       → no toast (free match / legacy row)
// Route reality: leave is `DELETE /matches/:id/leave`; host-remove is `DELETE /matches/:id/players/:playerId`.
// hooks/useUser.ts ALSO renders leave (My Games) — it must surface the same outcome toasts.
```
PaymentSheet: pay action = `joinMatch.mutate({ matchId, idempotencyKey: crypto.randomUUID() })`;
`/wallet/pay` REMOVED from the join path (endpoint stays for other flows).

## 6. Error-message contract (money-flow standard: what+why+what-next, EN+AR)
| API | FE key (en) |
|-----|-------------|
| 409 join_insufficient_balance | errors.joinInsufficientBalance: "Not enough wallet balance to join. Top up your wallet and try again." |
| 400 payment-key missing | errors.joinPaymentRequired: "We couldn't verify your payment. No money was taken — please try joining again." |
| 400 hosting terms | hostForm.hostingConsentRequired (form-level, blocks pre-submit) |

## 7. i18n key contract (BOTH files; ar = native Arabic)

```jsonc
// ── Mode-aware responsibility labeling ──
// en.json — matchCard
"playerHostedBadge": "Player-hosted · Booked on KoraLink",
"selfHostedBadge": "Host-run · Self-booked"
// ar.json — matchCard
"playerHostedBadge": "مستضافة من لاعب · محجوزة عبر كورالينك",
"selfHostedBadge": "بإدارة المضيف · حجز ذاتي"

// en.json — matchDetail (banners)
"selfHostedTitle": "Run entirely by the host",
"selfHostedBanner": "This match is self-booked. The host runs everything: venue access, venue payment, timing, and game management. KoraLink is the platform only and is not responsible for on-site arrangements.",
"playerHostedTitle": "Hosted by a player",
"playerHostedBanner": "{host} booked this pitch through KoraLink and runs the match: timing, fairness, and game management. KoraLink handles the pitch booking and will step in to resolve any venue problem the host cannot solve.",
"playerHostedPayoutNoteHost": "Your payout is held securely and released automatically after the match is completed.",
"playerHostedPayoutNotePlayer": "Your payment is held securely. Cancel 4+ hours before start, or if your seat is backfilled, and you're refunded in full.",
// ar.json — matchDetail
"selfHostedTitle": "بإدارة المضيف بالكامل",
"selfHostedBanner": "هذه المباراة محجوزة ذاتيًا. المضيف يتولى كل شيء: دخول الملعب ودفع مقابله والتوقيت وإدارة اللعبة. كورالينك منصة فقط وغير مسؤول عن الترتيبات في الملعب.",
"playerHostedTitle": "مستضافة من لاعب",
"playerHostedBanner": "حجز {host} هذا الملعب عبر كورالينك وهو من يدير المباراة: التوقيت والعدل وإدارة اللعبة. كورالينك يتولى حجز الملعب ويتدخل لحل أي مشكلة في الملعب لا يستطيع المضيف حلها.",
"playerHostedPayoutNoteHost": "مستحقاتك محفوظة بأمان وتُصرف تلقائيًا بعد اكتمال المباراة.",
"playerHostedPayoutNotePlayer": "دفعتك محفوظة بأمان. ألغِ قبل ٤ ساعات من البداية أو إذا عُبئت قعدتك، ويُسترد المبلغ كاملًا."

// en.json — matchDetail (leave outcome toasts)
"leaveRefunded": "Refund sent — your fee is back in your wallet.",
"leaveBackfillRefunded": "A waitlisted player took your spot — full refund sent to your wallet.",
"leaveForfeit": "Late cancellation — your fee is forfeited to the host per the refund policy.",
// ar.json
"leaveRefunded": "تم الاسترداد — عاد المبلغ إلى محفظتك.",
"leaveBackfillRefunded": "لاعب من قائمة الانتظار أخذ مقعدك — تم استرداد المبلغ كاملًا إلى محفظتك.",
"leaveForfeit": "إلغاء متأخر — المبلغ يذهب للمضيف وفق سياسة الاسترداد."

// en.json — hostForm (consent; self = stronger)
"hostingConsentTitle": "Hosting responsibility",
"hostingConsentBodyKoralink": "I host this match as a player. I run the match: timing, fairness, and game management. KoraLink books the pitch and helps resolve venue problems I cannot solve. My payout is held until the match completes; joiners are refunded per the refund policy.",
"hostingConsentBodySelf": "I host this match as a player with a SELF-BOOKED venue. I run everything: venue access, paying the venue, timing, and game management. KoraLink is the platform only. My payout from joiner fees is held until the match completes.",
"hostingConsentLabel": "I understand and accept",
"hostingConsentRequired": "You must accept the hosting terms to publish.",
// ar.json — hostForm
"hostingConsentTitle": "مسؤولية الاستضافة",
"hostingConsentBodyKoralink": "أستضيف هذه المباراة كلاعب. أنا من يديرها: التوقيت والعدل وإدارة اللعبة. كورالينك يحجز الملعب ويساعد في حل مشاكل الملعب التي لا أستطيع حلها. تُحفظ مستحقاتي حتى اكتمال المباراة، ويُسترد للمشاركين وفق سياسة الاسترداد.",
"hostingConsentBodySelf": "أستضيف هذه المباراة كلاعب بملعب محجوز ذاتيًا. أنا أتولى كل شيء: دخول الملعب ودفع مقابله والتوقيت وإدارة اللعبة. كورالينك منصة فقط. تُحفظ مستحقاتي من رسوم المشاركين حتى اكتمال المباراة.",
"hostingConsentLabel": "أفهم وأوافق",
"hostingConsentRequired": "يجب الموافقة على شروط الاستضافة للنشر."

// en.json — legal (terms page; lastUpdated text becomes September 2026)
"termsHostingTitle": "Player-hosted matches",
"termsHostingDesc": "When a player hosts a match, that hosting player — not KoraLink — runs the match: timing, fairness, and game management. On self-booked matches the host is additionally responsible for all venue arrangements, including venue access and paying the venue directly; KoraLink is the platform only. On KoraLink-booked matches, KoraLink handles the pitch booking and will step in to resolve venue problems the host cannot solve.",
"termsHostingPayoutDesc": "The hosting player's payout — joiner fees minus the platform share — is held securely and released only after the match is completed. If the host cancels or the match is auto-cancelled for low attendance, every joiner is refunded automatically and in full. If the host removes a player, that player is refunded in full.",
"termsRefundTitle": "Joiner refunds and the 4-hour rule",
"termsRefundDesc": "Joiners who withdraw 4 or more hours before kickoff are refunded in full. Within the final 4 hours, a withdrawal is refunded in full only if a waitlisted player takes the seat; otherwise the fee is forfeited to the host. Withdrawals after kickoff and no-shows are not refunded. Fees already forfeited are not returned even if the match is later cancelled. Repeated abuse of hosting responsibility or refunds may result in account restrictions under the Accounts section.",
// ar.json — legal
"termsHostingTitle": "المباريات المستضافة من لاعبين",
"termsHostingDesc": "عندما يستضيف لاعب مباراة، فإن اللاعب المستضيف — وليس كورالينك — هو من يديرها: التوقيت والعدل وإدارة اللعبة. وفي المباريات ذات الحجز الذاتي، يكون المضيف مسؤولًا إضافيًا عن كل ترتيبات الملعب، بما فيها الدخول ودفع المقابل مباشرةً؛ وكورالينك منصة فقط. وفي المباريات المحجوزة عبر كورالينك، يتولى كورالينك حجز الملعب ويتدخل لحل مشاكل الملعب التي لا يستطيع المضيف حلها.",
"termsHostingPayoutDesc": "تُحفظ مستحقات اللاعب المستضيف — رسوم المشاركين مطروحًا منها حصة المنصة — بأمان، ولا تُصرف إلا بعد اكتمال المباراة. وإذا ألغى المضيف المباراة أو أُلغيت تلقائيًا لقلة الحضور، يُسترد المبلغ لكل مشارك تلقائيًا وبالكامل. وإذا أزال المضيف لاعبًا، يُسترد المبلغ لذلك اللاعب بالكامل.",
"termsRefundTitle": "استرداد المشاركين وقاعدة الـ٤ ساعات",
"termsRefundDesc": "المشارك الذي ينسحب قبل ٤ ساعات أو أكثر من انطلاق المباراة يُسترد مبلغه بالكامل. وفي الساعات الأربع الأخيرة، لا يُسترد المبلغ بالكامل إلا إذا أخذ لاعب من قائمة الانتظار المقعد؛ وإلا فإن المبلغ يذهب للمضيف. الانسحاب بعد الانطلاق وعدم الحضور لا يُسترد. والمبالغ المخصومة سابقًا لا تُعاد حتى لو أُلغيت المباراة لاحقًا. وقد يؤدي تكرار إساءة استخدام الاستضافة أو الاسترداد إلى تقييد الحساب وفق قسم الحسابات."

// en.json — wallet (ledger labels)
"hostPayout": "Host payout", "joinerRefund": "Match refund", "joinFee": "Match fee", "hostForfeit": "Late-cancel forfeit"
// ar.json — wallet
"hostPayout": "مستحقات الاستضافة", "joinerRefund": "استرداد المباراة", "joinFee": "رسوم المباراة", "hostForfeit": "خصم الإلغاء المتأخر"
```

## 8. MatchCard badge styling contract (UI standards §6 edge states)
- koralink player-hosted: neutral green-tint badge `bg-brand-green/10 text-brand-green` —
  informative, not alarming: `playerHostedBadge`.
- self player-hosted: amber warning badge `bg-amber-100 text-amber-800` — stronger signal:
  `selfHostedBadge`.
- Neither badge renders for venue-hosted matches or legacy rows (`is_player_hosted=false`).
- Detail banner: amber left-border callout for self; neutral gray callout for koralink; both
  above the fold under the hero card. Host additionally sees the payout note; joiners see the
  refund note.

## 9. Contract verification checklist (run at Gate 3→4, show every result)
- [ ] joinMatch / leaveMatch / startMatch / completeMatch / cancelMatch still return the fully populated match (findOne outside tx); leave adds ONLY `your_leave_refund`
- [ ] New JSON fields flow: findOne + findNearby + getMyMatches select `is_player_hosted`, `booking_mode`, `host_payout_state`; adapters map both; no field silently undefined
- [ ] match_players.fee_paid_sar written in the SAME tx as the seat insert; refunds read it back per-episode
- [ ] Idempotency: `join-fee-{uuid}`, `refund-join-{mpId}`, `host-forfeit-{mpId}`, `host-payout-{matchId}` — no deterministic per-user keys anywhere (run #20 regression test: join→leave→rejoin→cancel must not 500)
- [ ] Refund matrix unit tests pin: ≥4h refund, <4h+backfill refund, <4h no-queue forfeit, host-cancel 100% fan-out, remove-player 100%, forfeit-not-refunded-on-later-cancel, boundary exactly-4h
- [ ] Payout math: SUM(current roster fees) − margin×count (margin from settings, not hardcoded), floor 0, round2 — unit test pins exact numbers; forfeits not double-counted
- [ ] Waitlist promotion: fee collection inside promoteNextInTx; can't-pay → skip; EXACTLY ONE call per freeing path
- [ ] Host consent: absent/false → 400 before ANY write (both modes)
- [ ] Self mode: NO koralink slot book, NO pitch-cost debit; payout state 'held' when fee condition, else 'not_applicable'
- [ ] Legacy rows: `not_applicable` → no payouts, no badge, zero behavior change
- [ ] i18n: every key above in BOTH en.json and ar.json; no hardcoded strings; badges/banner styled per §8
- [ ] `turbo run build` zero errors; `npx vitest run` (from apps/player-pwa) green; `npx tsc --noEmit` (apps/api) green
