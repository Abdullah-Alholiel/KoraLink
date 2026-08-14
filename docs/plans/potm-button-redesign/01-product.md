# Gate 1: Product Spec — POTM Card Button Redesign & Voted State

> Product specs and acceptance criteria for compact POTM voting button and voted state indicator.

---

## 1. Product Story

- **As a** player viewing my completed matches on the Play screen feed,
- **I want** a compact, beautifully proportioned POTM voting button on the match card that clearly shows whether I have already voted,
- **So that** I can easily vote or see my voting status without visual clutter.

---

## 2. Acceptance Criteria

1. **Compact Sizing**:
   - POTM button label is concise (`🏆 Vote` when not voted, `✓ Voted` when voted).
   - Button dimensions match standard `MatchCard` pills (`text-xs font-semibold px-4 py-2 rounded-full`).
2. **Voted State**:
   - `hasVoted === true`: Button shows `✓ Voted` in subtle `bg-amber-50 text-amber-800 border border-amber-200` style.
   - `hasVoted === false`: Button shows `🏆 Vote` in `bg-amber-500 text-white font-bold shadow-sm` style.
3. **API `has_voted` Field**:
   - `GET /matches` includes `has_voted` boolean per match for authenticated users.
