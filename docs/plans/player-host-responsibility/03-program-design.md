# Gate 3 — Program Design (CONTRACT GATE)

Every shape below is copy-paste exact. Frontend and backend implement against THIS document.

## 1. Schema (migration `0039_player_host_payout.sql`)

```sql
-- enum first (idempotent)
DO $$ BEGIN
  CREATE TYPE "HostPayoutState" AS ENUM ('held', 'released', 'cancelled', 'not_applicable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_player_hosted boolean NOT NULL DEFAULT false;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS host_payout_state "HostPayoutState" NOT NULL DEFAULT 'not_applicable';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS host_accepted_terms_at timestamptz;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS join_payments_verified boolean NOT NULL DEFAULT true;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS fee_paid_sar numeric(10,2);
-- existing koralink-booked, still-unsettled matches: legacy-safe
UPDATE matches SET host_payout_state='not_applicable'
  WHERE booking_mode='koralink' AND host_payout_state='held' AND 1=0; -- no-op placeholder; defaults cover
CREATE INDEX IF NOT EXISTS matches_payout_state_idx ON matches (host_payout_state) WHERE host_payout_state='held';
```
Journal row: `0039_player_host_payout` in `public.__drizzle_migrations` (gap-guarded applier).

## 2. MatchesService — method signatures (explicit returns)

```ts
// createMatch — dto gains optional consent flag; service enforces it
async createMatch(hostId: string, dto: CreateMatchDto): Promise<MatchDetailApi>
//   RULE: booking_mode==='koralink' && !dto.acceptedHostingTerms
//     → BadRequestException('Hosting terms must be accepted before booking.')
//   persists: host_accepted_terms_at = now, is_player_hosted = (host.role==='Player'),
//             host_payout_state = 'held' (koralink + role Player) else 'not_applicable'

// joinMatch — NEW optional dto
async joinMatch(userId: string, matchId: string, dto?: JoinMatchDto): Promise<MatchDetailApi>
//   fee matches (is_player_hosted && booking_mode==='koralink' && price>0):
//     !dto?.idempotencyKey → BadRequestException('Payment verification key required')
//     insufficient balance → 409 ConflictException('join_insufficient_balance') [i18n-mapped]
//     tx: guarded debit (floor) → MATCH_FEE ledger (key `join-fee-{matchId}-{userId}-{dto.key}`)
//         → match_players insert WITH fee_paid_sar (atomic)

// leaveMatch(userId, matchId): Promise<MatchDetailApi>  // unchanged semantics; fee NOT refunded

// cancelMatch + auto-cancel tx: for each roster player with fee_paid_sar>0 (host excluded —
//   host already refunded separately): wallet CREDIT fee_paid_sar → REFUND ledger
//   (`refund-join-{matchId}-{userId}`, idempotent) — same tx as slot release
//   then UPDATE matches SET host_payout_state='cancelled' (guarded from 'held')

// completeMatch + autoCompletePastMatches: after status flip, in SAME tx:
releaseHostPayoutInTx(tx, matchId): Promise<{ paid: boolean; amountSar: string }>
//   payout = round2(SUM(fee_paid_sar) − 5.00×count(fee_paid_sar)); floor 0
//   if payout>0: guarded wallet CREDIT host → PRIZE ledger (`host-payout-{matchId}`)
//   single-shot: UPDATE matches SET host_payout_state='released'
//     WHERE id=? AND host_payout_state='held'  → rowCount 0 ⇒ already released (no-op)
```

## 3. Exact JSON — `GET /matches/:id` (changed fields only; all other fields unchanged)
```json
{
  "id": "m-123",
  "is_player_hosted": true,
  "host_payout_state": "held",
  "booking_mode": "koralink",
  "host": { "id": "u-1", "full_name": "Faisal", "avatar_url": "..." },
  "price_per_player": 41.43
}
```
`GET /matches` feed rows + `GET /users/me/matches` rows additionally carry (snake_case, flat):
```json
{ "is_player_hosted": true, "booking_mode": "koralink", "host_payout_state": "held" }
```

