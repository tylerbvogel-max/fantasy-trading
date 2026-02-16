# Fantasy Stock Trading App

## Project Overview
Competitive paper trading mobile app where players compete with virtual portfolios using real stock market data across themed seasons. Think fantasy football but for the stock market.

## Architecture
- **Backend**: Python FastAPI + PostgreSQL (in `/backend`)
- **Mobile**: React Native with Expo (in `/mobile`)
- **Stock Data**: Finnhub free tier API
- **Auth**: Lightweight invite-code system (Phase 2 upgrades to JWT/OAuth)

## Current State (V1 Build)
The full backend scaffold is complete and the mobile app has two working screens.

### Backend — COMPLETE
- 11 SQLAlchemy ORM models in `app/models/`
- 6 API routers: auth, seasons, trade, portfolio, stocks, admin
- 4 service modules: trade_service (atomic execution), portfolio_service (valuations + leaderboard), finnhub_service (stock data), auth_service (tokens + invite codes)
- Background job scheduler in `app/jobs/scheduler.py`
- Seed script (`python -m app.seed`) creates 50 stocks, 2 seasons, 10 invite codes, admin account
- Swagger docs auto-generated at /docs

### Mobile — IN PROGRESS
- ✅ Auth screen (register with invite code, login with token)
- ✅ Leaderboard screen (season selector, rankings, pull-to-refresh)
- ✅ Tab navigation (5 tabs: Home, Trade, Portfolio, Stocks, Profile)
- ✅ API client with typed interfaces (`src/api/client.ts`)
- ✅ React Query hooks with auto-refresh (`src/hooks/useApi.ts`)
- 🔲 Trade screen (stock search, buy/sell form, confirmation modal)
- 🔲 Portfolio screen (holdings list, summary card, performance chart)
- 🔲 Stocks screen (browse, search, stock detail)
- 🔲 Profile screen (user info, season list, settings)

## Key Design Decisions
1. **Transactions are the source of truth** — holdings and balances are derived from transactions
2. **Trades are atomic** — the entire buy/sell executes in a single Postgres transaction
3. **Themed seasons** — `seasons.allowed_stocks` (JSONB) filters which stocks are tradeable. NULL = all stocks.
4. **Players can be in multiple seasons simultaneously** — each with independent portfolios via `player_seasons` junction table
5. **Phase 2 tables exist but are unused** — `interaction_types` and `player_interactions` are in the schema for future social mechanics (forced trades, sabotage, etc.)
6. **Bounty Hunter uses 1-hour prediction windows, 30 rounds per season week** — chosen over 2-hour windows to maximize daily touchpoints (4-6 vs 2-3), create stronger habit loops, and make predictions feel more skill-testable. After-hours windows provide schedule flexibility. See `docs/game-modes.md` for full Bounty Hunter design.
7. **Four season modes** — Classroom, League, Arena, and Bounty Hunter. Each gates different features. Mode is set per-season at creation time.

## Database Schema (Key Relationships)
```
users (1) → (many) player_seasons (1) → (many) holdings
                                    (1) → (many) transactions
seasons (1) → (many) player_seasons
stocks_active — cached prices from Finnhub (refreshed every 15 min)
stocks_master — full universe of tradeable stocks with sector/tier metadata
```

## Important Files
- `backend/app/services/trade_service.py` — Core trade execution logic
- `backend/app/services/portfolio_service.py` — Portfolio valuation + leaderboard calculation
- `backend/app/services/finnhub_service.py` — Stock price fetching and caching
- `backend/app/seed.py` — Database seeder (run once after creating DB)
- `mobile/src/api/client.ts` — All API types and functions
- `mobile/src/hooks/useApi.ts` — React Query hooks wrapping the API client
- `tools/bounty-sim/irons.mjs` — 75 Iron definitions, rarity weights, and effect calculations
- `tools/bounty-sim/config.mjs` — All Bounty Hunter tunable constants (30 rounds, scoring, wanted levels)
- `tools/bounty-sim/sim.mjs` — Bounty Hunter simulation CLI + web dashboard server
- `docs/game-modes.md` — Season mode definitions (Classroom, League, Arena, Bounty Hunter)

## Environment
- Finnhub API key is in `.env` (not committed to git)
- Development is on a Chromebook with Linux (Crostini)
- Mobile testing via Expo Go on iPhone
- Backend runs locally, will deploy to Railway

## Commands
```bash
# Backend
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Mobile
cd mobile
npx expo start
# Then scan QR code with iPhone camera to open in Expo Go

# Seed database (first time only)
cd backend
python -m app.seed

# Force price refresh
curl -X POST http://localhost:8000/admin/stocks/refresh -H "Authorization: Bearer ADMIN_TOKEN"

# Bounty Hunter simulation dashboard
node tools/bounty-sim/sim.mjs --serve
# Opens at http://localhost:8080 — adjust all parameters, toggle irons, run simulations
```

## Next Priority
Build the Trade screen and Portfolio screen in the mobile app. The backend endpoints for both are already complete and tested.

## Style & Patterns
- Mobile uses a dark theme defined in `src/utils/theme.ts`
- Colors: navy background (#0F1729), card (#1B2A4A), teal accent (#2E86AB)
- All API calls go through React Query hooks for caching and auto-refresh
- Tyler prefers step-by-step implementation with testing between steps
