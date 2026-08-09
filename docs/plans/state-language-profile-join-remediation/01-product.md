# Gate 1 — Product Spec: State, Language, Profile & Join Remediation

**Feature:** `state-language-profile-join-remediation`  
**Date:** 2026-08-09

---

## Scope

Fix 7 bugs discovered in full-stack audit. Three CRITICAL bugs cascade-fix 5 features. Four IMPORTANT bugs fix remaining broken features.

## User Stories

| ID | Story | Bug | Priority |
|----|-------|-----|----------|
| US-1 | As a returning user, I see "Joined" badge after joining — no double Join button | C-1 | P0 |
| US-2 | As a host, I don't see the Join button on my own match | C-1 | P0 |
| US-3 | As a user, I can switch between Arabic and English from profile | C-2 | P0 |
| US-4 | As a user, I can view/edit my personal information from profile | C-3 | P0 |
| US-5 | As a user, the "My Games" page shows only matches I've joined | I-1 | P1 |
| US-6 | As a new user, I can complete onboarding without skill_level errors | I-2 | P1 |
| US-7 | As a user, I don't see other users' cached venue results | I-3 | P1 |
| US-8 | As a user, real-time chat works | I-4 | P1 |

## Success Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| SC-1 | Verify OTP → Zustand `user` populated → `isAuthenticated: true` | Check `useAppStore.getState().user` after verify |
| SC-2 | Join match → "Joined" badge appears without page refresh | Visual test on match detail |
| SC-3 | Host views own match → no Join button visible | Visual test |
| SC-4 | Tap Language on profile → locale toggles ar↔en | Navigation test |
| SC-5 | Tap Personal Info → navigates to edit form | Navigation test |
| SC-6 | `turbo run build` zero errors | Terminal output |
| SC-7 | `npx vitest run` 85/85 pass | Terminal output |
