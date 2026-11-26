# Run #234 — P2-408 Admin offline affordance + login localization (4-Gate compact)

## Gate 0 — Retrospective (area audit)
- Area: `apps/admin` login page + offline UX; standing admin idioms from PRs #291/#294/#295/#299.
- **Premise correction (claims≠facts, parent code-read run #234):** Reviewer B #233's "admin console
  has no offline affordance" is REFUTED as a blanket claim — `OfflineBanner` + `useOnline()` exist
  since run #42 (`9335eded`), mounted globally in the `(dashboard)` layout (covers all HQ+partner
  routes). **Real remaining scope:** (1) login page sits OUTSIDE the `(dashboard)` layout → no
  banner, no offline gating on its 3 submits (dev-login / send-OTP / verify-OTP); (2)
  offline-gating of destructive/write submits on dashboard surfaces (banner shows but a user can
  still fire a mutation that hangs); (3) Reviewer A #234 rider: login page carries TWO hardcoded-EN
  strings bypassing the P2-401 standard (player-redirect banner `login/page.tsx:24-26`,
  OTP-no-token `:66`).
- Recent commits in area: PR #299 `3d3e2fe2` (apiErrorToMessage), PR #294 `a35805af` (can() sweep),
  PR #295 `d1c771ac` (review.moderate), PR #291 `9d52709a` (Blocked.tsx removal).
- fix:feat ratio healthy (recent history = triaged review fixes, no reactive loop).

## Gate 1 — Product spec
- Problem: an offline admin opening the login page gets a raw network error with no "you're
  offline" explanation, and can spam OTP sends into a dead connection. Dashboard users can fire
  destructive writes while offline (banner shows but nothing stops the click).
- User story: as an admin/venue-owner, when my connection drops I see a localized offline notice
  and write submits are gated until reconnect (what/why/next per the error-message standard).
- Success criteria: login page shows the localized offline notice in the error slot when
  offline; all 3 login submits gated offline (auto-clears on reconnect); the 2 hardcoded-EN
  strings render localized copy EN+AR; tripwire test pins the standard; build+tests green.

## Gate 2 — Architecture
- **IMPLEMENTATION PIVOT (recorded, PR-Agent r1):** the login page does NOT mount the
  OfflineBanner component — it self-contains the offline notice: `const online = useOnline()`;
  the notice is COMPUTED (`online ? error : t('hq.offlineNotice')`, not latched) so it
  auto-clears on reconnect, rendered in a `role="alert"` slot; the three submit handlers
  early-return offline and buttons carry `disabled={!online || loading}`. Strictly better than
  a banner mount: no double-banner risk inside the centered card, no layout variant needed.
- **i18n:** new `hq`-ns keys (login page uses `useTranslations('hq')`): `offlineNotice`,
  `playerRedirect` (replaces the player banner string), `otpNoToken` (replaces :66 string) —
  EN+AR parity (what/why/next copy per error-message standard).
- **OUT OF SCOPE (pre-declared):** dashboard write-surface offline-gating is split to rider row
  P2-412 (surfaces proved non-uniform — pages + drawers + ConfirmDialog; census-first sweep per
  the P2-400 pattern). NOT in this PR.
- Files (delivered): `apps/admin/src/app/login/page.tsx`,
  `apps/admin/src/messages/{en,ar}.json` (hq ns), `apps/admin/test/login-offline.test.tsx`
  (new tripwire, 6 pins).

## Gate 3 — Program design (contract)
- `useOnline(): boolean` (existing, SSR-safe initial true — no hydration risk).
- OfflineBanner already consumed from `common.offlineBanner` — no change.
- New `hq` keys (exact): `offlineNotice` = "You're offline — reconnect to sign in. Your entries
  are kept." / AR "أنت غير متصل بالإنترنت — أعد الاتصال لتسجيل الدخول. مدخلاتك محفوظة."
- `playerRedirect` = "This console is for admins and venue owners only. Players use the KoraLink
  app." / AR "هذه اللوحة للأدمن ومالكي الملاعب فقط. اللاعبون يستخدمون تطبيق كورا لينك."
- `otpNoToken` = "OTP verified but no session token was returned. This surface requires cookie
  sessions in production. Please retry." / AR "تم التحقق من الرمز لكن لم يُرجَع رمز جلسة. هذه
  الواجهة تتطلب جلسات كوكيز في الإنتاج. حاول مجددًا."
- Write-surface offline notice reuses `hq.offlineNotice` (single key, no per-surface forks).
- Tests: `apps/admin/test/login-offline.test.tsx` — pins: (a) offline early-return shows
  hq.offlineNotice in the error slot; (2) all 3 buttons disabled offline; (c) both former
  hardcoded strings render from messages (grep-pins ban the literals in the source file); (d)
  write-surface gating pinned per component.

## Launch-order context
- F-items: all owner-gated (F7-rest needs owner Coolify A2 session; F8 = URI flip after A4; F10
  after A6) → none buildable → small launch items next → P2-408 = board-recommended admin pick.
- Zero open PRs (dup-PR guard pass). Admin state check: tree clean, admin service active.
