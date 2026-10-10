import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SQL, and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as Sentry from '@sentry/node';
import * as schema from '../../database/schema';
import { disputes, dispute_messages, match_players, users } from '../../database/schema';
import { withTimestamp } from '../../common/utils/timestamp';
import { ListDisputesDto } from './dto/list-disputes.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { UpdateDisputeDto } from './dto/update-dispute.dto';
import { AuditService } from './audit.service';
import { RealtimeService } from '../gateway/realtime.service';
import { ActivitiesService } from '../activities/activities.service';

type DB = PostgresJsDatabase<typeof schema>;

/** SLA window before an unanswered dispute escalates (owner default, run #109). */
const SLA_DAYS = 7;
const SLA_MS = SLA_DAYS * 24 * 60 * 60 * 1000;

@Injectable()
export class AdminDisputesService {
  private readonly logger = new Logger(AdminDisputesService.name);

  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly activities: ActivitiesService,
  ) {}

  async list(dto: ListDisputesDto) {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;

    // Same clause shape feeds both the page query and the count query — build
    // once. Status is a code-controlled pgEnum value (validated in the DTO),
    // so it binds as a parameter; appeal is an EXISTS probe over the evidence
    // JSON (players attach appeals as evidence entries — matches.service
    // `appendDisputeEvidenceAtomically`), not a column. drizzle `and()` does
    // NOT emit the WHERE keyword (api-standards pitfall): when any clause
    // exists, the keyword must live INSIDE the fragment via sql`WHERE …`,
    // otherwise embedding the bare clause list 500s at runtime.
    const clauses: SQL[] = [];
    if (dto.status) {
      clauses.push(sql`d.status = ${dto.status}`);
    }
    if (dto.appeal !== undefined) {
      clauses.push(
        dto.appeal === 'true'
          ? sql`EXISTS (
              SELECT 1 FROM json_array_elements(d.evidence) e
              WHERE e->>'action' = 'appeal'
            )`
          : sql`NOT EXISTS (
              SELECT 1 FROM json_array_elements(d.evidence) e
              WHERE e->>'action' = 'appeal'
            )`,
      );
    }
    const where: SQL | undefined = clauses.length
      ? sql`WHERE ${sql.join(clauses, sql` AND `)}`
      : undefined;

    const rows = (await this.db.execute(sql`
      SELECT
        d.id, d.type, d.status, d.decision, d.policy_ref, d.created_at, d.updated_at,
        d.sla_escalated,
        r.full_name AS reporter_name, resp.full_name AS respondent_name,
        m.id AS match_id, m.title AS match_title,
        (
          SELECT COUNT(*)::int FROM json_array_elements(d.evidence) e
          WHERE e->>'action' = 'appeal'
        ) AS appeal_count
      FROM disputes d
      LEFT JOIN users r ON r.id = d.reporter_id
      LEFT JOIN users resp ON resp.id = d.respondent_id
      LEFT JOIN matches m ON m.id = d.match_id
      ${where}
      ORDER BY EXISTS (
        SELECT 1 FROM json_array_elements(d.evidence) e
        WHERE e->>'action' = 'appeal'
      ) DESC, d.created_at DESC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `)) as unknown as Array<Record<string, unknown>>;

    // Boolean derived server-side (no client-side drift on the JSON shape).
    const disputes = rows.map((r) => ({ ...r, has_appealed: Number(r.appeal_count ?? 0) > 0 }));

    const countRows = (await this.db.execute(sql`
      SELECT COUNT(*)::int AS c FROM disputes d
      ${where}
    `)) as unknown as Array<{ c: number }>;

    return { disputes, total: countRows[0]?.c ?? 0, page, perPage };
  }

  async findOne(id: string) {
    const dispute = await this.db.query.disputes.findFirst({
      where: eq(disputes.id, id),
      with: {
        reporter: { columns: { id: true, full_name: true, handle: true, avatar_url: true, phone: true } },
        respondent: { columns: { id: true, full_name: true, handle: true, avatar_url: true, phone: true } },
        match: { columns: { id: true, title: true, status: true, scheduled_at: true } },
      },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found.');
    }

    const messages = await this.db.query.dispute_messages.findMany({
      where: eq(dispute_messages.dispute_id, id),
      with: { author: { columns: { id: true, full_name: true, avatar_url: true } } },
      orderBy: (t, { asc }) => [asc(t.created_at)],
    });

    return { ...dispute, messages };
  }

  async resolve(id: string, dto: ResolveDisputeDto, adminId: string, ip?: string) {
    const before = await this.findOne(id);

    if (before.status === 'resolved' || before.status === 'rejected') {
      throw new BadRequestException('This dispute has already been decided.');
    }

    // Apply the real-world effect of the decision — the whole point of a
    // dispute. A won no-show appeal reverses the player's no-show mark and
    // restores their standing no-show count. Other dispute types can add their
    // own effects (refunds, penalty reversals) as those flows are built.
    //
    // ATOMICITY (Review run #24, was CRITICAL): the side effect and the status
    // flip used to run as two independent transactions — a mid-sequence
    // failure un-marked the player while the dispute stayed open (re-resolve
    // → double no_show_count decrement), and two concurrent resolves both
    // passed the advisory findOne status check. Now ONE tx: the guarded status
    // UPDATE (predicate on `opened`/`under_review`) runs FIRST, and the loser
    // of a resolve race throws before any side effect — rollback undoes
    // everything.
    await this.db.transaction(async (tx) => {
      const decided = await tx
        .update(disputes)
        .set(
          withTimestamp({
            status: dto.outcome,
            decision: dto.decision ?? null,
            internal_note: dto.internalNote ?? null,
            decided_by: adminId,
          }),
        )
        .where(and(eq(disputes.id, id), inArray(disputes.status, ['opened', 'under_review'])))
        .returning({ id: disputes.id });

      if (decided.length === 0) {
        // Lost the race (another admin decided it first) or the dispute was
        // closed between findOne and here — throw so NOTHING (side effect,
        // audit, activity) is applied for a stale decision.
        throw new BadRequestException('This dispute has already been decided.');
      }

      if (dto.outcome === 'resolved' && before.type === 'no_show' && before.match_id) {
        await tx
          .update(match_players)
          .set({ no_show: false })
          .where(
            and(eq(match_players.match_id, before.match_id), eq(match_players.user_id, before.reporter_id)),
          );
        await tx
          .update(users)
          .set(
            withTimestamp({
              no_show_count: sql`GREATEST(${users.no_show_count} - 1, 0)`,
            }),
          )
          .where(eq(users.id, before.reporter_id));
      }
    });

    const after = await this.findOne(id);
    await this.auditSafe(adminId, 'dispute.resolve', id, before, after, ip);
    this.realtime.broadcastOps('disputes');
    this.realtime.broadcastOps('users');

    // ── Player notification (the reporter must learn the outcome) ──
    // Best-effort: a notification failure must never fail the resolution.
    // (Run #118 Reviewer A: the bare catch swallowed the error silently —
    // capture + tag so a broken fan-out is visible in Sentry.)
    try {
      await this.activities.record({
        actorId: adminId,
        verb: dto.outcome === 'resolved' ? 'dispute_resolved' : 'dispute_rejected',
        matchId: before.match_id ?? undefined,
        recipients: [before.reporter_id],
        excludeActor: false,
      });
    } catch (err) {
      this.logger.error(`dispute notification failed for ${id}: ${(err as Error).message}`);
      Sentry.captureException(err, { tags: { scope: 'admin.disputes.notify' } });
    }

    return after;
  }

  /**
   * Admin reply on a dispute (P2-2 — run #24). The dispute thread was
   * read-only for admins: `findOne` rendered `dispute_messages` but no
   * endpoint could post one, so the reporter never heard back. Allowed in ANY
   * status — closing-the-loop replies after resolve/reject are legitimate
   * ops. Single insert (no tx needed); returns the fully populated dispute
   * per the mutation-return contract (§2), OUTSIDE any transaction.
   * Audit trail stays content-free (ids + ip only) by design.
   */
  async addMessage(id: string, content: string, adminId: string) {
    const before = await this.findOne(id);

    const trimmed = content.trim();
    if (!trimmed) {
      throw new BadRequestException('Message content cannot be empty.');
    }

    await this.db.insert(dispute_messages).values({
      dispute_id: id,
      author_id: adminId,
      content: trimmed,
    });

    const after = await this.findOne(id);
    await this.auditSafe(adminId, 'dispute.message', id, before, after);
    this.realtime.broadcastOps('disputes');

    return after;
  }

  /**
   * Reopen a decided dispute (admin-ux-overhaul slice 5). Allowed from BOTH
   * resolved and rejected (Abdullah-approved). The decision text and
   * internal note are preserved as visible history; a `reopened` entry is
   * appended to the evidence timeline so every admin action is traceable.
   * No player notification in v1 — the audit trail is the record.
   */
  async reopen(id: string, adminId: string, ip?: string) {
    const before = await this.findOne(id);

    if (before.status !== 'resolved' && before.status !== 'rejected') {
      throw new BadRequestException('Only decided disputes can be reopened.');
    }

    const entry = { action: 'reopened', by: adminId, at: new Date().toISOString() };

    // P2-139: the evidence append is built from a row LOCKED inside the tx
    // (`SELECT … FOR UPDATE`), not from the `before` snapshot — a player
    // appeal appended between findOne and the write is no longer dropped.
    // Status-predicated UPDATE (run #24 Reviewer-A CRITICAL #2): only a
    // dispute that is STILL decided may flip back to opened. A concurrent
    // resolve() that closed it between findOne and here makes this update
    // match zero rows → clean 400 instead of silently reopening a decided
    // dispute over the other admin's decision.
    await this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: disputes.id, evidence: disputes.evidence })
        .from(disputes)
        .where(eq(disputes.id, id))
        .for('update');

      if (!locked) {
        throw new NotFoundException('Dispute not found.');
      }

      const evidence = Array.isArray(locked.evidence)
        ? [...(locked.evidence as unknown[]), entry]
        : [entry];

      const reopened = await tx
        .update(disputes)
        .set(
          withTimestamp({
            status: 'opened',
            // PR-Agent run-#118 r2: a reopened dispute gets a FRESH SLA
            // window — clear the old escalation flag so the sweep can
            // re-flag only after another 7 neglected days.
            sla_escalated: false,
            evidence: evidence as never,
          }),
        )
        .where(and(eq(disputes.id, id), inArray(disputes.status, ['resolved', 'rejected'])))
        .returning({ id: disputes.id });

      if (reopened.length === 0) {
        throw new BadRequestException('Only decided disputes can be reopened.');
      }
    });

    const after = await this.findOne(id);
    await this.auditSafe(adminId, 'dispute.reopen', id, before, after, ip);
    this.realtime.broadcastOps('disputes');

    return after;
  }

  /**
   * Edit a dispute's decision/internal note in ANY status — including after
   * closure (post-decision corrections are the point). Null clears the text.
   */
  async update(id: string, dto: UpdateDisputeDto, adminId: string, ip?: string) {
    const before = await this.findOne(id);

    if (dto.decision === undefined && dto.internalNote === undefined) {
      throw new BadRequestException('No changes provided.');
    }

    const updates: Record<string, unknown> = {};
    if (dto.decision !== undefined) updates.decision = dto.decision ?? null;
    if (dto.internalNote !== undefined) updates.internal_note = dto.internalNote ?? null;

    await this.db
      .update(disputes)
      .set(withTimestamp(updates) as never)
      .where(eq(disputes.id, id));

    const after = await this.findOne(id);
    await this.auditSafe(adminId, 'dispute.update', id, before, after, ip);
    this.realtime.broadcastOps('disputes');

    return after;
  }

  // ── P1-63: dispute SLA sweep (owner default 7-day reminder, run #109) ────

  /**
   * Escalate open/under_review disputes that passed the 7-day window:
   * append an `{action:'sla_escalated'}` evidence entry and set the
   * `sla_escalated` queue flag.
   *
   * Idempotency = the sla_escalated FLAG + the row lock ONLY. (PR-Agent
   * run-#118 r3 IMPORTANT: an earlier draft ALSO deduped on any historical
   * `sla_escalated` evidence entry — that permanently blocked re-escalation
   * after a reopen, because the pre-reopen entry survives in the append-only
   * timeline. The flag is cleared on reopen, so the flag alone is the
   * "currently escalated" marker; multiple timeline entries across separate
   * neglect episodes are CORRECT history, not duplicates.) ONE transaction
   * per dispute row, the row is locked FOR UPDATE, the UPDATE is
   * status-predicated (opened/under_review) AND gated on
   * sla_escalated = false, so a dispute decided mid-sweep is skipped and a
   * concurrent tick's loser matches zero rows. The clock keys on updated_at
   * (PR-Agent r2: created_at alone flagged a freshly REOPENED old dispute
   * instantly — reopen() resets the flag AND bumps updated_at, so the
   * dispute must sit untouched for another 7 days before re-escalation;
   * admin replies also reset the neglect clock, which is the intent for a
   * neglect detector). Informational only — no side effects.
   *
   * @returns number of disputes escalated by THIS call.
   */
  async escalateOverdueDisputes(): Promise<number> {
    const cutoff = new Date(Date.now() - SLA_MS);
    // PR-Agent run-#118 MINOR: gate the CANDIDATE query on the flag too —
    // otherwise every already-escalated-but-unresolved dispute is re-selected,
    // row-locked and its evidence JSON re-read on every daily tick forever.
    // (The in-lock skip below stays as belt-and-braces for races.)
    const candidates = await this.db
      .select({ id: disputes.id })
      .from(disputes)
      .where(
        and(
          inArray(disputes.status, ['opened', 'under_review']),
          lt(disputes.updated_at, cutoff),
          eq(disputes.sla_escalated, false),
        ),
      );

    let escalated = 0;
    for (const { id } of candidates) {
      try {
        const didEscalate = await this.db.transaction(async (tx) => {
          const [locked] = await tx
            .select({ id: disputes.id, evidence: disputes.evidence, slaEscalated: disputes.sla_escalated })
            .from(disputes)
            .where(eq(disputes.id, id))
            .for('update');

          if (!locked || locked.slaEscalated) return false;
          const evidence = Array.isArray(locked.evidence)
            ? (locked.evidence as unknown[])
            : [];

          const entry = {
            action: 'sla_escalated',
            at: new Date().toISOString(),
            note: `Open for more than ${SLA_DAYS} days`,
          };
          const updated = await tx
            .update(disputes)
            .set(
              withTimestamp({
                sla_escalated: true,
                evidence: [...evidence, entry] as never,
              }),
            )
            .where(
              and(
                eq(disputes.id, id),
                inArray(disputes.status, ['opened', 'under_review']),
                eq(disputes.sla_escalated, false),
              ),
            )
            .returning({ id: disputes.id });
          return updated.length > 0;
        });
        if (didEscalate) escalated += 1;
      } catch (err) {
        // One bad row must not kill the sweep; next tick re-tries it (idempotent).
        this.logger.warn(`SLA sweep row ${id} failed: ${(err as Error).message}`);
        Sentry.captureException(err, { tags: { scope: 'admin.disputes.sla-sweep' } });
      }
    }
    return escalated;
  }

  /**
   * Post-commit audit write that must NEVER throw after a successful side
   * effect (Reviewer A run-#118 IMPORTANT: a throwing audit.log left a
   * committed no_show reversal permanently unaudited). Failure is logged and
   * Sentry-tagged; the audit gap is surfaced for ops instead of lost.
   */
  private async auditSafe(
    adminId: string,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
    ip?: string,
  ): Promise<void> {
    try {
      await this.audit.log({ adminId, action, entityType: 'dispute', entityId, before, after, ip });
    } catch (err) {
      this.logger.error(`audit.log failed after ${action} on ${entityId}: ${(err as Error).message}`);
      Sentry.captureException(err, { tags: { scope: 'admin.disputes.audit' } });
    }
  }
}
