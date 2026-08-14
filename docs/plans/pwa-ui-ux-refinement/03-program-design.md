# Gate 3: Program Design — Component Contracts & Signatures

> Component contracts, TypeScript signatures, and explicit styling specs for UI/UX standardizations.

---

## 1. CSS Custom Property Declarations (`apps/player-pwa/src/styles/globals.css`)

```css
:root {
  --bottom-nav-height: calc(4.5rem + env(safe-area-inset-bottom));
  --floating-cta-bottom: calc(var(--bottom-nav-height) + 1.75rem);
  --top-safe-inset: max(1rem, env(safe-area-inset-top));
  --color-brand-green: #254132;
  --color-brand-green-light: #2d5c3e;
  --color-brand-red: #d4494c;
  --color-brand-black: #202124;
  --color-brand-bg: #f7f8f7;
}

body {
  @apply bg-slate-950 text-brand-black;
  overscroll-behavior: none;
  height: 100%;
  height: 100dvh;
  overflow: hidden;
  position: fixed;
  width: 100%;
}
```

---

## 2. Component Design Specs

### 2.1 `MobileFrame.tsx` Contract
```tsx
export default function MobileFrame({ children, className = '' }: MobileFrameProps) {
  return (
    <div className="w-full min-h-[100dvh] bg-slate-950 flex items-center justify-center">
      <div
        className={`
          w-full max-w-md md:max-w-lg
          min-h-[100dvh] md:min-h-0 md:h-[96dvh]
          bg-white md:rounded-[32px] md:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)]
          md:border md:border-slate-800/80
          relative overflow-hidden
          flex flex-col
          ${className}
        `}
      >
        {children}
      </div>
    </div>
  );
}
```

### 2.2 `MatchRulesSheet.tsx` Compact Contract
```tsx
export default function MatchRulesSheet({ isOpen, onClose }: MatchRulesSheetProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[60]" onClick={onClose} />
      <div className="fixed bottom-0 inset-x-0 z-[70] bg-white rounded-t-3xl max-w-md md:max-w-lg mx-auto animate-slide-up">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Title */}
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-base font-bold text-brand-black">{t('matchDetail.viewRules')}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" strokeWidth={2} />
          </button>
        </div>

        {/* Compact 2-Column Rules Grid */}
        <div className="px-5 pb-4 grid grid-cols-2 gap-2.5">
          {RULES.map((rule) => (
            <div key={rule.key} className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-lg bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 text-brand-green" strokeWidth={1.75} />
                </div>
                <h3 className="text-xs font-bold text-brand-black truncate">
                  {t(`matchRules.${rule.key}.title`)}
                </h3>
              </div>
              <p className="text-[11px] text-gray-500 leading-snug line-clamp-2">
                {t(`matchRules.${rule.key}.body`)}
              </p>
            </div>
          ))}
        </div>

        {/* Action Button */}
        <div className="px-5 pb-5 pb-safe">
          <button onClick={onClose} className="w-full py-3 rounded-xl bg-brand-green text-white text-sm font-bold active:scale-[0.98] transition-transform">
            {t('matchRules.gotIt')}
          </button>
        </div>
      </div>
    </>
  );
}
```

### 2.3 Floating CTA Position Contract
Across `match/[id]/page.tsx` and `clubs/[id]/page.tsx`:
```tsx
<div className="fixed bottom-[var(--floating-cta-bottom)] inset-x-0 max-w-md md:max-w-lg mx-auto px-5 z-40">
  ...
</div>
```

---

## 3. Implementation Verification Checklist
1. `npm run build` must pass cleanly across all workspaces.
2. `vitest run` must pass with 100% test success.
3. Floating CTAs position at `--floating-cta-bottom` with zero Play FAB overlap.
4. `MatchRulesSheet` fits 100% in view without vertical scrollbars.
5. Top bar controls use `--top-safe-inset` for safe notch clearance.
6. Desktop view renders a sleek centered app frame on a dark slate canvas.
