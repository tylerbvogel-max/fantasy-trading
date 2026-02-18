# Bounty Hunter — Stock Prediction Game

## Project Overview
A mobile stock prediction game where players make directional picks on 1-hour price windows. Players earn Double Dollars, climb wanted levels, and collect Irons (gear) that modify gameplay. Think stock market meets western outlaw.

## Architecture
- **Backend**: Python FastAPI + PostgreSQL (in `/backend`)
- **Mobile**: React Native with Expo (in `/mobile`)
- **Stock Data**: Finnhub free tier API
- **Auth**: Lightweight invite-code system

## Current State
The app is focused exclusively on Bounty Hunter mode. Previous multi-mode infrastructure (Classroom, League, Arena) has been removed — see `docs/game-modes.md` for historical reference.

### Backend
- SQLAlchemy ORM models: User, StockActive, StockMaster, InviteCode, and all Bounty models (BountyWindow, BountyPrediction, BountyPlayerStats, etc.)
- 4 API routers: auth, stocks, admin, bounty
- 3 service modules: bounty_service (game logic), finnhub_service (stock data), auth_service (tokens + invite codes)
- Bounty config constants in `bounty_config.py`
- Background job scheduler: price refresh, trending stocks, bounty window creation/settlement
- Seed script (`python -m app.seed`) creates 50 stocks, 10 invite codes, admin account
- Swagger docs at /docs

### Mobile
- 5 tabs: Bounty, Stats, Board, Lab, Profile
- Auth screen (register with invite code, login with token)
- BountyHunterScreen — main prediction interface with swipe cards
- BountyStatsScreen — detailed player statistics
- BountyBoardScreen — leaderboard
- SwipeTestScreen — lab/testing area
- ProfileScreen — user info, settings, logout

## Key Design Decisions
1. **Bounty Hunter uses 1-hour prediction windows** — maximizes daily touchpoints (4-6 per day), creates stronger habit loops
2. **Wanted level system** — exponential multipliers (levels 1-10+) reward streaks and risk-taking
3. **75 collectible Irons** across 4 rarity tiers modify scoring, accuracy, and economy
4. **Double Dollars** — in-game currency earned through correct predictions
5. **Continuous game** — no seasons, players compete on an ongoing basis

## Database Schema (Key Relationships)
```
users ──→ bounty_player_stats (1:1)
          bounty_player_iron (equipped gear)

bounty_windows ──→ bounty_window_stocks (per-stock tracking)
                 ──→ bounty_predictions (player picks)

stocks_active — cached prices from Finnhub (refreshed every 15 min)
stocks_master — full universe of tradeable stocks with sector/tier metadata
invite_codes — registration codes
spy_price_logs — historical SPY price data for charts
bounty_iron_offerings — Iron selection events
```

## Important Files
- `backend/app/services/bounty_service.py` — Core bounty game logic
- `backend/app/services/bounty_config.py` — All tunable constants (scoring, wanted levels, economy)
- `backend/app/services/finnhub_service.py` — Stock price fetching and caching
- `backend/app/seed.py` — Database seeder (run once after creating DB)
- `backend/app/jobs/scheduler.py` — Background jobs (prices, bounty windows)
- `mobile/src/api/client.ts` — All API types and functions
- `mobile/src/hooks/useApi.ts` — React Query hooks wrapping the API client
- `tools/bounty-sim/irons.mjs` — 75 Iron definitions, rarity weights, and effect calculations
- `tools/bounty-sim/config.mjs` — All Bounty Hunter tunable constants (30 rounds, scoring, wanted levels)
- `tools/bounty-sim/sim.mjs` — Bounty Hunter simulation CLI + web dashboard server

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

## Style & Patterns
- Mobile uses a dark theme defined in `src/utils/theme.ts`
- Colors: navy background (#0F1729), card (#1B2A4A), teal accent (#2E86AB), orange for bounty (#FF6B35)
- All API calls go through React Query hooks for caching and auto-refresh
- Tyler prefers step-by-step implementation with testing between steps
