# Gate 0 — Audit #4: Business Logic & Infrastructure Completeness

**Feature:** `business-logic-completeness`  
**Date:** 2026-08-09  
**Baseline:** `569ab5b` — "fix: interactive completeness"  
**Scope:** Payment flow, form validation, error pages, i18n hardcoded strings, infrastructure

---

## Findings

### 🔴 C-1: Payment is completely fake — no wallet integration

**File:** `components/payment/PaymentSheet.tsx:38-45`  
```typescript
const handlePay = async () => {
    if (!agreed) return;
    setIsProcessing(true);
    // Simulate payment processing
    await new Promise(r => setTimeout(r, 1500));  // ← FAKE!
    setIsProcessing(false);
    onPaySuccess();
};
```

**Impact:** Users can join any match for free. No wallet deduction, no transaction recorded, no balance check enforced. The `onPaySuccess` callback calls `joinMatch.mutate()` without touching the wallet at all. The "Top-up and Pay SAR X" button label is misleading — no top-up or payment occurs.

**What should happen:**
1. Check wallet balance ≥ match price
2. If insufficient, show "Insufficient balance" + top-up CTA
3. If sufficient, call `POST /wallet/topup` or debit endpoint
4. Then call `POST /matches/:id/join`

---

### 🔴 C-2: PaymentSheet has 12 hardcoded English strings — no i18n

| String | Line |
|--------|------|
| "Cart" | 79 |
| "Refund Policy" | 134 |
| "Non-refundable if cancelled..." | 136 |
| "I agree to the cancellation policy..." | 161 |
| "Processing..." | 184 |
| "Top-up and Pay SAR" | 187 |
| "stcpay" / "mada" | 193-196 |
| "Total" / "Wallet" / "To pay" | 115, 119, 124 |

**Violates AGENTS.md §5.1:** "Every user-facing string MUST have keys in BOTH ar.json AND en.json."

---

### 🟡 I-1: HostMatchForm venue picker has 4 hardcoded English strings

| String | Line |
|--------|------|
| "Select a Venue" | 447 |
| "Search by city..." | 456 |
| "Loading venues..." | ~470 |
| "No venues found" | ~480 |

---

### 🟡 I-2: Match detail page join flow skips actual payment

**File:** `app/[locale]/match/[id]/page.tsx:88-98`  
```typescript
const handleJoinClick = () => setShowPayment(true);
const handlePaySuccess = () => {
    setShowPayment(false);
    joinMatch.mutate(id);  // Joins without wallet deduction
};
```

The payment sheet collects agreement but never deducts wallet. After "payment," it calls `joinMatch` directly. The wallet balance shown in the sheet is informational only — never actually used.

---

### 🟡 I-3: HostMatchForm `createMatch` error shows raw API message

**File:** `components/host/HostMatchForm.tsx:427-433`  
```typescript
{createMatch.error instanceof Error
    ? createMatch.error.message
    : 'Failed to create match. Please try again.'}
```

The fallback string is hardcoded English. Also, the `FetchError` from the fetcher has `.message` which may be a raw HTTP status text like "Request failed with status 400" — not user-friendly.

---

### 🟡 I-4: not-found page locale detection from referer — unreliable

**File:** `app/[locale]/not-found.tsx:18-22`  
```typescript
const referer = headersList.get('referer') ?? '';
const localeMatch = referer.match(/\/(\w{2})\//);
const locale = (localeMatch?.[1] === 'ar' ? 'ar' : 'en');
```

If user types a URL directly, there is no referer → defaults to English even for Arabic users. This is a server component so it can't access the URL path directly for locale detection.

---

### 🟢 M-1: HostMatchForm `maxPlayers` doesn't include host spot

**File:** `components/host/HostMatchForm.tsx:76`  
```typescript
const maxPlayers = format ? parseInt(format.charAt(0)) * 2 : 14;
```

For "7v7", maxPlayers = 14. But the match creation adds the host as a match_player (is_host: true). So effectively there are 15 players in a 7v7 match. The max_players field sent to the API includes the host already (the `createMatch` service inserts the host). So `maxPlayers` should be `<format_players> * 2` which IS 14 — correct for 7v7 (host + 13 others = 14 total).

Actually re-reading: `createMatch` inserts the host AND sets `max_players: dto.max_players`. So max_players = 14 for 7v7, and host takes 1 of those 14. That leaves 13 spots for joiners. Since the format is "7 vs 7" = 14 players on field, max_players=14 is correct. The host is on the field too. ✅ No bug here.

---

## Summary

| # | Severity | Issue |
|---|----------|-------|
| C-1 | 🔴 CRITICAL | Payment is fake — `setTimeout` instead of wallet API |
| C-2 | 🔴 CRITICAL | PaymentSheet: 12 hardcoded English strings, no i18n |
| I-1 | 🟡 IMPORTANT | HostMatchForm venue picker: 4 hardcoded strings |
| I-2 | 🟡 IMPORTANT | Join flow skips wallet deduction entirely |
| I-3 | 🟡 IMPORTANT | Raw API error messages shown to users |
| I-4 | 🟡 IMPORTANT | 404 page locale detection unreliable |
| M-1 | 🟢 VERIFIED OK | maxPlayers includes host correctly |

---

**⏸️ STOP — 6 bugs found (2 CRITICAL, 4 IMPORTANT).** Payment is the biggest gap — matches can be joined for free.
