# Gate 0 — Retrospective: Chat Send, Dead UI, Error Boundaries, Public Profile

**Date:** 2026-08-11
**Baseline:** `5bbdc0b` (slot payment, cancellation, recurring slots, calendar)

---

## What's Broken

| Issue | Current State | Fix |
|-------|--------------|-----|
| **ChatSheet send disabled** | `disabled` input + button, "coming soon" tooltip. Backend WS gateway has `send-message` handler. `useMatchChat` has `sendMessage` mutation. Only the ChatSheet component blocks it. | Remove `disabled`, wire `sendMessage.mutate()`, add loading/error/success states |
| **No ErrorBoundary** | A single component crash white-screens the app | Add `<ErrorBoundary>` at layout level with retry button |
| **Profile dead links confirmed working** | Contact Support → `mailto:` (working), Privacy/Terms → `/privacy` `/terms` (routes, acceptable) | ✅ Already fixed |
| **Play search confirmed working** | Search bar wired to `filteredMatches` | ✅ Already fixed |
| **Messages search confirmed working** | Toggle shows search bar with client-side filter | ✅ Already fixed |
| **Public profile API** | `usePublicProfile` hook calls `GET /users/${userId}` — need to verify endpoint exists | Check API controller, add if missing |
| **Chat WebSocket auth** | Gateway uses `handshake.auth.token` but PWA sends `withCredentials: true` cookies. Need token fallback. | Verify token flow, add Bearer fallback |
| **ChatSheet i18n** | Uses `t('chatSheet')` keys which exist | ✅ Already present |
| **UI Polish** | ChatSheet message list could be prettier — no timestamps grouping, no "today" dividers | Add message grouping by date, nicer bubbles |
