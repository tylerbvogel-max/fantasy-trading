"""Initial schema — full current state of all tables and indexes.

Revision ID: 001_initial
Revises:
Create Date: 2026-04-06

This migration captures the complete schema as it exists today.
For existing databases, stamp this revision without running it:
    alembic stamp 001_initial
For new databases, run it normally:
    alembic upgrade head
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # === users ===
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False, default=sa.text("gen_random_uuid()")),
        sa.Column("alias", sa.String(50), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("invite_code_used", sa.String(20), nullable=True),
        sa.Column("is_admin", sa.Boolean(), default=False),
        sa.Column("token_hash", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("alias"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_token_hash", "users", ["token_hash"])

    # === invite_codes ===
    op.create_table(
        "invite_codes",
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("created_by", sa.UUID(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("max_uses", sa.Integer(), default=1),
        sa.Column("times_used", sa.Integer(), default=0),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("code"),
    )

    # === stocks_master ===
    op.create_table(
        "stocks_master",
        sa.Column("symbol", sa.String(10), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("sector", sa.String(50), nullable=True),
        sa.Column("market_cap_tier", sa.String(20), nullable=True),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.PrimaryKeyConstraint("symbol"),
    )

    # === stocks_active ===
    op.create_table(
        "stocks_active",
        sa.Column("symbol", sa.String(10), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("price", sa.Numeric(12, 4), nullable=True),
        sa.Column("price_open", sa.Numeric(12, 4), nullable=True),
        sa.Column("high", sa.Numeric(12, 4), nullable=True),
        sa.Column("low", sa.Numeric(12, 4), nullable=True),
        sa.Column("volume", sa.BigInteger(), nullable=True),
        sa.Column("market_cap", sa.BigInteger(), nullable=True),
        sa.Column("pe_ratio", sa.Numeric(10, 2), nullable=True),
        sa.Column("eps", sa.Numeric(10, 4), nullable=True),
        sa.Column("high_52w", sa.Numeric(12, 4), nullable=True),
        sa.Column("low_52w", sa.Numeric(12, 4), nullable=True),
        sa.Column("beta", sa.Numeric(6, 4), nullable=True),
        sa.Column("change_pct", sa.Numeric(8, 4), nullable=True),
        sa.Column("trending_rank", sa.Integer(), nullable=True),
        sa.Column("last_updated", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("symbol"),
    )
    op.create_index("ix_stocks_active_trending_rank", "stocks_active", ["trending_rank"])

    # === bounty_windows ===
    op.create_table(
        "bounty_windows",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("window_date", sa.Date(), nullable=False),
        sa.Column("window_index", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("spy_open_price", sa.Numeric(12, 4), nullable=True),
        sa.Column("spy_close_price", sa.Numeric(12, 4), nullable=True),
        sa.Column("result", sa.String(4), nullable=True),
        sa.Column("is_settled", sa.Boolean(), default=False),
        sa.Column("event_type", sa.String(30), nullable=True),
        sa.Column("event_name", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("window_date", "window_index", name="uq_bounty_window_date_index"),
    )
    op.create_index("ix_bounty_windows_date", "bounty_windows", ["window_date"])
    op.create_index("ix_bounty_windows_settled", "bounty_windows", ["is_settled", "end_time"])

    # === bounty_window_stocks ===
    op.create_table(
        "bounty_window_stocks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("bounty_window_id", sa.UUID(), sa.ForeignKey("bounty_windows.id"), nullable=False),
        sa.Column("symbol", sa.String(10), nullable=False),
        sa.Column("open_price", sa.Numeric(12, 4), nullable=True),
        sa.Column("close_price", sa.Numeric(12, 4), nullable=True),
        sa.Column("result", sa.String(4), nullable=True),
        sa.Column("is_settled", sa.Boolean(), default=False),
        sa.Column("settlement_context", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bounty_window_id", "symbol", name="uq_bounty_window_stock"),
    )
    op.create_index("ix_bounty_window_stocks_window_id", "bounty_window_stocks", ["bounty_window_id"])

    # === bounty_predictions ===
    op.create_table(
        "bounty_predictions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("bounty_window_id", sa.UUID(), sa.ForeignKey("bounty_windows.id"), nullable=False),
        sa.Column("symbol", sa.String(10), nullable=False, server_default="SPY"),
        sa.Column("prediction", sa.String(4), nullable=False),
        sa.Column("confidence", sa.Integer(), nullable=True),
        sa.Column("bet_amount", sa.Integer(), default=0),
        sa.Column("is_correct", sa.Boolean(), nullable=True),
        sa.Column("payout", sa.Integer(), default=0),
        sa.Column("wanted_level_at_pick", sa.Integer(), default=0),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("action_type", sa.String(20), default="directional"),
        sa.Column("insurance_triggered", sa.Boolean(), default=False),
        sa.Column("base_points", sa.Integer(), default=0),
        sa.Column("wanted_multiplier_used", sa.Integer(), default=1),
        sa.Column("leverage", sa.Float(), default=1.0),
        sa.Column("margin_call_triggered", sa.Boolean(), default=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "bounty_window_id", "symbol", name="uq_bounty_user_window_symbol"),
    )
    op.create_index("ix_bounty_predictions_user_id", "bounty_predictions", ["user_id"])
    op.create_index("ix_bounty_predictions_window_id", "bounty_predictions", ["bounty_window_id"])
    op.create_index("ix_bounty_predictions_user_created", "bounty_predictions", ["user_id", "created_at"])

    # === bounty_player_stats ===
    op.create_table(
        "bounty_player_stats",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), unique=True, nullable=False),
        sa.Column("double_dollars", sa.Integer(), default=0),
        sa.Column("wanted_level", sa.Integer(), default=0),
        sa.Column("total_predictions", sa.Integer(), default=0),
        sa.Column("correct_predictions", sa.Integer(), default=0),
        sa.Column("best_streak", sa.Integer(), default=0),
        sa.Column("last_prediction_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notoriety", sa.Float(), default=0.0),
        sa.Column("chambers", sa.Integer(), default=2),
        sa.Column("skip_count_this_window", sa.Integer(), default=0),
        sa.Column("is_busted", sa.Boolean(), default=False),
        sa.Column("bust_count", sa.Integer(), default=0),
        sa.Column("margin_call_cooldown", sa.Integer(), default=0),
        sa.Column("saloon_used", sa.Boolean(), default=False),
        sa.Column("phoenix_used", sa.Boolean(), default=False),
        sa.Column("peak_dd", sa.Integer(), default=0),
        sa.Column("peak_wanted_level", sa.Integer(), default=0),
        sa.Column("rounds_played", sa.Integer(), default=0),
        sa.Column("best_run_score", sa.Integer(), default=0),
        sa.Column("lifetime_dd_earned", sa.Integer(), default=0),
        sa.Column("runs_completed", sa.Integer(), default=0),
        sa.Column("active_title", sa.String(50), nullable=True),
        sa.Column("current_streak", sa.Integer(), default=0),
        sa.Column("longest_streak", sa.Integer(), default=0),
        sa.Column("last_streak_date", sa.Date(), nullable=True),
        sa.Column("streak_shield", sa.Boolean(), default=False),
        sa.Column("badge_progress", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    # === bounty_player_irons ===
    op.create_table(
        "bounty_player_irons",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("iron_id", sa.String(50), nullable=False),
        sa.Column("slot_number", sa.Integer(), nullable=False),
        sa.Column("equipped_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bounty_player_irons_user_id", "bounty_player_irons", ["user_id"])

    # === bounty_iron_offerings ===
    op.create_table(
        "bounty_iron_offerings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("bounty_window_id", sa.UUID(), sa.ForeignKey("bounty_windows.id"), nullable=True),
        sa.Column("offered_iron_ids", sa.String(500), nullable=False),
        sa.Column("chosen_iron_id", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bounty_iron_offerings_user_id", "bounty_iron_offerings", ["user_id"])

    # === spy_price_log ===
    op.create_table(
        "spy_price_log",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("price", sa.Numeric(12, 4), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )

    # === bounty_run_history ===
    op.create_table(
        "bounty_run_history",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("peak_dd", sa.Integer(), default=0),
        sa.Column("peak_wanted_level", sa.Integer(), default=0),
        sa.Column("total_predictions", sa.Integer(), default=0),
        sa.Column("correct_predictions", sa.Integer(), default=0),
        sa.Column("accuracy", sa.Float(), default=0.0),
        sa.Column("rounds_played", sa.Integer(), default=0),
        sa.Column("run_score", sa.Integer(), default=0),
        sa.Column("end_reason", sa.String(20), default="bust"),
        sa.Column("ended_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bounty_run_history_user_id", "bounty_run_history", ["user_id"])
    op.create_index("ix_bounty_run_history_run_score", "bounty_run_history", ["run_score"])

    # === bounty_badges ===
    op.create_table(
        "bounty_badges",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("badge_id", sa.String(50), nullable=False),
        sa.Column("earned_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("run_context", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "badge_id", name="uq_bounty_badge_user"),
    )
    op.create_index("ix_bounty_badges_user_id", "bounty_badges", ["user_id"])

    # === bounty_titles ===
    op.create_table(
        "bounty_titles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title_id", sa.String(50), nullable=False),
        sa.Column("unlocked_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "title_id", name="uq_bounty_title_user"),
    )
    op.create_index("ix_bounty_titles_user_id", "bounty_titles", ["user_id"])

    # === bounty_activity_events ===
    op.create_table(
        "bounty_activity_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("event_type", sa.String(30), nullable=False),
        sa.Column("event_data", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bounty_activity_events_created", "bounty_activity_events", ["created_at"])

    # === market_regimes ===
    op.create_table(
        "market_regimes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("monetary_regime", sa.String(20)),
        sa.Column("risk_regime", sa.String(20)),
        sa.Column("dominant_narrative", sa.Text(), nullable=True),
        sa.Column("llm_confidence", sa.Float(), nullable=True),
        sa.Column("raw_headlines", sa.JSON(), nullable=True),
        sa.Column("headline_count", sa.Integer(), default=0),
        sa.Column("quant_rate", sa.Float(), nullable=True),
        sa.Column("quant_vix", sa.Float(), nullable=True),
        sa.Column("quant_ma200_slope", sa.Float(), nullable=True),
        sa.Column("final_regime", sa.String(30)),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("market_regimes")
    op.drop_table("bounty_activity_events")
    op.drop_table("bounty_titles")
    op.drop_table("bounty_badges")
    op.drop_table("bounty_run_history")
    op.drop_table("spy_price_log")
    op.drop_table("bounty_iron_offerings")
    op.drop_table("bounty_player_irons")
    op.drop_table("bounty_player_stats")
    op.drop_table("bounty_predictions")
    op.drop_table("bounty_window_stocks")
    op.drop_table("bounty_windows")
    op.drop_table("stocks_active")
    op.drop_table("stocks_master")
    op.drop_table("invite_codes")
    op.drop_table("users")
