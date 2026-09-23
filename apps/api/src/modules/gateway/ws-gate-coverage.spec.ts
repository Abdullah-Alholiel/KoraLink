import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-74 tripwire (run #60): every state-changing @SubscribeMessage handler in
 * app.gateway.ts must call the P1-48 mid-session moderation gate
 * (`requireActiveUser`) — otherwise a future handler can silently reopen the
 * banned-user chat hole that gate closed (Reviewer A, run #58).
 *
 * The gateway module pulls in Nest decorators and a live DB driver at import
 * time, so this spec READS THE SOURCE and checks structure (same pattern as
 * migrate-vps-dup-codes.spec.ts reading the applier script):
 *
 *   1. every @SubscribeMessage('<event>') handler body must contain
 *      `await this.requireActiveUser(`;
 *   2. the FIRST await in a gated handler must BE the gate — moderation runs
 *      before rate-limit consumption, membership reads, writes, broadcasts;
 *   3. the handler set is pinned — adding or removing an event must
 *      consciously update this spec (that edit is the tripwire firing).
 *
 * The ONLY sanctioned exemption is `leave-conversation`: it merely shrinks the
 * socket's own room set (documented P2-6 decision) — it never reads user data
 * and cannot exfiltrate chat.
 */

const GATEWAY = join(__dirname, 'app.gateway.ts');

/** Read-only / self-scoped events that must NOT call the gate. */
const EXEMPT_EVENTS = new Set(['leave-conversation']);

/** Full expected handler set — update this pin when handlers change. */
const EXPECTED_EVENTS = [
  'join-lobby',
  'send-message',
  'join-conversation',
  'mark-read',
  'mark-chat-read',
  'send-dm',
  'leave-conversation',
];

interface HandlerChunk {
  event: string;
  body: string;
}

function handlerChunks(src: string): HandlerChunk[] {
  const chunks: HandlerChunk[] = [];
  const re = /@SubscribeMessage\('([^']+)'\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    const start = match.index + match[0].length;
    // A handler chunk ends at the NEXT @SubscribeMessage decorator (or EOF).
    // Private helpers that live between handlers therefore attach to the
    // previous chunk — harmless for the gate check, and a helper's own awaits
    // can never mask a missing gate in a later handler.
    const next = src.indexOf('@SubscribeMessage(', start);
    chunks.push({ event: match[1], body: src.slice(start, next === -1 ? src.length : next) });
  }
  return chunks;
}

describe('WS moderation gate coverage (P2-74, run #60)', () => {
  const src = readFileSync(GATEWAY, 'utf8');
  const handlers = handlerChunks(src);
  const gated = handlers.filter((h) => !EXEMPT_EVENTS.has(h.event));

  it('pins the handler set — a new/removed @SubscribeMessage must update this spec', () => {
    expect(handlers.map((h) => h.event).sort()).toEqual([...EXPECTED_EVENTS].sort());
  });

  it('exempts exactly the documented read-only set', () => {
    expect([...EXEMPT_EVENTS].sort()).toEqual(['leave-conversation']);
  });

  it.each(gated)('$event calls requireActiveUser as its FIRST await', ({ body }) => {
    expect(body).toContain('await this.requireActiveUser(');
    const firstAwait = body.indexOf('await ');
    expect(firstAwait).toBeGreaterThanOrEqual(0);
    // The first await must be the gate itself — not a rate-limit burn,
    // membership read, or write that ran before moderation.
    expect(body.slice(firstAwait, firstAwait + 60)).toContain('this.requireActiveUser(');
  });
});
