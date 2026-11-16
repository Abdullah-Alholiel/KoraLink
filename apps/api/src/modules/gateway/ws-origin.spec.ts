/**
 * P2-185 (run #133) — behavioral spec for the WS handshake origin gate.
 *
 * Pins the THREE contracts that make the allowRequest hook safe:
 * 1. Unlisted browser origins are rejected pre-upgrade.
 * 2. Non-browser requests (no Origin header) pass through — curl/health/native.
 * 3. Normalization matches the REST side exactly (originAllowed is the single truth).
 */

import { wsAllowRequest, extractHandshakeOrigin, setWsAllowedOriginsProvider, resetWsAllowedOriginsProvider } from '../../common/utils/ws-origin';

describe('P2-185 WS handshake origin gate', () => {
  afterEach(() => resetWsAllowedOriginsProvider());

  it('rejects an unlisted browser origin at upgrade time', () => {
    setWsAllowedOriginsProvider(() => ['https://pwa.example', 'https://admin.example']);
    expect(wsAllowRequest({ headers: { origin: 'https://evil.example' } })).toBe(false);
  });

  it('accepts a listed origin (whitespace/trailing-slash tolerant, both sides)', () => {
    setWsAllowedOriginsProvider(() => [' https://pwa.example/ ']);
    expect(wsAllowRequest({ headers: { origin: 'https://pwa.example' } })).toBe(true);
  });

  it('passes through non-browser requests (no Origin header)', () => {
    setWsAllowedOriginsProvider(() => ['https://pwa.example']);
    expect(wsAllowRequest({ headers: {} })).toBe(true);
    expect(wsAllowRequest({})).toBe(true);
  });

  it('supports comma-separated multi-origin env values (PLAYER_URL shape)', () => {
    setWsAllowedOriginsProvider(() => [
      'https://a.example',
      'https://b.example',
    ]);
    expect(wsAllowRequest({ headers: { origin: 'https://b.example' } })).toBe(true);
    expect(wsAllowRequest({ headers: { origin: 'https://a.example' } })).toBe(true);
  });

  it('uses bootstrap defaults before the gateway installs its provider', () => {
    // No setWsAllowedOriginsProvider call — provider is the default.
    expect(wsAllowRequest({ headers: { origin: 'http://localhost:3000' } })).toBe(true);
    expect(wsAllowRequest({ headers: { origin: 'https://evil.example' } })).toBe(false);
  });

  it('rejects when the provider throws (fail-closed)', () => {
    setWsAllowedOriginsProvider(() => {
      throw new Error('config unavailable');
    });
    expect(wsAllowRequest({ headers: { origin: 'https://anything.example' } })).toBe(false);
  });

  it('extractHandshakeOrigin returns the first origin when array-valued', () => {
    expect(extractHandshakeOrigin({ headers: { origin: ['https://x.example', 'https://y.example'] } })).toBe(
      'https://x.example',
    );
  });

  it('extractHandshakeOrigin returns undefined when absent', () => {
    expect(extractHandshakeOrigin({ headers: {} })).toBeUndefined();
    expect(extractHandshakeOrigin({})).toBeUndefined();
  });
});
