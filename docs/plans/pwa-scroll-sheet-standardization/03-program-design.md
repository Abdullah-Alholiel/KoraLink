# Gate 3: Program Design — Component Contracts & Universal Sheet Checklist

> Component specs and audit checklist for all 13 bottom sheets across the PWA.

---

## 1. Bottom Sheet Standardization Registry

| Component File | Role | Sheet Panel Max-Width | Scroll Strategy |
|---|---|---|---|
| [`ChatSheet.tsx`](file:///Users/abdullahalholaiel/Cursor/KoraLink/apps/player-pwa/src/components/matches/ChatSheet.tsx) | Match discussion chat | `max-w-2xl` | `max-h-[85vh] flex flex-col` |
| [`PaymentSheet.tsx`](file:///Users/abdullahalholaiel/Cursor/KoraLink/apps/player-pwa/src/components/payment/PaymentSheet.tsx) | Wallet/Moyasar checkout | `max-w-2xl` | `max-h-[80vh] overflow-y-auto` |
| [`FilterBar.tsx`](file:///Users/abdullahalholaiel/Cursor/KoraLink/apps/player-pwa/src/components/matches/FilterBar.tsx) | Match feed filters | `max-w-2xl` | `max-h-[80vh] overflow-y-auto` |
| [`MatchRulesSheet.tsx`](file:///Users/abdullahalholaiel/Cursor/KoraLink/apps/player-pwa/src/components/matches/MatchRulesSheet.tsx) | View match rules | `max-w-2xl` | Compact 2-column grid |
| [`CancelMatchSheet.tsx`](file:///Users/abdullahalholaiel/Cursor/KoraLink/apps/player-pwa/src/components/matches/CancelMatchSheet.tsx) | Host match cancellation | `max-w-xl` | Compact modal |
| [`LeaveMatchSheet.tsx`](file:///Users/abdullahalholaiel/Cursor/KoraLink/apps/player-pwa/src/components/matches/LeaveMatchSheet.tsx) | Player leave game | `max-w-xl` | Compact modal |
| [`PlayerProfileSheet.tsx`](file:///Users/abdullahalholaiel/Cursor/KoraLink/apps/player-pwa/src/components/matches/PlayerProfileSheet.tsx) | Player profile modal | `max-w-xl` | `max-h-[75vh] overflow-y-auto` |
| [`PomVotingSheet.tsx`](file:///Users/abdullahalholaiel/Cursor/KoraLink/apps/player-pwa/src/components/matches/PomVotingSheet.tsx) | Player of the Match voting | `max-w-2xl` | `max-h-[80vh] overflow-y-auto` |
| [`PomResultsSheet.tsx`](file:///Users/abdullahalholaiel/Cursor/KoraLink/apps/player-pwa/src/components/matches/PomResultsSheet.tsx) | POTM winner announcement | `max-w-2xl` | `max-h-[80vh] overflow-y-auto` |
| [`TeamLineupSheet.tsx`](file:///Users/abdullahalholaiel/Cursor/KoraLink/apps/player-pwa/src/components/matches/TeamLineupSheet.tsx) | Team squad sheet | `max-w-2xl` | `max-h-[80vh] overflow-y-auto` |
| [`VenuePickerSheet.tsx`](file:///Users/abdullahalholaiel/Cursor/KoraLink/apps/player-pwa/src/components/host/VenuePickerSheet.tsx) | Host venue selector | `max-w-2xl` | `max-h-[75vh] overflow-y-auto` |
| [`PublishWarningSheet.tsx`](file:///Users/abdullahalholaiel/Cursor/KoraLink/apps/player-pwa/src/components/host/PublishWarningSheet.tsx) | Host match publish warning | `max-w-xl` | Compact modal |
| [`wallet/page.tsx`](file:///Users/abdullahalholaiel/Cursor/KoraLink/apps/player-pwa/src/app/[locale]/(main)/wallet/page.tsx) | Wallet top-up modal | `max-w-xl` | Compact modal |

---

## 2. Verification Criteria
1. `MobileFrame` uses `h-[100dvh] max-h-[100dvh] overflow-hidden`.
2. `match/[id]/page.tsx` inner viewport uses `flex-1 overflow-y-auto scroll-container`.
3. Scrolling on `match/[id]` scrolls through all sections cleanly.
4. All 13 bottom sheets open as responsive slide-up panels centered within `max-w-6xl` container width.
5. `npx vitest run` passes 91/91 unit tests.
6. `turbo run build` passes with zero errors.
