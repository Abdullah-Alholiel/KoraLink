import { escapeIcsText } from './ics-text';

describe('escapeIcsText (P1-17d)', () => {
  it('escapes backslash FIRST so other escapes are not double-escaped', () => {
    expect(escapeIcsText('A\\B')).toBe('A\\\\B');
    expect(escapeIcsText('\\\\;')).toBe('\\\\\\\\\\;'); // \\\;  →  \\\\;
  });

  it('escapes semicolons', () => {
    expect(escapeIcsText('a;b')).toBe('a\\;b');
  });

  it('escapes commas', () => {
    expect(escapeIcsText('a,b')).toBe('a\\,b');
  });

  it('collapses CRLF and CR/LF to a literal \\n sequence', () => {
    expect(escapeIcsText('a\r\nb')).toBe('a\\nb');
    expect(escapeIcsText('a\nb')).toBe('a\\nb');
    expect(escapeIcsText('a\rb')).toBe('a\\nb');
  });

  it('rejects the Strix-shaped injection — CRLF + injected SUMMARY', () => {
    // Without escape, the controller interpolates this as:
    //   SUMMARY:Friday game
    //   SUMMARY:Hijacked
    //   ...continuation of the first event
    // With escape, it becomes a single literal \\n, so SUMMARY stays intact.
    const evil = 'Friday game\r\nSUMMARY:Hijacked\r\nDESCRIPTION:Pwned';
    const escaped = escapeIcsText(evil);
    expect(escaped).toBe('Friday game\\nSUMMARY:Hijacked\\nDESCRIPTION:Pwned');
    expect(escaped.includes('\r')).toBe(false);
    expect(escaped.includes('\n')).toBe(false);
  });

  it('returns empty string for empty / nullish input', () => {
    expect(escapeIcsText('')).toBe('');
  });

  it('passes through safe plain text unchanged', () => {
    expect(escapeIcsText('Friday evening 5-a-side')).toBe('Friday evening 5-a-side');
  });
});
