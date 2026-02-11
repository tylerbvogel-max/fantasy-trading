"""
One-time script to:
1. Add end dates to existing seasons (SEASON_001, SEASON_MAG7_01)
2. Create a future "Summer Rally 2026" season for testing

Run: python -m app.add_future_season
"""
import asyncio
from datetime import datetime, timezone
from app.database import async_session
from app.models.season import Season


async def main():
    async with async_session() as db:
        # Update existing seasons with end dates (June 30, 2026)
        end_june = datetime(2026, 6, 30, 23, 59, 59, tzinfo=timezone.utc)

        for season_id in ("SEASON_001", "SEASON_MAG7_01"):
            season = await db.get(Season, season_id)
            if season:
                season.end_date = end_june
                print(f"Updated {season_id} end_date → {end_june.date()}")
            else:
                print(f"Season {season_id} not found, skipping")

        # Create future summer season
        summer_id = "SEASON_SUMMER_01"
        existing = await db.get(Season, summer_id)
        if existing:
            print(f"{summer_id} already exists, skipping creation")
        else:
            summer = Season(
                id=summer_id,
                name="Summer Rally 2026",
                season_type="open",
                game_mode="league",
                start_date=datetime(2026, 7, 1, 13, 30, 0, tzinfo=timezone.utc),
                end_date=datetime(2026, 8, 31, 20, 0, 0, tzinfo=timezone.utc),
                starting_cash=100000.00,
                description="Summer showdown! Trade through July and August to see who comes out on top.",
            )
            db.add(summer)
            print(f"Created {summer_id}: Summer Rally 2026 (Jul 1 – Aug 31)")

        await db.commit()
        print("Done!")


if __name__ == "__main__":
    asyncio.run(main())
