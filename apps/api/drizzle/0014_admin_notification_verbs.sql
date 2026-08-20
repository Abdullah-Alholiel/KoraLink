-- Admin→player notification verbs (ops console actions)
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'dispute_resolved';
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'dispute_rejected';
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'wallet_refunded';
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'match_cancelled_admin';
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'account_suspended';
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'account_banned';
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'no_show_marked';
