-- Run #20 (P1-13): hosts can reschedule a match to a new slot. New activity
-- verb for the roster notification. Idempotent (safe on live DB where the
-- value may land before this migration runs).
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'match_rescheduled';