## 4. Frontend types (types/index.ts)
```ts
export interface Match {
  // ...existing
  isPlayerHosted?: boolean;      // adaptMatchList/adaptMatchDetail: !!row.is_player_hosted
  hostPayoutState?: 'held' | 'released' | 'cancelled' | 'not_applicable';
}
```
Adapter contract: `adaptNearbyMatch` / `adaptMatchDetail` map `is_player_hosted → isPlayerHosted`
and `host_payout_state → hostPayoutState`. No other mapping changes.

## 5. Frontend hooks
```ts
// useMatchActions.ts
useJoinMatch(): UseMutationResult<unknown, FetchError, string | { matchId: string; idempotencyKey?: string }>
//   string form → POST /matches/:id/join (no body) — existing behavior for free matches
//   object form → POST /matches/:id/join { idempotencyKey }
//   FetchError 409 'join_insufficient_balance' → onError shows errors.joinInsufficientBalance
//   FetchError 400 payment-key → errors.joinPaymentRequired
```
PaymentSheet: `onPay` now = `joinMatch.mutate({ matchId, idempotencyKey: crypto.randomUUID() })`;
`onPaySuccess` unchanged (optimistic join reconciles by refetch). `/wallet/pay` call is REMOVED
from the join path (endpoint stays for other flows).

## 6. Error-message contract (money-flow standard: what+why+what-next, EN+AR)
| API | FE key (en) |
|-----|-------------|
| 409 join_insufficient_balance | errors.joinInsufficientBalance: "Not enough wallet balance to join. Top up your wallet and try again." |
| 400 payment-key missing | errors.joinPaymentRequired: "We couldn't verify your payment. No money was taken — please try joining again." |
| 400 hosting terms | hostForm.hostingConsentRequired (form-level, blocks pre-submit) |

## 7. i18n key contract (BOTH files; ar = native Arabic, Hindi numerals handled by formatter)

