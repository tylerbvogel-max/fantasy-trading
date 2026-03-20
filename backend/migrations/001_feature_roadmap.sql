-- Feature Roadmap Migration: P0-P3
-- Run against the database to add all new tables and columns

-- ══════════════════════════════════════════════════════════════════════════════
-- P0-B: Bust/Revival tracking columns on bounty_player_stats
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS saloon_used BOOLEAN DEFAULT FALSE;
ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS phoenix_used BOOLEAN DEFAULT FALSE;

-- ══════════════════════════════════════════════════════════════════════════════
-- P1-A: Run Score & History
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS peak_dd INTEGER DEFAULT 0;
ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS peak_wanted_level INTEGER DEFAULT 0;
ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS rounds_played INTEGER DEFAULT 0;
ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS best_run_score INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS bounty_run_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    peak_dd INTEGER DEFAULT 0,
    peak_wanted_level INTEGER DEFAULT 0,
    total_predictions INTEGER DEFAULT 0,
    correct_predictions INTEGER DEFAULT 0,
    accuracy FLOAT DEFAULT 0.0,
    rounds_played INTEGER DEFAULT 0,
    run_score INTEGER DEFAULT 0,
    end_reason VARCHAR(20) DEFAULT 'bust',
    ended_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_run_history_user ON bounty_run_history(user_id);
CREATE INDEX IF NOT EXISTS idx_run_history_score ON bounty_run_history(run_score DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- P1-B: Badges
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS badge_progress TEXT;

CREATE TABLE IF NOT EXISTS bounty_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    badge_id VARCHAR(50) NOT NULL,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    run_context TEXT,
    CONSTRAINT uq_bounty_badge_user UNIQUE (user_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_badges_user ON bounty_badges(user_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- P1-C: Titles
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS lifetime_dd_earned INTEGER DEFAULT 0;
ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS runs_completed INTEGER DEFAULT 0;
ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS active_title VARCHAR(50);

CREATE TABLE IF NOT EXISTS bounty_titles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    title_id VARCHAR(50) NOT NULL,
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_bounty_title_user UNIQUE (user_id, title_id)
);
CREATE INDEX IF NOT EXISTS idx_titles_user ON bounty_titles(user_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- P1-D: Daily Streaks
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0;
ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0;
ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS last_streak_date DATE;
ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS streak_shield BOOLEAN DEFAULT FALSE;

-- ══════════════════════════════════════════════════════════════════════════════
-- P2-B: Weekly Stock Events (columns on bounty_windows)
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE bounty_windows ADD COLUMN IF NOT EXISTS event_type VARCHAR(30);
ALTER TABLE bounty_windows ADD COLUMN IF NOT EXISTS event_name VARCHAR(100);

-- ══════════════════════════════════════════════════════════════════════════════
-- P2-C: Post-Settlement Analysis
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE bounty_window_stocks ADD COLUMN IF NOT EXISTS settlement_context TEXT;

-- ══════════════════════════════════════════════════════════════════════════════
-- P3-B: Activity Feed
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bounty_activity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    event_type VARCHAR(30) NOT NULL,
    event_data TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON bounty_activity_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user ON bounty_activity_events(user_id);
