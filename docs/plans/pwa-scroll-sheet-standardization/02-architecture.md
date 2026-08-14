# Gate 2: Architecture Spec — PWA Scroll Boundaries & Universal Sheet Engine

> Architectural changes to MobileFrame viewport height calculations and universal bottom sheet component patterns.

---

## 1. Viewport Height & Scroll Boundary Architecture

### 1.1 `MobileFrame.tsx`
```tsx
export default function MobileFrame({ children, className = '' }: MobileFrameProps) {
  return (
    <div className="w-full h-[100dvh] max-h-[100dvh] bg-brand-bg flex justify-center overflow-hidden">
      <div
        className={`
          w-full max-w-6xl
          h-[100dvh] max-h-[100dvh]
          bg-white shadow-sm
          relative overflow-hidden
          flex flex-col flex-1
          ${className}
        `}
      >
        {children}
      </div>
    </div>
  );
}
```

### 1.2 Viewport Height Chain
```
+-----------------------------------------------------------------------+
|  Root html / body (height: 100dvh; overflow: hidden; position: fixed)  |
|                                                                       |
|   +---------------------------------------------------------------+   |
|   |  MobileFrame (h-[100dvh] max-h-[100dvh] flex flex-col)        |   |
|   |                                                               |   |
|   |   +-------------------------------------------------------+   |   |
|   |   |  Page Scroll Viewport (flex-1 overflow-y-auto)        |   |   |
|   |   |  Calculates height = 100dvh - BottomNav height        |   |   |
|   |   |  Triggers smooth internal scrolling!                  |   |   |
|   |   +-------------------------------------------------------+   |   |
|   |                                                               |   |
|   |   [ BottomNav at flex-shrink-0 ]                              |   |
|   +---------------------------------------------------------------+   |
+-----------------------------------------------------------------------+
```

---

## 2. Universal Bottom Sheet Pattern

All 13 bottom sheet components will follow the unified architecture pattern:

```tsx
<>
  {/* Backdrop */}
  <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[60]" onClick={onClose} />

  {/* Centered Outer Container */}
  <div className="fixed bottom-0 inset-x-0 z-[70] flex justify-center max-w-6xl mx-auto px-0 md:px-4">
    {/* Sheet Panel */}
    <div className="w-full max-w-2xl bg-white rounded-t-3xl shadow-2xl animate-slide-up flex flex-col max-h-[85vh] pb-safe">
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>

      {/* Sheet Header */}
      <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0">
        ...
      </div>

      {/* Scrollable Content Region */}
      <div className="overflow-y-auto scroll-container flex-1 px-5">
        ...
      </div>

      {/* Fixed Footer CTA (optional) */}
      <div className="p-5 flex-shrink-0 border-t border-gray-100">
        ...
      </div>
    </div>
  </div>
</>
```
