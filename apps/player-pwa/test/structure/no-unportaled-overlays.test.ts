/**
 * Structure regression guard — NO UN-PORTALED OVERLAY OVERLAYS.
 *
 * Background (2026-08-16 incident): `PomConfirmModal` rendered `position:
 * fixed` z-[80]/z-[90] elements INLINE inside the match page's
 * scroll-container. On iOS WebKit, `-webkit-overflow-scrolling: touch`
 * makes that scroller a stacking context, so the modal painted BELOW the
 * body-level portaled voting sheet — invisible and un-tappable. The POTM
 * vote could never be confirmed on iPhone.
 *
 * RULE enforced here: any component with a `fixed inset-0` / `fixed
 * bottom-0` / `fixed top-0` overlay that intends to sit above sheets must
 * either (a) render it through `createPortal(..., document.body)` /
 * `<Portal>`, or (b) be on the reviewed ALLOWLIST below with a reason.
 *
 * Detection: for every source file that draws a fixed overlay class, it must
 * import a portal mechanism (createPortal or the Portal component). This is
 * deliberately structural, not behavioral — it catches the bug class at CI
 * time with zero rendering.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const PWA_ROOT = join(__dirname, '../../src');

/**
 * Reviewed-safe un-portaled fixed overlays. Every entry needs a reason.
 * `BottomSheet.tsx` itself portals internally (imports createPortal).
 */
const ALLOWLIST: Record<string, string> = {
  'components/layout/BottomSheet.tsx': 'implements the portal itself (createPortal)',
  'components/layout/Toast.tsx':
    'top toast mounted as a sibling of <main> in layouts — never inside a scroll container; z-[100] at root level',
  'providers/LocationProvider.tsx':
    'top permission banner at layout level — no scroll-container ancestor; renders above content but below sheets by design',
  'app/[locale]/match/[id]/page.tsx':
    'floating CTAs (WhatsApp invite / Join) at z-40 — intentionally BELOW sheets (z-[60]+) and nav; never needs to overlay a sheet',
  'app/[locale]/clubs/[id]/page.tsx':
    'floating Host CTA at z-40 — intentionally BELOW sheets (z-[60]+) and nav',
};

/** Files that must keep importing a portal mechanism. */
function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTsxFiles(full));
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

// Matches `fixed` followed by a positioning token (`inset-*`, `bottom-*`,
// `top-*`), INCLUDING arbitrary-value forms like `bottom-[var(--x)]` and
// `top-[calc(...)]`. The literal `-0` forms are a subset; `inset|bottom|top`
// catches all of them.
const FIXED_OVERLAY_RE = /className=\{?[`"'][^`"']*\bfixed\s+(inset|bottom|top)/;
const PORTAL_IMPORT_RE = /from\s+['"]react-dom['"]|createPortal|from\s+['"]@\/components\/layout\/Portal['"]/;

describe('structure: no un-portaled fixed overlays', () => {
  it('every fixed overlay is portaled or explicitly allowlisted', () => {
    const files = collectTsxFiles(PWA_ROOT);
    expect(files.length).toBeGreaterThan(50); // sanity: we actually scanned the tree

    const violations: string[] = [];
    let overlaysFound = 0;

    for (const file of files) {
      const rel = relative(PWA_ROOT, file).replaceAll('\\', '/');
      const src = readFileSync(file, 'utf8');

      const drawsFixedOverlay = FIXED_OVERLAY_RE.test(src);
      if (!drawsFixedOverlay) continue;
      overlaysFound++;

      const allowed = ALLOWLIST[rel];
      const usesPortal = PORTAL_IMPORT_RE.test(src);

      if (!usesPortal && !allowed) {
        violations.push(
          `${rel}: renders a fixed overlay without a portal. Wrap it in <Portal> (components/layout/Portal.tsx) or add to the ALLOWLIST with a reason.`,
        );
      }
    }

    expect(
      overlaysFound,
      'sanity: at least the known overlays exist (guard rotted if 0)',
    ).toBeGreaterThanOrEqual(6);

    expect(violations.join('\n') || 'none', 'un-portaled fixed overlays found').toBe('none');
  });
});
