'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface TrendPoint {
  date: string;
  bookedSlots: number;
  revenue: number;
}

interface WeeklyTrendChartProps {
  data: TrendPoint[];
}

/** 7-day trend (server-aggregated series): booked-slot bars + revenue line. */
export default function WeeklyTrendChart({ data }: WeeklyTrendChartProps) {
  const t = useTranslations('partner.dashboard2');

  const labels = useMemo(
    () =>
      data.map((p) => ({
        ...p,
        day: new Date(`${p.date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      })),
    [data],
  );

  if (!labels.length) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">{t('trendTitle')}</h2>
      <div className="h-56 w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={labels} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis
              yAxisId="slots"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis yAxisId="rev" orientation="right" hide />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
              formatter={(value, name) => {
                if (name === 'revenue') return [formatSar(Number(value)), t('trendRevenue')];
                return [value, t('trendBooked')];
              }}
            />
            <Bar yAxisId="slots" dataKey="bookedSlots" fill="#254132" radius={[4, 4, 0, 0]} barSize={22} name="booked" />
            <Line
              yAxisId="rev"
              type="monotone"
              dataKey="revenue"
              stroke="#d4494c"
              strokeWidth={2}
              dot={{ r: 3, fill: '#d4494c', strokeWidth: 0 }}
              name="revenue"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-gray-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#254132]" /> {t('trendBooked')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-[#d4494c]" /> {t('trendRevenue')}
        </span>
      </div>
    </div>
  );
}

function formatSar(v: number): string {
  return `SAR ${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
