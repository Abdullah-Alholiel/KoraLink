/**
 * Shared scanner behind the id-shape tripwire (run #96 — Reviewer A IMPORTANT
 * follow-up to run #95's PR #65).
 *
 * Invariant: `UUID_SHAPE` is declared in EXACTLY one place —
 * common/validation/id-shape.ts (plus the tripwire spec that describes the
 * pattern in its own source). Run #95's scan only matched `const` with a bare
 * `: RegExp` annotation; Reviewer A showed `let` / `var` / `type` declarations
 * and non-bare annotations (`: Readonly<RegExp>`, union types) escape it. This
 * module closes those holes and strips `//`-line comments BEFORE matching so
 * a documented example in a comment can no longer fail CI (run #95 r4
 * residual MINOR).
 *
 * Kept as a pure exported function so the negative scenarios (each banned
 * form, each comment form) get REAL fixture tests instead of editing the
 * tripwire spec's own source on every case (the run-#95 convention).
 */

export const ID_SHAPE_DECL_PATTERN =
  /(?:export\s+)?(?:const|let|var)\s+UUID_SHAPE\s*(?::[^=]+)?=\s*(?:\/|new\s+RegExp)/;
export const ID_SHAPE_TYPE_PATTERN = /(?:export\s+)?type\s+UUID_SHAPE(?:\s*<[^>]*>)?\s*=/;
export const ID_SHAPE_ASSIGNMENT_PATTERN = /\bUUID_SHAPE\s*=(?!=)/;

/** Strip `//` line comments conservatively — only `//` at line start or after
 * whitespace counts, so URLs like `'https://x'` survive. Strings and block
 * comments are NOT parsed: a declaration sharing a line with a quoted
 * `//`-bearing string (or hidden behind a block comment) can still be missed,
 * and block-comment text can still false-positive. Both residual classes are
 * fail-loud-or-rare; the fixture suite pins the known cases. */
export function stripLineComments(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      const idx = line.search(/(^|\s)\/\//);
      if (idx === -1) return line;
      // Keep the whitespace that preceded the marker so offsets stay honest.
      return line.slice(0, idx === 0 ? 0 : idx + 1);
    })
    .join('\n');
}

export interface ScanFile {
  /** Repo-relative path used in offender reports. */
  relPath: string;
  /** Raw file text. */
  text: string;
}

export function findIdShapeCopies(files: ScanFile[]): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    const src = stripLineComments(file.text);
    if (
      ID_SHAPE_DECL_PATTERN.test(src) ||
      ID_SHAPE_TYPE_PATTERN.test(src) ||
      ID_SHAPE_ASSIGNMENT_PATTERN.test(src)
    ) {
      offenders.push(file.relPath);
    }
  }
  return offenders;
}
