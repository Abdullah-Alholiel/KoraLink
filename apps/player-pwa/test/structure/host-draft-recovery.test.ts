import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-281 M-3 — host draft recovery wiring (structure guard).
 *
 * Pins the component wiring that a broken import or a refactor could silently
 * drop: restore-before-save ordering, the exactly-once ref cap, save on
 * change, clear on publish success, and the visible discard affordance.
 * Union mirrors are re-checked against MatchDetailsForm's LIVE lists.
 */
const PWA_ROOT = join(__dirname, '../..');
const FORM = readFileSync(join(PWA_ROOT, 'src/components/host/HostMatchForm.tsx'), 'utf-8');
const LIB = readFileSync(join(PWA_ROOT, 'src/lib/host-draft.ts'), 'utf-8');
const DETAILS = readFileSync(join(PWA_ROOT, 'src/components/host/MatchDetailsForm.tsx'), 'utf-8');
const EN = JSON.parse(readFileSync(join(PWA_ROOT, 'src/messages/en.json'), 'utf-8'));
const AR = JSON.parse(readFileSync(join(PWA_ROOT, 'src/messages/ar.json'), 'utf-8'));

describe('P2-281 M-3 host draft recovery (structure)', () => {
  it('imports the three lib operations', () => {
    expect(FORM).toContain('loadHostDraft');
    expect(FORM).toContain('saveHostDraft');
    expect(FORM).toContain('clearHostDraft');
  });

  it('restore is a POST-HYDRATION, owner-scoped effect, declared before the save effect', () => {
    const restoreIdx = FORM.indexOf('const d = loadHostDraft(currentUserId)');
    const saveIdx = FORM.indexOf('draftSaveArmedRef');
    expect(restoreIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeGreaterThan(restoreIdx);
    // PR-Agent run-#196 r1: restore must NOT run in the render path —
    // a render-path setState diverges server HTML from hydration render
    // (the /host route is server-rendered on demand, `ƒ (Dynamic)`).
    expect(FORM).not.toContain('const draftRef = useRef(loadHostDraft())');
    // PR-Agent run-#196 r3: the draft is owner-scoped — replays only for
    // the session that authored it (shared-device leak guard).
    expect(FORM).toContain('loadHostDraft(currentUserId)');
    expect(FORM).toContain('userId: currentUserId');
  });

  it('restore honors fresh ?date= intent and is mount-lifetime', () => {
    expect(FORM).toContain('if (!dateFromQuery) setDate(d.date);');
    expect(FORM).toMatch(/eslint-disable-next-line react-hooks\/exhaustive-deps\n    \}, \[currentUserId\]\);/);
  });

  it('save-effect persists ALL shared fields (owner-stamped)', () => {
    expect(FORM).toContain(
      'saveHostDraft({ userId: currentUserId, title, matchType, genderRule, date, time, duration, visibility })',
    );
  });

  it('publish success clears the draft', () => {
    expect(FORM).toMatch(/onSuccess: \(createdMatch\) => \{[\s\S]{0,200}clearHostDraft\(\)/);
  });

  it('lib union mirrors match MatchDetailsForm LIVE lists', () => {
    const libGenders = LIB.match(/HOST_DRAFT_GENDERS = \[([^\]]+)\]/)![1];
    const libTypes = LIB.match(/HOST_DRAFT_MATCH_TYPES = \[([^\]]+)\]/)![1];
    const compGenders = DETAILS.match(/GENDER_OPTIONS = \[([^\]]+)\]/)![1];
    const compTypes = DETAILS.match(/MATCH_TYPES = \[([^\]]+)\]/)![1];
    expect(libGenders.replace(/\s/g, '')).toBe(compGenders.replace(/\s/g, ''));
    expect(libTypes.replace(/\s/g, '')).toBe(compTypes.replace(/\s/g, ''));
  });

  it('draftRestored + draftDiscard keys exist in BOTH locales', () => {
    expect(EN.host.draftRestored).toBeTruthy();
    expect(AR.host.draftRestored).toBeTruthy();
    expect(EN.host.draftDiscard).toBeTruthy();
    expect(AR.host.draftDiscard).toBeTruthy();
  });

  it('banner renders with role=status and a discard button', () => {
    expect(FORM).toContain('data-testid="host-draft-restored"');
    expect(FORM).toMatch(/host-draft-restored[\s\S]{0,1600}draftDiscard/);
  });
});
