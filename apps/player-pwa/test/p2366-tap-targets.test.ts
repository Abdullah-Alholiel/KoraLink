import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * P2-366 (run #215): census tripwire for the 44px hit-target standard.
 *
 * The project's WCAG 2.5.8 token `min-h-hit` / `min-w-hit` (tailwind.config.ts,
 * P2-52 run #40) was never adopted by the sheet-close button family — they
 * rendered 32–36px targets (`w-8 h-8` / `w-9 h-9`). This census scans every
 * `<button` opening tag in src/components and src/app (multi-line JSX tags
 * included) and asserts that a button whose className carries a compact
 * `w-8 h-8` / `w-9 h-9` visual ALSO carries `min-h-hit` and `min-w-hit`, so
 * the visual stays compact while the touch target is >=44px.
 *
 * Only literal `<button` tags are inspected — decorative divs/spans/icons
 * (avatars, spinners, error icons) are not tap targets and are never matched.
 */

const appRoot = path.resolve(__dirname, '..');
const SCAN_DIRS = ['src/components', 'src/app'];

// PR-Agent r1: the census must be order-insensitive (className="h-8 w-8"
// evades a source-order regex) and must catch Tailwind's size-8/size-9
// shorthand (a single class that sets BOTH dimensions).
// PR-Agent r3: breakpoint-prefixed variants (sm:w-8 sm:h-8) ship the same
// sub-44px target on small screens — the optional `[\w-]+:` prefix eats
// `sm:`/`md:`/etc. (min-w-8 style utilities have no colon and stay out).
const COMPACT_W_RE = /(?:^|[\s`'"{])(?:[\w-]+:)?(?:w-(?:8|9)|size-(?:8|9))(?=[\s`'"}]|$)/;
const COMPACT_H_RE = /(?:^|[\s`'"{])(?:[\w-]+:)?(?:h-(?:8|9)|size-(?:8|9))(?=[\s`'"}]|$)/;
const HIT_H_RE = /(?:^|[\s`'"{])min-h-hit(?=[\s`'"}]|$)/;
const HIT_W_RE = /(?:^|[\s`'"{])min-w-hit(?=[\s`'"}]|$)/;

/**
 * Pre-existing compact buttons OUTSIDE the P2-366 scope. Ratchet: the count per
 * file must match EXACTLY — fixing one fails the test until the entry is
 * lowered/removed, and a NEW offender in any file (listed or not) fails
 * immediately. Run #224 (P2-392) FIXED the last 12 tracked debt buttons — the
 * registry is now EMPTY, so this census asserts zero compact-no-hit buttons
 * anywhere in src/components or src/app. Do not re-add entries: fix the button.
 */
const KNOWN_DEBT: Record<string, number> = {};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Returns the full opening-tag text starting at `start` (a `<button` index),
 *  respecting `{...}` JSX expressions and string/template literals so a `>`
 *  inside `onClick={() => ...}` does not end the tag early. */
function openingTag(src: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start + 1; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

/** Extracts the className attribute value (string literal or `{...}` expression). */
function classNameOf(tag: string): string | null {
  const idx = tag.search(/\bclassName=/);
  if (idx < 0) return null;
  let i = idx + 'className='.length;
  const open = tag[i];
  if (open === '"' || open === "'") {
    const end = tag.indexOf(open, i + 1);
    return tag.slice(i, end + 1);
  }
  if (open === '{') {
    let depth = 0;
    for (; i < tag.length; i++) {
      if (tag[i] === '{') depth++;
      else if (tag[i] === '}' && --depth === 0) return tag.slice(idx, i + 1);
    }
  }
  return null;
}

interface Offender {
  file: string;
  line: number;
  className: string;
}

function censusOffenders(files: { rel: string; src: string }[]): Offender[] {
  const offenders: Offender[] = [];
  for (const { rel, src } of files) {
    const re = /<button\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const cls = classNameOf(openingTag(src, m.index));
      if (!cls || !(COMPACT_W_RE.test(cls) && COMPACT_H_RE.test(cls))) continue;
      if (HIT_H_RE.test(cls) && HIT_W_RE.test(cls)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      offenders.push({ file: rel, line, className: cls });
    }
  }
  return offenders;
}

const sources = SCAN_DIRS.flatMap((d) => walk(path.join(appRoot, d))).map((f) => ({
  rel: path.relative(appRoot, f).split(path.sep).join('/'),
  src: fs.readFileSync(f, 'utf8'),
}));

/** The 13 interactive sites fixed by P2-366 (+ consent checkbox below). */
const P2366_SITES = [
  'src/components/payment/PaymentSheet.tsx',
  'src/components/profile/DeleteAccountSheet.tsx',
  'src/components/profile/SignOutConfirmSheet.tsx',
  'src/components/matches/ReportDisputeSheet.tsx',
  'src/components/matches/PlayerProfileSheet.tsx',
  'src/components/matches/ReportSheet.tsx',
  'src/components/matches/CancelMatchSheet.tsx',
  'src/components/matches/LeaveMatchSheet.tsx',
  'src/components/matches/PomResultsSheet.tsx',
  'src/components/matches/AttendanceSheet.tsx',
  'src/components/matches/OngoingGameJoinSheet.tsx',
  'src/components/matches/FilterBar.tsx',
  'src/components/host/HostMatchForm.tsx',
];

describe('P2-366 tap-target census (min-h-hit / min-w-hit on compact buttons)', () => {
  it('scans a real corpus (guards against a vacuous pass)', () => {
    expect(sources.length).toBeGreaterThan(50);
    // Order-insensitive: count compact buttons that carry BOTH hit tokens,
    // whatever the w/h/hit class order (PR-Agent r2: a literal-order regex
    // both misses compliant sites and fails on harmless reorders).
    const compliant = sources.reduce(
      (n, { src }) => {
        const re = /<button\b/g;
        let m: RegExpExecArray | null;
        let count = 0;
        while ((m = re.exec(src))) {
          const cls = classNameOf(openingTag(src, m.index));
          if (!cls) continue;
          if (
            COMPACT_W_RE.test(cls) &&
            COMPACT_H_RE.test(cls) &&
            HIT_H_RE.test(cls) &&
            HIT_W_RE.test(cls)
          )
            count++;
        }
        return n + count;
      },
      0,
    );
    expect(compliant).toBeGreaterThanOrEqual(15);
  });

  it('detects a compact button lacking the hit tokens (single- and multi-line tags)', () => {
    const fixture = [
      '<button onClick={() => a > b} className="w-8 h-8 rounded-full">x</button>',
      '<button\n  onClick={() => close()}\n  className={`w-9 h-9 flex ${x}`}\n>y</button>',
      '<button className="w-8 h-8 min-h-hit min-w-hit">ok</button>',
      '<div className="w-8 h-8 rounded-full" />',
      '<span className="w-9 h-9" />',
    ].join('\n');
    const found = censusOffenders([{ rel: 'fixture.tsx', src: fixture }]);
    expect(found.map((o) => o.line)).toEqual([1, 2]);
  });

  it('every P2-366 site file has zero compact buttons missing min-h-hit/min-w-hit', () => {
    const offenders = censusOffenders(sources.filter((s) => P2366_SITES.includes(s.rel)));
    expect(offenders).toEqual([]);
  });

  it('no NEW compact button anywhere in src/components or src/app lacks the hit tokens', () => {
    const offenders = censusOffenders(sources);
    const counts: Record<string, number> = {};
    for (const o of offenders) counts[o.file] = (counts[o.file] ?? 0) + 1;
    const unexpected = offenders.filter((o) => !(o.file in KNOWN_DEBT));
    expect(unexpected.map((o) => `${o.file}:${o.line} ${o.className}`)).toEqual([]);
    // Ratchet: known-debt counts are exact (lower the entry when you fix one).
    expect(counts).toEqual(KNOWN_DEBT);
  });

  it('PaymentSheet consent checkbox has a >=44px hit area with the 20px visual kept', () => {
    const src = sources.find((s) => s.rel === 'src/components/payment/PaymentSheet.tsx')!.src;
    const idx = src.indexOf('role="checkbox"');
    expect(idx).toBeGreaterThan(0);
    const start = src.lastIndexOf('<button', idx);
    const tag = openingTag(src, start);
    const cls = classNameOf(tag) ?? '';
    // r4 contract: the button IS the 44px box (h-11 w-11 = 2.75rem = 44px),
    // realized IN-ROW — no min-h-hit tokens and no negative margins.
    expect(cls).toMatch(/(?:^|[\s`'"{])h-11(?=[\s`'"}]|$)/);
    expect(cls).toMatch(/(?:^|[\s`'"{])w-11(?=[\s`'"}]|$)/);
    expect(cls).not.toMatch(/-m[seltbx]-/);
    // Visual box (20px) lives inside the button, unchanged.
    const after = src.slice(start + tag.length, src.indexOf('</button>', start));
    expect(after).toMatch(/w-5 h-5 rounded border-2/);
    // The label ROW stays plain (r2: no min-h-hit on the row — the layout
    // footprint is unchanged; the BUTTON alone is the 44px target).
    const rowStart = src.lastIndexOf('<div', start);
    const rowTag = openingTag(src, rowStart);
    expect(rowTag).not.toMatch(HIT_H_RE);
  });
});
