'use client';

import type { Match } from '@/types';
import MatchCard from './MatchCard';
import { formatDateSection, type AppLocale } from '@/lib/format';

interface MatchDateSectionsProps {
  matches: Match[];
  currentUserId?: string;
  locale: AppLocale;
}

/**
 * Groups matches by calendar day and renders date section headers
 * ("day name, number month year") with the matches sorted nearest-first
 * within each day. Buckets are ordered chronologically (soonest first).
 */
export default function MatchDateSections({
  matches,
  currentUserId,
  locale,
}: MatchDateSectionsProps) {
  const buckets = new Map<string, Match[]>();
  for (const m of matches) {
    const key = m.date ?? '';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(m);
  }

  const sortedKeys = [...buckets.keys()].sort(); // YYYY-MM-DD sorts chronologically

  return (
    <>
      {sortedKeys.map((key) => {
        const items = [...(buckets.get(key) ?? [])].sort((a, b) => {
          const da = a.distanceM;
          const db = b.distanceM;
          if (da != null && db != null) return da - db;
          if (da != null) return -1;
          if (db != null) return 1;
          return 0;
        });

        return (
          <div key={key}>
            <div className="px-4 pt-3 pb-1.5">
              <p className="text-[10px] font-bold text-brand-green uppercase tracking-widest">
                {formatDateSection(key, locale)}
              </p>
            </div>
            <div className="animate-fade-in-up">
              {items.map((m) => (
                <MatchCard key={m.id} match={m} currentUserId={currentUserId} />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
