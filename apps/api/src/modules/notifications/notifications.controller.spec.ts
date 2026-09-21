import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { NotificationsController } from './notifications.controller';
import { UnsubscribeDto } from './dto/notifications.dto';

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
});
