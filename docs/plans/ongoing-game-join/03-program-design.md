# Gate 3: Program Design — Ongoing Game Join & Status Handling

> Program signatures, DTOs, and component prop definitions.

---

## 1. Backend Service Method Signature

```typescript
// apps/api/src/modules/matches/matches.service.ts
async joinMatch(userId: string, matchId: string): Promise<MatchResponse> {
  // Allow Open, Full, and InProgress
  if (match.status !== 'Open' && match.status !== 'Full' && match.status !== 'InProgress') {
    throw new BadRequestException('This match is no longer open for joining.');
  }
  ...
}
```

---

## 2. Frontend Component Interface

```typescript
// apps/player-pwa/src/components/matches/OngoingGameJoinSheet.tsx
interface OngoingGameJoinSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    matchTitle: string;
    price: number;
    currency?: string;
}
```

---

## 3. Verification Criteria
1. Non-participating user sees `"Join Ongoing Match"` CTA when viewing an `in_progress` match with open spots.
2. Clicking CTA opens `OngoingGameJoinSheet.tsx`.
3. User confirming proceedToJoin completes payment or direct join and adds them to roster.
4. `npx vitest run` passes 91/91 unit tests.
5. `turbo run build` passes with 0 errors.
