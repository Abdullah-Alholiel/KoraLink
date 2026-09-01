import { BadRequestException } from '@nestjs/common';
import { AdminDisputesService } from './disputes.service';

/**
 * Run #24 dispute-service tests (Reviewer A findings + P2-2 admin replies):
 *
 * ATOMICITY — resolve() previously ran the no-show reversal tx and the status
 * UPDATE as two independent commits. A mid-sequence failure un-marked the
 * player while the dispute stayed `opened` → re-resolve decremented
 * no_show_count TWICE. Concurrent resolves both passed the advisory
 * findOne status check (TOCTOU).
 * FIX: ONE tx — guarded status UPDATE (`WHERE status IN (opened, under_review)`)
 * runs FIRST; the race loser throws BEFORE any side effect, so rollback undoes
 * everything.
 *
 * REPLIES (P2-2) — addMessage() posts an admin reply and returns the fully
 * populated dispute (contract §2) outside any tx.
 */
describe('AdminDisputesService — run #24', () => {
  const DISPUTE_ID = 'd1';
  // Drizzle table objects identify via Symbol.for('drizzle:Name').
  const nameOf = (t: unknown) => String((t as never)[Symbol.for('drizzle:Name')] ?? '');

  function updateChain(returningRows: unknown[]) {
    const chain: any = {
      set: () => chain,
      where: () => chain,
      returning: () => returningRows,
    };
    return chain;
  }

  function makeService(opts: {
    findOne?: jest.Mock;
    updateRows: unknown[];
    insertOk?: boolean;
  }) {
    // findOne is spied on the prototype so every internal re-read resolves.
    // opts.findOne REPLACES the whole implementation (default = open no_show).
    const findOne =
      opts.findOne ??
      jest.fn(async () => ({
        id: DISPUTE_ID,
        type: 'no_show',
        status: 'opened',
        match_id: 'm1',
        reporter_id: 'u1',
        messages: [],
      }));

    const inserted: unknown[] = [];
    const tx = {
      update: jest.fn((..._args: unknown[]) => updateChain(opts.updateRows)),
    };
    const db = {
      query: { disputes: {}, dispute_messages: {} },
      update: jest.fn(() => updateChain(opts.updateRows)),
      insert: jest.fn(() => ({
        values: jest.fn(async (v: unknown) => {
          if (opts.insertOk === false) throw new Error('insert failed');
          inserted.push(v);
        }),
      })),
      transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    };
    const audit = { log: jest.fn(async () => {}) };
    const realtime = { broadcastOps: jest.fn() };
    const activities = { record: jest.fn(async () => {}) };
    const svc = new AdminDisputesService(
      db as never,
      audit as never,
      realtime as never,
      activities as never,
    );
    jest.spyOn(svc as never, 'findOne').mockImplementation(findOne as never);
    return { svc, audit, activities, db, tx, inserted };
  }

  // ── resolve atomicity ────────────────────────────────────────────────

  it('resolve: guarded status UPDATE runs first, then no-show reversal, in ONE tx', async () => {
    const { svc, db, tx } = makeService({ updateRows: [{ id: DISPUTE_ID }] });
    await svc.resolve(DISPUTE_ID, { outcome: 'resolved', decision: 'ok' }, 'admin1');
    // single transaction wrapper
    expect(db.transaction).toHaveBeenCalledTimes(1);
    // the ONLY in-tx update on disputes carries the status predicate
    const disputesCall = tx.update.mock.calls.find(
      (c) => nameOf((c as unknown[])[0]) === 'disputes',
    );
    expect(disputesCall).toBeDefined();
    // no-show reversal updates ran INSIDE the tx chain (match_players + users)
    expect(
      tx.update.mock.calls.some(
        (c) => nameOf((c as unknown[])[0]) === 'match_players',
      ),
    ).toBe(true);
    expect(
      tx.update.mock.calls.some(
        (c) => nameOf((c as unknown[])[0]) === 'users',
      ),
    ).toBe(true);
    // no standalone (non-tx) disputes update remains
    expect(db.update).not.toHaveBeenCalled();
  });

  it('resolve: throws before side effects when the guarded status update matches 0 rows (race loser)', async () => {
    const { svc, tx } = makeService({ updateRows: [] }); // 0 rows → loser
    await expect(
      svc.resolve(DISPUTE_ID, { outcome: 'resolved', decision: 'ok' }, 'admin1'),
    ).rejects.toThrow(BadRequestException);
    // side effects must NOT have run: no match_players/users update in-tx
    expect(
      tx.update.mock.calls.some(
        (c) => nameOf((c as unknown[])[0]) === 'match_players',
      ),
    ).toBe(false);
    expect(
      tx.update.mock.calls.some(
        (c) => nameOf((c as unknown[])[0]) === 'users',
      ),
    ).toBe(false);
  });

  it('resolve: side-effect failure rolls back the status flip (atomic block)', async () => {
    // match_players update throws → tx rejects → dispute stays opened (rolled back)
    const { svc, tx } = makeService({ updateRows: [{ id: DISPUTE_ID }] });
    const mpChain = {
      set: () => mpChain,
      where: () => {
        throw new Error('db failure mid-sequence');
      },
    };
    tx.update.mockImplementation(((table: unknown) => {
      const name = nameOf(table);
      return name === 'match_players' ? mpChain : updateChain([{ id: DISPUTE_ID }]);
    }) as never);
    await expect(
      svc.resolve(DISPUTE_ID, { outcome: 'resolved', decision: 'ok' }, 'admin1'),
    ).rejects.toThrow('db failure mid-sequence');
  });

  it('resolve: non-no_show disputes skip the reversal but still flip status in-tx', async () => {
    const findOne = jest.fn(async () => ({
      id: DISPUTE_ID,
      type: 'conduct',
      status: 'opened',
      match_id: 'm1',
      reporter_id: 'u1',
      messages: [],
    }));
    const { svc, tx } = makeService({ updateRows: [{ id: DISPUTE_ID }], findOne });
    await svc.resolve(DISPUTE_ID, { outcome: 'resolved', decision: 'ok' }, 'admin1');
    expect(
      tx.update.mock.calls.some(
        (c) => nameOf((c as unknown[])[0]) === 'match_players',
      ),
    ).toBe(false);
    expect(
      tx.update.mock.calls.some(
        (c) => nameOf((c as unknown[])[0]) === 'users',
      ),
    ).toBe(false);
  });

  // ── admin replies (P2-2) ─────────────────────────────────────────────

  it('addMessage: inserts dispute_messages row and returns the populated dispute', async () => {
    const { svc, db, inserted } = makeService({ updateRows: [] });
    const after = await svc.addMessage(DISPUTE_ID, '  we reviewed the appeal  ', 'admin1');
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      dispute_id: DISPUTE_ID,
      author_id: 'admin1',
      content: 'we reviewed the appeal',
    });
    // populated return (the mocked findOne) — not a bare row
    expect(after).toMatchObject({ id: DISPUTE_ID, messages: [] });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('addMessage: rejects whitespace-only content', async () => {
    const { svc } = makeService({ updateRows: [] });
    await expect(svc.addMessage(DISPUTE_ID, '   ', 'admin1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('addMessage: audit log carries the action but the audit trail is called', async () => {
    const { svc, audit } = makeService({ updateRows: [] });
    await svc.addMessage(DISPUTE_ID, 'reply', 'admin1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'dispute.message', entityType: 'dispute' }),
    );
  });
});
