import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { WalletController } from './wallet.controller';

/**
 * Collect every route the controller declares as `${METHOD} ${path}` by
 * walking the prototype's handler metadata (what Nest's RouterExplorer reads).
 */
function declaredRoutes(): string[] {
  const proto = WalletController.prototype as unknown as Record<string, unknown>;
  const routes: string[] = [];
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor') continue;
    const handler = proto[name];
    if (typeof handler !== 'function') continue;
    const path = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
    const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
    if (path === undefined || method === undefined) continue;
    for (const p of Array.isArray(path) ? path : [path]) {
      routes.push(`${RequestMethod[method]} ${p.replace(/^\/+/, '')}`);
    }
  }
  return routes;
}

describe('WalletController — removed client-amount money surfaces', () => {
  // P2-331 (run #197): the legacy dummy POST /wallet/topup was REMOVED. It
  // accepted a CLIENT-SUPPLIED amount + idempotencyKey and self-credited via
  // walletService.recordTransaction, gated only by WALLET_TOPUP_ENABLED — the
  // same flag that turns on the real Moyasar flow — so enabling real payments
  // would have re-opened free money minting with no rate limit. This pin makes
  // a regression (re-adding the route or its handler) fail the suite.
  it('POST /wallet/topup stays REMOVED — no client-amount self-credit route (P2-331 pin)', () => {
    const proto = WalletController.prototype as unknown as Record<string, unknown>;
    expect(proto.topup).toBeUndefined();
    expect(declaredRoutes()).not.toContain('POST topup');
  });

  it('the real Moyasar top-up surface is still declared (config / intent / verify)', () => {
    const routes = declaredRoutes();
    expect(routes).toEqual(
      expect.arrayContaining(['GET topup/config', 'POST topup/intent', 'POST topup/verify']),
    );
  });

  // Tripwire: WALLET_TOPUP_ENABLED now gates ONLY the Moyasar flow (read in
  // wallet.topup.service.ts). No controller may read it — a controller-level
  // read is how the legacy gate+recordTransaction path worked.
  it('no wallet controller file references WALLET_TOPUP_ENABLED or recordTransaction (P2-331 tripwire)', () => {
    const dir = __dirname;
    const controllers = readdirSync(dir).filter(
      (f) => f.endsWith('.controller.ts') && !f.endsWith('.spec.ts'),
    );
    expect(controllers.length).toBeGreaterThan(0);
    for (const f of controllers) {
      const src = readFileSync(join(dir, f), 'utf8')
        // strip comments: the removal note legitimately names the old gate
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(src).not.toContain('WALLET_TOPUP_ENABLED');
      expect(src).not.toContain('recordTransaction');
    }
  });

  // Run #58 (reviewer-B P1): POST /wallet/pay was REMOVED — it accepted a
  // CLIENT-SUPPLIED amount for a MATCH_FEE debit with no server-side pricing
  // (dead surface: zero consumers; the authoritative fee path is joinMatch's
  // in-tx server-priced charge). This pin makes a regression (re-adding a
  // client-priced fee route) fail the suite.
  it('POST /wallet/pay stays REMOVED — no client-priced MATCH_FEE surface (run #58 pin)', () => {
    const proto = WalletController.prototype as unknown as Record<string, unknown>;
    expect(proto.pay).toBeUndefined();
    const routes: string[] = Reflect.getMetadata(
      PATH_METADATA,
      WalletController,
    ) as string[];
    const flattened = Array.isArray(routes) ? routes : [routes];
    expect(flattened).not.toContain('pay');
    expect(declaredRoutes()).not.toContain('POST pay');
  });
});
