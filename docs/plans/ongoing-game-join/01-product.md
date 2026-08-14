# Gate 1: Product Spec — Ongoing Game Join & Status Handling

> Product requirements, user stories, and acceptance criteria for joining ongoing matches.

---

## 1. Product Story

- **As a** non-participating player browsing available matches,
- **I want** to see and click the "Join Match" CTA button on an ongoing game (`in_progress`) if spots are still available,
- **So that** I receive a clear notification that the game has started, confirm my intent to join late, and participate in the match.

---

## 2. Acceptance Criteria

1. **Ongoing Game Join CTA**:
   - For non-participating users viewing an `in_progress` match with open spots (`openSpots > 0`), the floating CTA button shows `"Join Ongoing Match"`.
2. **Ongoing Game Join Sheet**:
   - Clicking `"Join Ongoing Match"` displays `OngoingGameJoinSheet.tsx`.
   - Explains that the match has already started and confirms late entry intent.
3. **Backend API Support**:
   - NestJS API `POST /matches/:id/join` successfully joins `InProgress` matches with available spots.
4. **Multilingual i18n**:
   - Complete Arabic (`ar.json`) and English (`en.json`) translations for ongoing match notifications and sheet CTAs.
