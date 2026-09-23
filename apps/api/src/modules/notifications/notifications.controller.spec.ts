import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { NotificationsController } from './notifications.controller';
import { SubscribeDto, UnsubscribeDto } from './dto/notifications.dto';

/**
 * P2-76 (run #65): POST /notifications/unsubscribe is the canonical
 * unsubscribe (DELETE bodies are legitimately dropped by some
 * proxies/clients → silent unsubscribe failure). The legacy DELETE route
 * stays for deployed bundles with the SAME validated DTO and the SAME
 * `{unsubscribed:true}` response. These tests pin the dual-route contract
 * so a future refactor can't drop either leg silently.
 */
describe('NotificationsController P2-76 dual-route unsubscribe (run #65)', () => {
  const proto = NotificationsController.prototype as unknown as Record<
    string,
    (user: { sub: string }, body: UnsubscribeDto) => unknown
  >;

  function routeMeta(method: string) {
    // Nest v10 defines @Post/@Delete route metadata on descriptor.value (the
    // handler function itself); older layouts put it on (prototype, method).
    // Read both so the pin survives framework upgrades either way.
    const fn = proto[method] as unknown as object;
    const path =
      (Reflect.getMetadata(PATH_METADATA, fn) as string | undefined) ??
      (Reflect.getMetadata(PATH_METADATA, proto, method) as string | undefined);
    const httpMethod =
      (Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod | undefined) ??
      (Reflect.getMetadata(METHOD_METADATA, proto, method) as RequestMethod | undefined);
    return { path, httpMethod };
  }

  it('exposes POST /unsubscribe as the canonical route', () => {
    const meta = routeMeta('unsubscribe');
    expect(meta.path).toBe('unsubscribe');
    expect(meta.httpMethod).toBe(RequestMethod.POST);
  });

  it('keeps the DEPRECATED DELETE /unsubscribe route for old bundles', () => {
    const meta = routeMeta('unsubscribeLegacy');
    expect(meta.path).toBe('unsubscribe');
    expect(meta.httpMethod).toBe(RequestMethod.DELETE);
  });

  it('validates BOTH handlers through the UnsubscribeDto class (not plain interfaces)', () => {
    for (const handler of ['unsubscribe', 'unsubscribeLegacy']) {
      const paramtypes = Reflect.getMetadata(
        'design:paramtypes',
        proto,
        handler,
      ) as unknown[];
      expect(paramtypes).toContain(UnsubscribeDto);
    }
  });

  it('delegates both routes to service.unsubscribe(userId, endpoint)', async () => {
    const svc = { unsubscribe: jest.fn(async () => ({ unsubscribed: true })) };
    const ctrl = new NotificationsController(svc as never);
    const user = { sub: 'user-1' };
    const body: UnsubscribeDto = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    };

    await ctrl.unsubscribe(user, body);
    await ctrl.unsubscribeLegacy(user, body);

    expect(svc.unsubscribe).toHaveBeenCalledTimes(2);
    expect(svc.unsubscribe).toHaveBeenNthCalledWith(1, 'user-1', body.endpoint);
    expect(svc.unsubscribe).toHaveBeenNthCalledWith(2, 'user-1', body.endpoint);
  });
});

