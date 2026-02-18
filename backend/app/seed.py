"""
Seed script: Creates initial data for the Bounty Hunter app.
Run after migrations: python -m app.seed
"""
import asyncio
import secrets
from app.database import engine, async_session, Base
from app.models import *  # noqa - ensure all models loaded
from app.services.auth_service import generate_token, hash_token


# Top 50 US stocks for the initial stock universe
INITIAL_STOCKS = [
    ("AAPL", "Apple Inc", "Technology", "large"),
    ("MSFT", "Microsoft Corporation", "Technology", "large"),
    ("GOOGL", "Alphabet Inc Class A", "Technology", "large"),
    ("AMZN", "Amazon.com Inc", "Consumer Cyclical", "large"),
    ("NVDA", "NVIDIA Corporation", "Technology", "large"),
    ("META", "Meta Platforms Inc", "Technology", "large"),
    ("TSLA", "Tesla Inc", "Consumer Cyclical", "large"),
    ("BRK.B", "Berkshire Hathaway Inc", "Financial Services", "large"),
    ("LLY", "Eli Lilly and Company", "Healthcare", "large"),
    ("V", "Visa Inc", "Financial Services", "large"),
    ("JPM", "JPMorgan Chase & Co", "Financial Services", "large"),
    ("WMT", "Walmart Inc", "Consumer Defensive", "large"),
    ("UNH", "UnitedHealth Group Inc", "Healthcare", "large"),
    ("MA", "Mastercard Inc", "Financial Services", "large"),
    ("PG", "Procter & Gamble Co", "Consumer Defensive", "large"),
    ("JNJ", "Johnson & Johnson", "Healthcare", "large"),
    ("HD", "Home Depot Inc", "Consumer Cyclical", "large"),
    ("COST", "Costco Wholesale Corp", "Consumer Defensive", "large"),
    ("ABBV", "AbbVie Inc", "Healthcare", "large"),
    ("CRM", "Salesforce Inc", "Technology", "large"),
    ("NFLX", "Netflix Inc", "Communication Services", "large"),
    ("AMD", "Advanced Micro Devices Inc", "Technology", "large"),
    ("BAC", "Bank of America Corp", "Financial Services", "large"),
    ("KO", "Coca-Cola Co", "Consumer Defensive", "large"),
    ("PEP", "PepsiCo Inc", "Consumer Defensive", "large"),
    ("MRK", "Merck & Co Inc", "Healthcare", "large"),
    ("TMO", "Thermo Fisher Scientific Inc", "Healthcare", "large"),
    ("AVGO", "Broadcom Inc", "Technology", "large"),
    ("DIS", "Walt Disney Co", "Communication Services", "large"),
    ("ADBE", "Adobe Inc", "Technology", "large"),
    ("CSCO", "Cisco Systems Inc", "Technology", "large"),
    ("ACN", "Accenture plc", "Technology", "large"),
    ("ABT", "Abbott Laboratories", "Healthcare", "large"),
    ("INTC", "Intel Corporation", "Technology", "large"),
    ("CMCSA", "Comcast Corporation", "Communication Services", "large"),
    ("VZ", "Verizon Communications Inc", "Communication Services", "large"),
    ("T", "AT&T Inc", "Communication Services", "large"),
    ("NKE", "Nike Inc", "Consumer Cyclical", "large"),
    ("PFE", "Pfizer Inc", "Healthcare", "large"),
    ("ORCL", "Oracle Corporation", "Technology", "large"),
    ("SPY", "SPDR S&P 500 ETF Trust", "ETF", "large"),
    ("QQQ", "Invesco QQQ Trust", "ETF", "large"),
    ("DIA", "SPDR Dow Jones Industrial Average ETF", "ETF", "large"),
    ("IWM", "iShares Russell 2000 ETF", "ETF", "large"),
    ("ARKK", "ARK Innovation ETF", "ETF", "mid"),
    ("PLTR", "Palantir Technologies Inc", "Technology", "mid"),
    ("SQ", "Block Inc", "Financial Services", "mid"),
    ("SNAP", "Snap Inc", "Communication Services", "mid"),
    ("RIVN", "Rivian Automotive Inc", "Consumer Cyclical", "mid"),
    ("SOFI", "SoFi Technologies Inc", "Financial Services", "mid"),
]


async def seed():
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        # 1. Seed stocks_master and stocks_active
        for symbol, name, sector, tier in INITIAL_STOCKS:
            master = StockMaster(
                symbol=symbol, name=name, sector=sector,
                market_cap_tier=tier, is_active=True,
            )
            db.add(master)

            active = StockActive(symbol=symbol, name=name)
            db.add(active)

        # 2. Create admin user
        admin_token = generate_token()
        admin_user = User(
            alias="admin",
            is_admin=True,
            token_hash=hash_token(admin_token),
        )
        db.add(admin_user)

        # 3. Create initial invite codes
        codes = []
        for i in range(10):
            code = f"BETA-{secrets.token_hex(3).upper()}"
            invite = InviteCode(code=code, max_uses=1)
            db.add(invite)
            codes.append(code)

        await db.commit()

        print("=" * 60)
        print("SEED COMPLETE")
        print("=" * 60)
        print(f"\nAdmin token (SAVE THIS): {admin_token}")
        print(f"Admin alias: admin")
        print(f"\nInvite codes generated:")
        for code in codes:
            print(f"  {code}")
        print(f"\nStocks seeded: {len(INITIAL_STOCKS)}")
        print(f"\nNext steps:")
        print(f"  1. Set FINNHUB_API_KEY in .env")
        print(f"  2. Run: uvicorn app.main:app --reload")
        print(f"  3. Visit: http://localhost:8000/docs")
        print(f"  4. Use admin token to create more invite codes")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(seed())
