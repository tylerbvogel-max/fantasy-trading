-- Migration 003: Margin Trading
-- Run against local and Render databases

-- Season margin settings
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS margin_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS leverage_multiplier NUMERIC(4,2);
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS margin_interest_rate NUMERIC(6,4);
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS maintenance_margin_pct NUMERIC(4,2);

-- Player margin state
ALTER TABLE player_seasons ADD COLUMN IF NOT EXISTS margin_loan_balance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE player_seasons ADD COLUMN IF NOT EXISTS margin_call_active BOOLEAN DEFAULT FALSE;
ALTER TABLE player_seasons ADD COLUMN IF NOT EXISTS margin_call_issued_at TIMESTAMPTZ;

-- Widen transaction_type for new types (MARGIN_INTEREST, MARGIN_LIQUIDATION)
ALTER TABLE transactions ALTER COLUMN transaction_type TYPE VARCHAR(20);
