-- Migration 0056: wallet top-up intents (P0-2 Moyasar sandbox slice, run #169).
-- Server-pinned intent rows: user + amount are decided server-side; the Moyasar
-- hosted form creates the actual payment client-side (card data never touches our
-- servers). verify asserts payment.amount === intent.amount + intent ownership
-- before crediting the wallet. idempotency_key is UNIQUE and scoped per user
-- ('topup-intent:<userId>:<uuid>') so a client retry replays the original intent.
-- Status domain ('pending'|'credited'|'failed') is enforced app-side — the wallet
-- service is the table's single writer (no CHECK constraint, mirrors the
-- hand-written migration convention used since 0030).
CREATE TABLE IF NOT EXISTS wallet_topup_intents (
    id varchar(36) PRIMARY KEY,
    user_id varchar(36) NOT NULL REFERENCES users(id),
    amount_halalas integer NOT NULL,
    currency varchar(3) NOT NULL DEFAULT 'SAR',
    status varchar(20) NOT NULL DEFAULT 'pending',
    payment_id varchar(64),
    idempotency_key varchar(255) NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT wallet_topup_intents_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS wallet_topup_intents_user_created_idx
    ON wallet_topup_intents (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wallet_topup_intents_payment_id_idx
    ON wallet_topup_intents (payment_id);
