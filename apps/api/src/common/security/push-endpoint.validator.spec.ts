import { BadRequestException } from '@nestjs/common';
import {
  assertSafePushEndpoint,
  checkPushEndpoint,
  DEFAULT_PUSH_HOST_ALLOWLIST,
  isPublicIp,
  PUSH_ENDPOINT_MAX_LENGTH,
} from './push-endpoint.validator';

/**
 * P0-8 (run #26) — push-endpoint SSRF guard tests.
 *
 * The contract: any `endpoint` value stored in push_subscriptions OR passed
 * to `webpush.sendNotification` must satisfy:
 *   1) Valid URL syntax
 *   2) https: only
 *   3) Port 443 (or unspecified)
 *   4) Hostname in operator-supplied allowlist
 *   5) IP literals must be publicly routable (no loopback/private/link-local)
 *   6) No userinfo (user:pass@)
 *   7) No fragment (#...)
 *   8) Length ≤ 2048 chars
 *
 * Each guard is independent so a future loosening of one doesn't accidentally
 * relax the others. assertSafePushEndpoint throws BadRequestException with a
 * stable, machine-readable message suitable for Sentry + UI.
 */
describe('P0-8 push-endpoint validator (SSRF guard)', () => {
  describe('checkPushEndpoint — scheme / port / userinfo / fragment / length', () => {
    it('rejects empty / non-string', () => {
      expect(checkPushEndpoint('')).toBe('invalid-url');
      expect(checkPushEndpoint(null)).toBe('invalid-url');
      expect(checkPushEndpoint(undefined)).toBe('invalid-url');
      expect(checkPushEndpoint(123)).toBe('invalid-url');
      expect(checkPushEndpoint({})).toBe('invalid-url');
    });

    it('rejects malformed URLs', () => {
      expect(checkPushEndpoint('not-a-url')).toBe('invalid-url');
      expect(checkPushEndpoint('://nohost')).toBe('invalid-url');
    });

    it('rejects http (no https)', () => {
      expect(
        checkPushEndpoint('http://fcm.googleapis.com/abc'),
      ).toBe('must-use-https');
    });

    it('rejects non-443 ports (even on an allowlisted host)', () => {
      expect(
        checkPushEndpoint('https://fcm.googleapis.com:8080/abc'),
      ).toBe('must-use-port-443');
      expect(
        checkPushEndpoint('https://fcm.googleapis.com:80/abc'),
      ).toBe('must-use-port-443');
    });

    it('rejects userinfo in the URL', () => {
      expect(
        checkPushEndpoint('https://attacker:pw@fcm.googleapis.com/abc'),
      ).toBe('userinfo-not-allowed');
    });

    it('rejects fragment in the URL', () => {
      expect(
        checkPushEndpoint('https://fcm.googleapis.com/abc#evil'),
      ).toBe('fragment-not-allowed');
    });

    it('rejects URLs longer than 2048 chars', () => {
      const long = `https://fcm.googleapis.com/${'a'.repeat(PUSH_ENDPOINT_MAX_LENGTH)}`;
      expect(checkPushEndpoint(long)).toBe('exceeds-length-cap');
    });
  });

  describe('checkPushEndpoint — allowlist enforcement', () => {
    it('accepts a valid FCM endpoint', () => {
      expect(
        checkPushEndpoint('https://fcm.googleapis.com/fcm/send/abc123'),
      ).toBeNull();
    });

    it('accepts a valid Mozilla endpoint', () => {
      expect(
        checkPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'),
      ).toBeNull();
    });

    it('accepts a valid Apple endpoint', () => {
      expect(
        checkPushEndpoint('https://web.push.apple.com/Q1b2c3d4e5f6'),
      ).toBeNull();
    });

    it('rejects a host not in the allowlist (the SSRF exploit)', () => {
      expect(
        checkPushEndpoint('https://169.254.169.254/latest/meta-data'),
      ).toBe('must-be-public-ip'); // caught earlier by IP check
      expect(
        checkPushEndpoint('https://example.com/webhook'),
      ).toBe('host-not-allowed');
      expect(
        checkPushEndpoint('https://attacker.com/push'),
      ).toBe('host-not-allowed');
    });

    it('accepts a custom allowlist entry (operator add via ADMIN_PUSH_HOST_ALLOWLIST)', () => {
      const custom = new Set(['push.example.sa']);
      expect(
        checkPushEndpoint('https://push.example.sa/send', custom),
      ).toBeNull();
      expect(
        checkPushEndpoint('https://fcm.googleapis.com/send', custom),
      ).toBe('host-not-allowed'); // default FCM NOT in custom
    });
  });

  describe('checkPushEndpoint — private/loopback/link-local IP rejection', () => {
    it('rejects loopback IPv4 (127.0.0.1)', () => {
      expect(
        checkPushEndpoint('https://127.0.0.1/push'),
      ).toBe('must-be-public-ip');
    });

    it('rejects cloud metadata (169.254.169.254) — the SSRF target', () => {
      expect(
        checkPushEndpoint('https://169.254.169.254/latest/meta-data/iam/'),
      ).toBe('must-be-public-ip');
    });

    it('rejects RFC1918 private ranges', () => {
      expect(checkPushEndpoint('https://10.0.0.5/push')).toBe('must-be-public-ip');
      expect(checkPushEndpoint('https://172.16.0.1/push')).toBe('must-be-public-ip');
      expect(checkPushEndpoint('https://192.168.1.1/push')).toBe('must-be-public-ip');
    });

    it('rejects CGN (100.64.0.0/10)', () => {
      expect(checkPushEndpoint('https://100.64.0.1/push')).toBe('must-be-public-ip');
      expect(checkPushEndpoint('https://100.127.255.254/push')).toBe('must-be-public-ip');
    });

    it('rejects unspecified / multicast / reserved', () => {
      expect(checkPushEndpoint('https://0.0.0.0/push')).toBe('must-be-public-ip');
      expect(checkPushEndpoint('https://224.0.0.1/push')).toBe('must-be-public-ip');
      expect(checkPushEndpoint('https://240.0.0.1/push')).toBe('must-be-public-ip');
    });

    it('rejects IPv6 loopback (::1) and link-local (fe80::)', () => {
      expect(checkPushEndpoint('https://[::1]/push')).toBe('must-be-public-ip');
      expect(checkPushEndpoint('https://[fe80::1]/push')).toBe('must-be-public-ip');
    });

    it('rejects IPv6 ULA (fc/fd)', () => {
      expect(checkPushEndpoint('https://[fc00::1]/push')).toBe('must-be-public-ip');
      expect(checkPushEndpoint('https://[fd12:3456::1]/push')).toBe('must-be-public-ip');
    });

    it('does not flag a public IP literal (the legitimate FCM case is DNS, but some setups use IP)', () => {
      // 8.8.8.8 is public (Google DNS). It still fails the hostname allowlist,
      // so we expect 'host-not-allowed' (after the IP check passes).
      expect(checkPushEndpoint('https://8.8.8.8/push')).toBe('host-not-allowed');
    });
  });

  describe('assertSafePushEndpoint — throws on bad input', () => {
    it('passes silently on a valid endpoint', () => {
      expect(() =>
        assertSafePushEndpoint('https://fcm.googleapis.com/abc'),
      ).not.toThrow();
    });

    it('throws BadRequestException with a stable message', () => {
      expect(() => assertSafePushEndpoint('http://example.com/x')).toThrow(
        BadRequestException,
      );
      try {
        assertSafePushEndpoint('http://example.com/x');
        fail('expected to throw');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect(e.message).toBe('Invalid push endpoint: must use https');
      }
    });
  });

  describe('isPublicIp — IPv4 / IPv6 ranges', () => {
    it.each([
      ['8.8.8.8', true],
      ['1.1.1.1', true],
      ['172.15.255.255', true], // just below the 172.16/12 boundary
      ['172.32.0.0', true], // just above the 172.16/12 boundary
      ['127.0.0.1', false],
      ['10.0.0.0', false],
      ['172.16.0.0', false],
      ['172.31.255.255', false],
      ['192.168.0.1', false],
      ['169.254.169.254', false], // AWS / GCP / Azure metadata
      ['100.64.0.0', false], // CGN start
      ['100.127.255.255', false], // CGN end
      ['100.128.0.0', true], // just above CGN
      ['0.0.0.0', false],
      ['224.0.0.1', false],
      ['240.0.0.1', false],
    ])('isPublicIp(%s) === %s', (ip, expected) => {
      expect(isPublicIp(ip)).toBe(expected);
    });

    it.each([
      ['2001:db8::1', true], // documentation prefix, NOT a reserved range
      ['::1', false],
      ['::', false],
      ['fe80::1', false],
      ['fc00::1', false],
      ['fd00::1', false],
      ['ff02::1', false],
    ])('isPublicIp(%s) === %s', (ip, expected) => {
      expect(isPublicIp(ip)).toBe(expected);
    });

    it('returns false for invalid input', () => {
      expect(isPublicIp('not-an-ip')).toBe(false);
      expect(isPublicIp('999.999.999.999')).toBe(false);
      expect(isPublicIp('')).toBe(false);
    });
  });

  describe('DEFAULT_PUSH_HOST_ALLOWLIST — sanity', () => {
    it('contains the four primary push providers', () => {
      expect(DEFAULT_PUSH_HOST_ALLOWLIST.has('fcm.googleapis.com')).toBe(true);
      expect(
        DEFAULT_PUSH_HOST_ALLOWLIST.has('updates.push.services.mozilla.com'),
      ).toBe(true);
      expect(DEFAULT_PUSH_HOST_ALLOWLIST.has('web.push.apple.com')).toBe(true);
      expect(DEFAULT_PUSH_HOST_ALLOWLIST.has('wns.notify.windows.com')).toBe(
        true,
      );
    });

    it('does NOT contain internal hosts (would defeat the guard)', () => {
      expect(DEFAULT_PUSH_HOST_ALLOWLIST.has('localhost')).toBe(false);
      expect(DEFAULT_PUSH_HOST_ALLOWLIST.has('169.254.169.254')).toBe(false);
      expect(DEFAULT_PUSH_HOST_ALLOWLIST.has('example.com')).toBe(false);
    });
  });
});