```jsonc
// en.json — matchCard
"playerHostedBadge": "Player-hosted · Booked on KoraLink"
// en.json — matchDetail
"playerHostedTitle": "Hosted by a player",
"playerHostedBanner": "{host} booked this slot through KoraLink and takes full responsibility for this match — venue access, timing, and game management. KoraLink processes payments only.",
"playerHostedPayoutNoteHost": "Your payout is held securely and released automatically after the match is completed.",
"playerHostedPayoutNotePlayer": "Your payment is held securely. It is refunded in full if the match is cancelled.",
// en.json — hostForm
"hostingConsentTitle": "Hosting responsibility",
"hostingConsentBody": "I host this match as a player on a KoraLink-booked slot. I am responsible for the venue, schedule, and game. My payout is held until the match is completed; if it is cancelled, all joiners are refunded automatically.",
"hostingConsentLabel": "I understand and accept",
"hostingConsentRequired": "You must accept the hosting terms to book.",
// en.json — legal (terms page)
"lastUpdated": "Last updated",           // value text below stays in page
"termsHostingTitle": "Player-hosted matches on KoraLink bookings",
"termsHostingDesc": "When a player hosts a match on a slot booked through KoraLink, that hosting player — not KoraLink — is responsible for the venue, the schedule, and the conduct of the game. KoraLink processes payments and holds them securely until the match is completed.",
"termsHostingPayoutDesc": "The hosting player's payout is released only after the match is completed. Joiners' payments are held with it. If a match is cancelled before completion, every joiner is refunded automatically and in full; voluntary withdrawal after joining is not refunded. Repeated no-shows or abuse of hosting responsibility may result in account restrictions under the Accounts section.",
// ar.json — matchCard
"playerHostedBadge": "مستضافة من لاعب · محجوزة عبر كورالينك"
// ar.json — matchDetail
"playerHostedTitle": "مستضافة من لاعب",
"playerHostedBanner": "حجز {host} هذا الملعب عبر كورالينك وهو المسؤول الكامل عن هذه المباراة — دخول الملعب والتوقيت وإدارة اللعبة. كورالينك يعالج المدفوعات فقط.",
"playerHostedPayoutNoteHost": "مستحقاتك محفوظة بأمان وتُصرف تلقائيًا بعد اكتمال المباراة.",
"playerHostedPayoutNotePlayer": "دفعتك محفوظة بأمان وتُسترد بالكامل في حال إلغاء المباراة.",
// ar.json — hostForm
"hostingConsentTitle": "مسؤولية الاستضافة",
"hostingConsentBody": "أستضيف هذه المباراة كلاعب على ملعب محجوز عبر كورالينك. أنا مسؤول عن الملعب والجدول واللعبة. تُحفظ مستحقاتي حتى اكتمال المباراة، وعند الإلغاء يُسترد المبلغ لجميع المشاركين تلقائيًا.",
"hostingConsentLabel": "أفهم وأوافق",
"hostingConsentRequired": "يجب الموافقة على شروط الاستضافة لإتمام الحجز.",
// ar.json — legal
"termsHostingTitle": "المباريات المستضافة من لاعبين عبر حجوزات كورالينك",
"termsHostingDesc": "عندما يستضيف لاعب مباراة على ملعب محجوز عبر كورالينك، فإن اللاعب المستضيف — وليس كورالينك — هو المسؤول عن الملعب والجدول وسير اللعبة. كورالينك يعالج المدفوعات ويحفظها بأمان حتى اكتمال المباراة.",
"termsHostingPayoutDesc": "تُصرف مستحقات اللاعب المستضيف بعد اكتمال المباراة فقط. تُحفظ مدفوعات المشاركين معها. وعند إلغاء المباراة قبل اكتمالها، يُسترد المبلغ لكل مشارك تلقائيًا وبالكامل؛ أما الانسحاب الطوعي بعد الانضمام فلا يُسترد. وقد يؤدي تكرار عدم الحضور أو إساءة استخدام الاستضافة إلى تقييد الحساب وفق قسم الحسابات.",
```

## 8. Wallet ledger label keys (transactions list rendering)
```jsonc
// en wallet: "hostPayout": "Host payout", "joinerRefund": "Match refund"
// ar wallet: "hostPayout": "مستحقات الاستضافة", "joinerRefund": "استرداد المباراة"
```

## 9. Contract verification checklist (run at Gate 3→4, show every result)
- [ ] joinMatch / leaveMatch / startMatch / completeMatch / cancelMatch still return `this.findOne(matchId)` outside tx
- [ ] New JSON fields flow: findOne + findNearby + getMyMatches SQL all select `is_player_hosted`, `host_payout_state`; adapters map both; no field silently undefined
- [ ] match_players.fee_paid_sar written in the SAME tx as the seat insert; refund reads it back
- [ ] Idempotency keys: `join-fee-*`, `refund-join-*`, `host-payout-{matchId}` — all unique-constrained
- [ ] Payout math: SUM(fee) − 5×count, floor 0, round2 — unit test pins exact numbers
- [ ] Cancel refunds every paying joiner exactly once even on double-cancel (guarded UPDATE)
- [ ] Auto-complete path releases payout identically to manual completion
- [ ] Waitlist promotion: fee path inside promoteNextInTx; insufficient → skip; single call per freeing path
- [ ] Host consent: absent/absent-false on koralink → 400 before ANY write
- [ ] Legacy rows: `not_applicable` → no payout, no badge, zero behavior change
- [ ] i18n: every key above in BOTH en.json and ar.json; no hardcoded strings
- [ ] `turbo run build` zero errors; `npx vitest run` (from apps/player-pwa) green; `npx tsc --noEmit` (apps/api) green
