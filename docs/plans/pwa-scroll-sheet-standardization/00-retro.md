# Gate 0: Retrospective — PWA Page Scroll & Universal Bottom Sheet Standardization

> Retrospective review of page scroll locking and bottom sheet sizing defects prior to Gate 1.

---

## 1. Defect Analysis

| Issue # | Area | Defect Description | Root Cause |
|---|---|---|---|
| **1** | Match Detail Page Scroll | User cannot scroll down on `match/[id]` page. | `MobileFrame` used `min-h-[100dvh]` instead of fixed `h-[100dvh]` / `h-full`. Since `body` has `overflow: hidden`, the inner `flex-1` div expanded indefinitely without constraining height, preventing `overflow-y-auto` from triggering. |
| **2** | Bottom Sheet Standardization | Bottom sheets (`ChatSheet`, `PaymentSheet`, etc.) render with inconsistent widths or unconstrained layouts on desktop/tablet. | Sheets used hardcoded `max-w-md` or inconsistent container wrappers, causing them to float awkwardly when the app container expanded to `max-w-6xl`. |

---

## 2. Technical Debt & Design Contracts

1. **App Viewport Height Contract**: `MobileFrame` MUST maintain `h-[100dvh] max-h-[100dvh]` so that child `flex-1 overflow-y-auto` containers calculate explicit viewport boundaries and scroll reliably.
2. **Universal Bottom Sheet Contract**: Every bottom sheet MUST use a standardized container pattern:
   - Outer overlay: `fixed inset-0 bg-black/60 backdrop-blur-xs z-[60]`
   - Centered responsive wrapper: `fixed bottom-0 inset-x-0 z-[70] flex justify-center max-w-6xl mx-auto`
   - Sheet panel: `w-full max-w-2xl bg-white rounded-t-3xl shadow-2xl animate-slide-up flex flex-col max-h-[85vh] pb-safe`
   - Internal scroll container: `overflow-y-auto scroll-container flex-1`
