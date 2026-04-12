-- Layer 1: Ghost trigger tracking
ALTER TABLE bounty_predictions ADD COLUMN IF NOT EXISTS ghost_triggered BOOLEAN DEFAULT FALSE;

-- Layer 2: Window conditions (created now for schema forward-compat)
CREATE TABLE IF NOT EXISTS bounty_window_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bounty_window_id UUID NOT NULL REFERENCES bounty_windows(id),
    condition_type VARCHAR(50) NOT NULL,
    condition_data TEXT,
    source VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_bwc_window_id ON bounty_window_conditions(bounty_window_id);

-- Layer 2: High Noon flag
ALTER TABLE bounty_window_stocks ADD COLUMN IF NOT EXISTS is_high_noon BOOLEAN DEFAULT FALSE;
