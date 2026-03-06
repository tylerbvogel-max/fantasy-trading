-- Add bet_amount column and make confidence nullable for bet-based scoring
ALTER TABLE bounty_predictions ADD COLUMN IF NOT EXISTS bet_amount INTEGER DEFAULT 0;
ALTER TABLE bounty_predictions ALTER COLUMN confidence DROP NOT NULL;