describe('UnsubscribeDto validation (P2-76, run #65)', () => {
  async function errorsOf(payload: unknown) {
    const dto = plainToInstance(UnsubscribeDto, payload);
    return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  }

  it('accepts a real web-push endpoint', async () => {
    expect(await errorsOf({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc' })).toHaveLength(0);
  });

  it('rejects a non-URL endpoint', async () => {
    expect((await errorsOf({ endpoint: 'not a url' })).length).toBeGreaterThan(0);
  });

  it('rejects an empty/missing endpoint', async () => {
    expect((await errorsOf({ endpoint: '' })).length).toBeGreaterThan(0);
    expect((await errorsOf({})).length).toBeGreaterThan(0);
  });

  it('rejects a plain-http endpoint (run #66: protocols https-only)', async () => {
    expect(
      (await errorsOf({ endpoint: 'http://fcm.googleapis.com/fcm/send/abc' })).length,
    ).toBeGreaterThan(0);
  });

  it('rejects TLD-less hosts (require_tld)', async () => {
    expect((await errorsOf({ endpoint: 'http://localhost:3000/x' })).length).toBeGreaterThan(0);
  });

  // NOTE (run #65): class-validator's @IsUrl(require_tld) ACCEPTS IP-literal
  // hosts (http://169.254.169.254/...) — rejecting those is NOT what this DTO
  // can do. The SSRF defense for internal/meta IPs lives where it already
  // shipped: the service's host allowlist + private-range guards on the SEND
  // path (notifications.service.ts SSRF re-validation). The unsubscribe DTO's
  // job is only to stop junk/typo endpoints from silently no-op'ing the
  // scoped delete.

  it('rejects unknown extra fields (forbidNonWhitelisted parity with the global pipe)', async () => {
    expect(
      (await errorsOf({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', evil: 1 })).length,
    ).toBeGreaterThan(0);
  });

  it('run #70: endpoint is length-capped (512 ok, 513 rejected)', async () => {
    const ok512 = `https://fcm.googleapis.com/fcm/send/${'a'.repeat(476)}`;
    expect(ok512.length).toBe(512);
    expect(await errorsOf({ endpoint: ok512 })).toHaveLength(0);
    const over513 = `https://fcm.googleapis.com/fcm/send/${'a'.repeat(477)}`;
    expect(over513.length).toBe(513);
    expect((await errorsOf({ endpoint: over513 })).length).toBeGreaterThan(0);
  });
});

/**
 * P2-82 (run #69): subscribe had NO DTO at all — a plain TS interface is
 * invisible to the global ValidationPipe (whitelist + forbidNonWhitelisted),
 * so endpoint/keys/locale shipped unvalidated and garbage keys only failed
 * later inside the push broadcast loop. These tests pin the class-DTO
 * contract, including THE allowlist decision that kept it an interface until
 * now: Chrome's `sub.toJSON()` carries `expirationTime: null` and the PWA
 * sends `{...toJSON(), locale}` — without an explicit whitelisted
 * `expirationTime`, forbidNonWhitelisted would 400 every real Chrome
 * subscribe.
 */
describe('SubscribeDto validation (P2-82, run #69)', () => {
  const GOOD_KEYS = {
    p256dh: 'BOrf'.padEnd(88, 'x'), // realistic ~88-char base64url
    auth: 'q5z'.padEnd(22, 'y'), // realistic ~22-char base64url
  };
  const GOOD = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/AAAA',
    keys: GOOD_KEYS,
  };

  async function errorsOf(payload: unknown, validateOpts?: { whitelist?: boolean; forbidNonWhitelisted?: boolean }) {
    const dto = plainToInstance(SubscribeDto, payload);
    return validate(dto, { whitelist: true, forbidNonWhitelisted: true, ...validateOpts });
  }

  it('is what the subscribe handler binds (class, not plain interface)', () => {
    const proto = NotificationsController.prototype as unknown as Record<string, unknown>;
    const paramtypes = Reflect.getMetadata(
      'design:paramtypes',
      proto,
      'subscribe',
    ) as unknown[];
    expect(paramtypes).toContain(SubscribeDto);
  });

  it('accepts the REAL Chrome/PWA payload: expirationTime null + 88/22-char keys + locale', async () => {
    expect(
      await errorsOf({ ...GOOD, expirationTime: null, locale: 'ar' }),
    ).toHaveLength(0);
  });

  it('accepts an epoch-ms expirationTime and an absent locale', async () => {
    expect(
      await errorsOf({ ...GOOD, expirationTime: 1790000000000 }),
    ).toHaveLength(0);
    expect(await errorsOf(GOOD)).toHaveLength(0);
  });

  it('rejects a string/bool expirationTime (whitelisted as number|null only)', async () => {
    expect((await errorsOf({ ...GOOD, expirationTime: 'soon' })).length).toBeGreaterThan(0);
    expect((await errorsOf({ ...GOOD, expirationTime: true })).length).toBeGreaterThan(0);
  });

  it('rejects unknown extra fields (forbidNonWhitelisted parity with the global pipe)', async () => {
    expect((await errorsOf({ ...GOOD, evil: 1 })).length).toBeGreaterThan(0);
    expect(
      (await errorsOf({ ...GOOD, keys: { ...GOOD_KEYS, evil: 1 } })).length,
    ).toBeGreaterThan(0);
  });

  it('rejects garbage keys: missing, wrong-typed, or over-cap blobs', async () => {
    expect((await errorsOf({ endpoint: GOOD.endpoint })).length).toBeGreaterThan(0);
    expect(
      (await errorsOf({ endpoint: GOOD.endpoint, keys: { p256dh: 42, auth: 'ok' } })).length,
    ).toBeGreaterThan(0);
    expect(
      (await errorsOf({
        endpoint: GOOD.endpoint,
        keys: { p256dh: 'x'.repeat(257), auth: 'y'.repeat(10) },
      })).length,
    ).toBeGreaterThan(0);
    expect(
      (await errorsOf({
        endpoint: GOOD.endpoint,
        keys: { p256dh: 'x'.repeat(88), auth: 'y'.repeat(65) },
      })).length,
    ).toBeGreaterThan(0);
  });

  it('rejects a non-ar/en locale (column stays clean; read path already normalized)', async () => {
    expect((await errorsOf({ ...GOOD, locale: 'fr' })).length).toBeGreaterThan(0);
    expect((await errorsOf({ ...GOOD, locale: 'en-US' })).length).toBeGreaterThan(0);
  });

  it('endpoint follows the SAME https+require_tld rules as UnsubscribeDto', async () => {
    expect((await errorsOf({ ...GOOD, endpoint: 'http://fcm.googleapis.com/x' })).length).toBeGreaterThan(0);
    expect((await errorsOf({ ...GOOD, endpoint: 'https://localhost:3000/x' })).length).toBeGreaterThan(0);
  });

  it('run #70: endpoint is length-capped (512 ok, 513 rejected) — abuse guard', async () => {
    // Real FCM/Mozilla endpoints are ~120-180 chars; 512 passes, garbage
    // blobs bounce before they ever reach the service/DB.
    const ok512 = `https://fcm.googleapis.com/fcm/send/${'a'.repeat(476)}`;
    expect(ok512.length).toBe(512);
    expect(await errorsOf({ ...GOOD, endpoint: ok512 })).toHaveLength(0);
    const over513 = `https://fcm.googleapis.com/fcm/send/${'a'.repeat(477)}`;
    expect(over513.length).toBe(513);
    expect(
      (await errorsOf({ ...GOOD, endpoint: over513 })).length,
    ).toBeGreaterThan(0);
  });
});

describe('NotificationsController P2-82 subscribe delegation (run #69)', () => {
  it('delegates to service.subscribe(userId, dto, userAgent, locale) with en default', async () => {
    const svc = { subscribe: jest.fn(async () => ({ subscribed: true })) };
    const ctrl = new NotificationsController(svc as never);
    const user = { sub: 'user-1' };
    const body = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'k'.repeat(88), auth: 'a'.repeat(22) } } as SubscribeDto;
    const req = { headers: { 'user-agent': 'vitest' } } as never;

    await ctrl.subscribe(user, body, req);

    expect(svc.subscribe).toHaveBeenCalledWith('user-1', body, 'vitest', 'en');
  });

  it('passes the payload locale through when present', async () => {
    const svc = { subscribe: jest.fn(async () => ({ subscribed: true })) };
    const ctrl = new NotificationsController(svc as never);
    const body = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'k'.repeat(88), auth: 'a'.repeat(22) }, locale: 'ar' } as SubscribeDto;

    await ctrl.subscribe({ sub: 'user-1' }, body, { headers: {} } as never);

    expect(svc.subscribe).toHaveBeenCalledWith('user-1', body, undefined, 'ar');
  });
});
