-- Migration 004: Leverage Mechanic
-- Adds leverage tracking to predictions and margin call cooldown to player stats

-- BountyPrediction: leverage and margin call tracking
ALTER TABLE bounty_predictions ADD COLUMN IF NOT EXISTS leverage FLOAT DEFAULT 1.0;
ALTER TABLE bounty_predictions ADD COLUMN IF NOT EXISTS margin_call_triggered BOOLEAN DEFAULT FALSE;

-- BountyPlayerStats: margin call cooldown
ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS margin_call_cooldown INTEGER DEFAULT 0;
