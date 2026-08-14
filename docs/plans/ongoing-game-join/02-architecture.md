# Gate 2: Architecture Spec — Ongoing Game Join & Status Handling

> Data flow and architectural design for joining ongoing games across NestJS backend and Next.js PWA.

---

## 1. Data Flow & Sequence

```
User -> Clicks "Join Ongoing Match" CTA (match/[id])
  └─> Triggers OngoingGameJoinSheet.tsx
        └─> User confirms -> proceedToJoin()
              ├─> Free match -> POST /api/v1/matches/:id/join
              └─> Paid match -> PaymentSheet -> POST /api/v1/matches/:id/join
                    └─> NestJS matches.service.ts validates status (Open | Full | InProgress)
                          └─> Adds player to roster & returns updated match object
```

---

## 2. Component Design & i18n Contracts

### `OngoingGameJoinSheet.tsx`
Standardized bottom sheet modal:
- Container: `fixed bottom-0 inset-x-0 z-[70] flex justify-center max-w-6xl mx-auto px-0 md:px-4`
- Panel: `w-full max-w-xl bg-white rounded-t-3xl shadow-2xl animate-slide-up pb-safe`

### Keys added to `en.json` & `ar.json`:
- `matchDetail.ongoingGameTitle`: `"Ongoing Game"` / `"مباراة جارية"`
- `matchDetail.ongoingMatchNotice`: `"This match is currently in progress. You can still join the squad and participate late!"` / `"هذه المباراة جارية حالياً. يمكنك الانضمام وتأكيد مشاركتك في الملعب!"`
- `matchDetail.ongoingMatchWarning`: `"Note: The game has already started. Please head directly to the pitch after completing registration."` / `"ملاحظة: اللعبة بدأت بالفعل. يرجى التوجه مباشرة إلى الملعب بعد إكمال التسجيل."`
- `matchDetail.ongoingGameConfirm`: `"Join Ongoing Match"` / `"الانضمام للمباراة الجارية"`
