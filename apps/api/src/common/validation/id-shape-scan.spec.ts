import {
  findIdShapeCopies,
  stripLineComments,
  ID_SHAPE_DECL_PATTERN,
  ID_SHAPE_TYPE_PATTERN,
  ID_SHAPE_ASSIGNMENT_PATTERN,
} from './id-shape-scan';

/**
 * Run #96 — fixture suite for the id-shape tripwire scanner (Reviewer A
 * IMPORTANT follow-up to run #95's PR #65). Each banned form gets a positive
 * fixture; each benign form gets a negative fixture. The live-tree sweep
 * stays in id-shape.tripwire.spec.ts.
 */
describe('id-shape-scan fixtures', () => {
  const offender = (text: string) => findIdShapeCopies([{ relPath: 'x.ts', text }]);

  describe('banned declaration forms (must be caught)', () => {
    const cases: Array<[string, string]> = [
      ['plain const', "const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}$/;"],
      ['exported const', "export const UUID_SHAPE = /^[0-9a-f-]+$/;"],
      ['annotated const', "const UUID_SHAPE: RegExp = /^[0-9a-f-]+$/;"],
      ['readonly-annotated const', "const UUID_SHAPE: Readonly<RegExp> = /^[0-9a-f-]+$/;"],
      ['union-annotated const', "const UUID_SHAPE: RegExp | Readonly<RegExp> = /^[0-9a-f-]+$/;"],
      ['let declaration', "let UUID_SHAPE = /^[0-9a-f-]+$/;"],
      ['exported let', "export let UUID_SHAPE = /^[0-9a-f-]+$/;"],
      ['var declaration', "var UUID_SHAPE = /^[0-9a-f-]+$/;"],
      ['new RegExp form', "const UUID_SHAPE = new RegExp('^[0-9a-f-]+$');"],
      ['annotated new RegExp', "const UUID_SHAPE: RegExp = new RegExp('^[0-9a-f-]+$');"],
      ['type alias', "type UUID_SHAPE = RegExp;"],
      ['exported generic type alias', "export type UUID_SHAPE<T = unknown> = RegExp;"],
      ['assignment rebinding', "UUID_SHAPE = /[a-f0-9]/;"],
      ['commented-out then real', "const X = 1;\nlet UUID_SHAPE = /x/;"],
    ];

    it.each(cases)('catches: %s', (_label, text) => {
      expect(offender(text)).toEqual(['x.ts']);
    });
  });

  describe('benign forms (must NOT be caught)', () => {
    const cases: Array<[string, string]> = [
      ['commented example', "// const UUID_SHAPE = /^[0-9a-f-]+$/;"],
      ['commented let example', "// let UUID_SHAPE = /x/ — never do this"],
      ['indented comment', "  // type UUID_SHAPE = RegExp;"],
      ['unrelated const', "const UUID_SHAPES = [];"],
      ['unrelated type', "type UUID_SHAPE_MSG = string;"],
      ['usage of the shared import', "const ok = UUID_SHAPE.test(id);"],
      ['comparison usage', "if (UUID_SHAPE === undefined) {}"],
      ['javadoc mentioning name', "* UUID_SHAPE is defined in id-shape.ts"],
      ['string mentioning name (no assignment shape)', "const hint = 'UUID_SHAPE lives in id-shape.ts';"],
      ['object property', "const cfg = { UUID_SHAPE: /x/ };"],
    ];

    it.each(cases)('ignores: %s', (_label, text) => {
      expect(offender(text)).toEqual([]);
    });

    it('documented limitation: assignment-shaped text inside a string IS flagged (fail-loud)', () => {
      expect(offender("const hint = 'const UUID_SHAPE = /x/;';")).toEqual(['x.ts']);
    });
  });

  describe('comment stripping', () => {
    it('strips line comments only', () => {
      const src = "const a = 1; // trailing note\nconst b = 2;";
      expect(stripLineComments(src)).toBe("const a = 1; \nconst b = 2;");
    });

    it('leaves block comments untouched (documented limitation)', () => {
      const src = "/* const UUID_SHAPE = /x/; */";
      expect(stripLineComments(src)).toBe(src);
      // Documented: a block comment containing a declaration-shaped line is a
      // false positive — same fail-loud cost class as run #95's r4 note.
      expect(ID_SHAPE_DECL_PATTERN.test(stripLineComments(src))).toBe(true);
    });
  });

  describe('pattern hygiene', () => {
    it('type pattern requires assignment', () => {
      expect(ID_SHAPE_TYPE_PATTERN.test('type UUID_SHAPE;')).toBe(false);
      expect(ID_SHAPE_TYPE_PATTERN.test('type UUID_SHAPE = RegExp;')).toBe(true);
    });
    it('assignment pattern does not match == or ===', () => {
      expect(ID_SHAPE_ASSIGNMENT_PATTERN.test('UUID_SHAPE === other')).toBe(false);
      expect(ID_SHAPE_ASSIGNMENT_PATTERN.test('UUID_SHAPE == other')).toBe(false);
      expect(ID_SHAPE_ASSIGNMENT_PATTERN.test('UUID_SHAPE = other')).toBe(true);
    });
  });
});
