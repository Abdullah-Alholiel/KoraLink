import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';

/**
 * D5 (run #208, owner brief Part 1 item 1): every LITERAL translation key
 * referenced in src (t('a.b') style, resolved through that identifier's
 * useTranslations namespace at-or-above the call line) must exist in BOTH
 * en.json and ar.json. The owner hit `common.messages` rendering as a raw
 * key on the match page — this pin makes the next one fail vitest here
 * instead of surfacing in his console.
 *
 * Scope: literal string args only. Dynamic keys (t(errorKey(...)),
 * t(VERB_LABEL[v])) are covered by their own parity tests (verb-parity,
 * i18n key parity) and are deliberately out of scope here.
 *
 * STATED LIMITATION (PR-Agent r4, run #208 — accepted, not a defect in
 * practice): namespace resolution is "nearest same-named useTranslations
 * declaration at-or-above the call line". A shadowed translator id (e.g. a
 * function parameter named t) or a helper defined AFTER a component-level
 * redeclaration could be validated against the wrong namespace — a false
 * NEGATIVE (a real missing key passes). The tripwire is a heuristic net for
 * the common layout (one translator per scope), not a full static analysis;
 * the runtime MISSING_MESSAGE console check (P2-371 Playwright audit) is the
 * second, authoritative layer.
 */

type NestedRecord = { [key: string]: string | NestedRecord };

function hasKey(obj: NestedRecord, dotted: string): boolean {
  let cur: string | NestedRecord | undefined = obj;
  for (const part of dotted.split('.')) {
    if (cur == null || typeof cur !== 'object' || !(part in cur)) return false;
    cur = cur[part];
  }
  // PR-Agent r3 (run #208): a namespace NODE is not a translation —
  // t('payment') must fail here, not pass while rendering [object Object].
  return typeof cur === 'string';
}

function collectMissing(): string[] {
  const root = path.resolve(__dirname, '../src');
  const missing: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
      } else if (/\.(tsx?|js)$/.test(e.name) && !/\.test\./.test(e.name)) {
        const lines = fs.readFileSync(p, 'utf8').split('\n');
        const decls: { line: number; name: string; ns: string }[] = [];
        for (let i = 0; i < lines.length; i++) {
          for (const m of lines[i].matchAll(
            /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g,
          )) {
            decls.push({ line: i + 1, name: m[1], ns: m[2] ?? m[3] ?? '' });
          }
        }
        for (let i = 0; i < lines.length; i++) {
          // PR-Agent r5 (run #208): accept double-quoted keys too — the
          // declaration regex already did, the call regex didn't.
          for (const m of lines[i].matchAll(
            /\b(\w+)\(\s*(?:'([A-Za-z0-9_.]+)'|"([A-Za-z0-9_.]+)")\s*[),]/g,
          )) {
            const fn = m[1];
            const key = m[2] ?? m[3];
            let ns: string | null = null;
            for (const d of decls) if (d.name === fn && d.line <= i + 1) ns = d.ns;
            if (ns === null) continue; // not a useTranslations-derived call
            const full = ns ? `${ns}.${key}` : key;
            const inEn = hasKey(en as NestedRecord, full);
            const inAr = hasKey(ar as NestedRecord, full);
            if (!inEn || !inAr) {
              missing.push(
                `${path.relative(root, p)}:${i + 1} ${fn}('${key}') -> ${full}` +
                  ` [en:${inEn ? 'ok' : 'MISSING'} ar:${inAr ? 'ok' : 'MISSING'}]`,
              );
            }
          }
        }
      }
    }
  };
  walk(root);
  return missing;
}

describe('i18n literal-key tripwire (run #208 D5)', () => {
  it('every literal t() key referenced in src exists in BOTH en.json and ar.json', () => {
    const missing = collectMissing();
    expect(
      missing,
      `Missing translation keys (raw keys render for screen readers). Add or repoint each:\n${missing.join('\n')}`,
    ).toEqual([]);
  });
});
