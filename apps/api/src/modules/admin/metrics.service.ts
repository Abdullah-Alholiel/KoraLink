import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';

type DB = PostgresJsDatabase<typeof schema>;
type Row = Record<string, unknown>;

export interface AdminMetrics {
  totals: {
    users: number;
    matches: number;
    venues: number;
    pitches: number;
    disputesOpen: number;
    floatHeld: number;
    pendingPayouts: number;
  };
  completionRate: number;
  disputeRate: number;
  avgResolutionHours: number;
  revenueSeries: { month: string; revenue: number }[];
  matchesPlayedVsCancelled: { month: string; played: number; cancelled: number }[];
  disputeRateSeries: { month: string; rate: number }[];
}

@Injectable()
export class MetricsService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  private async one(query: ReturnType<typeof sql>): Promise<Row> {
    const rows = await this.db.execute(query);
    return (rows as unknown as Row[])[0] ?? {};
  }

  private async many(query: ReturnType<typeof sql>): Promise<Row[]> {
    const rows = await this.db.execute(query);
    return rows as unknown as Row[];
  }

  private lastMonths(n: number): { key: string; start: Date; end: Date }[] {
    const out: { key: string; start: Date; end: Date }[] = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
      out.push({ key, start, end });
    }
    return out;
  }

  async getMetrics(): Promise<AdminMetrics> {
    const totals = await this.one(sql`
      select
        (select count(*)::int from users)                                     as users,
        (select count(*)::int from matches)                                   as matches,
        (select count(*)::int from venues)                                    as venues,
        (select count(*)::int from pitches)                                   as pitches,
        (select count(*)::int from disputes where status in ('opened','under_review')) as disputes_open,
        (select coalesce(sum(wallet_balance), 0)::float from users)           as float_held,
        (select coalesce(sum(amount), 0)::float from settlements where status = 'pending') as pending_payouts
    `);

    const rates = await this.one(sql`
      select
        (select count(*)::int from matches where status = 'Completed')  as completed,
        (select count(*)::int from matches where status = 'Cancelled')  as cancelled,
        (select count(*)::int from matches)                             as total_matches,
        (select count(*)::int from disputes)                            as total_disputes,
        (select coalesce(avg(extract(epoch from (updated_at - created_at)) / 3600.0), 0)::float
           from disputes where status in ('resolved','rejected'))       as avg_resolution_hours
    `);

    const completed = Number(rates.completed ?? 0);
    const cancelled = Number(rates.cancelled ?? 0);
    const totalMatches = Number(rates.total_matches ?? 0);
    const totalDisputes = Number(rates.total_disputes ?? 0);
    const resolvedBase = completed + cancelled;

    const months = this.lastMonths(6);
    // postgres-js requires string params — pass the ISO string, not a Date object.
    const since = months[0].start.toISOString();

    const revenueRows = await this.many(sql`
      select to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
             coalesce(sum(amount), 0)::float as revenue
      from transactions
      where type = 'DEBIT' and reference_type = 'MATCH_FEE' and status = 'Completed'
        and created_at >= ${since}
      group by 1
    `);

    const playedRows = await this.many(sql`
      select to_char(date_trunc('month', scheduled_at), 'YYYY-MM') as month,
             count(*) filter (where status = 'Completed')::int as played,
             count(*) filter (where status = 'Cancelled')::int as cancelled
      from matches
      where scheduled_at >= ${since}
      group by 1
    `);

    const disputeRows = await this.many(sql`
      select to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
             count(*)::int as disputes
      from disputes
      where created_at >= ${since}
      group by 1
    `);

    const matchMonthRows = await this.many(sql`
      select to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
             count(*)::int as matches
      from matches
      where created_at >= ${since}
      group by 1
    `);

    const revenueByMonth = new Map(revenueRows.map((r) => [r.month as string, Number(r.revenue ?? 0)]));
    const playedByMonth = new Map(playedRows.map((r) => [r.month as string, r]));
    const disputeByMonth = new Map(disputeRows.map((r) => [r.month as string, Number(r.disputes ?? 0)]));
    const matchByMonth = new Map(matchMonthRows.map((r) => [r.month as string, Number(r.matches ?? 0)]));

    return {
      totals: {
        users: Number(totals.users ?? 0),
        matches: Number(totals.matches ?? 0),
        venues: Number(totals.venues ?? 0),
        pitches: Number(totals.pitches ?? 0),
        disputesOpen: Number(totals.disputes_open ?? 0),
        floatHeld: Number(totals.float_held ?? 0),
        pendingPayouts: Number(totals.pending_payouts ?? 0),
      },
      completionRate: resolvedBase > 0 ? completed / resolvedBase : 0,
      disputeRate: totalMatches > 0 ? totalDisputes / totalMatches : 0,
      avgResolutionHours: Number(rates.avg_resolution_hours ?? 0),
      revenueSeries: months.map((m) => ({
        month: m.key,
        revenue: revenueByMonth.get(m.key) ?? 0,
      })),
      matchesPlayedVsCancelled: months.map((m) => {
        const r = playedByMonth.get(m.key);
        return {
          month: m.key,
          played: Number(r?.played ?? 0),
          cancelled: Number(r?.cancelled ?? 0),
        };
      }),
      disputeRateSeries: months.map((m) => {
        const d = disputeByMonth.get(m.key) ?? 0;
        const mm = matchByMonth.get(m.key) ?? 0;
        return { month: m.key, rate: mm > 0 ? d / mm : 0 };
      }),
    };
  }
}
