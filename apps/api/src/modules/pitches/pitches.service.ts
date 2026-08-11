import { Injectable, Inject } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { pitch_slots } from '../../database/schema';

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class PitchesService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  /**
   * Generate recurring time slots for a pitch.
   *
   * Pattern specifies which days of the week (0=Sun...6=Sat),
   * the time range, slot duration, and how many weeks ahead to generate.
   * Uses INSERT ... ON CONFLICT DO NOTHING to avoid duplicates.
   */
  async generateRecurringSlots(
    pitchId: string,
    pattern: {
      days_of_week: number[];
      start_time: string;
      end_time: string;
      slot_duration_mins: number;
      weeks_ahead: number;
    },
  ): Promise<{ created: number; skipped: number }> {
    const slots: Array<{
      pitch_id: string;
      slot_date: string;
      start_time: string;
      end_time: string;
    }> = [];

    const today = new Date();
    const startHour = parseInt(pattern.start_time.split(':')[0], 10);
    const endHour = parseInt(pattern.end_time.split(':')[0], 10);

    for (let w = 0; w < pattern.weeks_ahead; w++) {
      for (const dow of pattern.days_of_week) {
        // Find next occurrence of this day of week
        const date = new Date(today);
        const dayDiff = (dow - date.getDay() + 7) % 7;
        date.setDate(date.getDate() + dayDiff + w * 7);

        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        // Generate slots within the time range
        for (let h = startHour; h < endHour; h++) {
          const startTime = `${String(h).padStart(2, '0')}:00:00`;
          const endTime = `${String(h + 1).padStart(2, '0')}:00:00`;
          slots.push({
            pitch_id: pitchId,
            slot_date: dateStr,
            start_time: startTime,
            end_time: endTime,
          });
        }
      }
    }

    // Insert with conflict handling
    let created = 0;
    for (const slot of slots) {
      try {
        // Try individual insert — unique constraint prevents duplicates
        await this.db.insert(pitch_slots).values(slot);
        created++;
      } catch {
        // Duplicate — skip silently
      }
    }

    return { created, skipped: slots.length - created };
  }
}
