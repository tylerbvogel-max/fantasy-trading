# Fantasy Trading — System Architecture

## How Everything Connects

```
┌─────────────┐     HTTPS      ┌──────────────────┐     SQL      ┌────────────┐
│  iPhone      │ ──────────────→│  Render Web      │ ───────────→│  Render    │
│  (Expo Go)   │←──────────────│  (FastAPI/Docker) │←───────────│  PostgreSQL │
└─────────────┘   JSON API     └──────────────────┘             └────────────┘
                                       │
                                       │ HTTP (every 15 min)
                                       ↓
                                ┌──────────────┐
                                │  Finnhub API  │
                                │  (stock data) │
                                └──────────────┘

┌──────────────┐   git push    ┌──────────────┐  manual deploy  ┌──────────────┐
│  Chromebook   │ ────────────→│   GitHub      │ ──────────────→│    Render     │
│  (your code)  │              │  (repo)       │                │  (rebuilds)   │
└──────────────┘               └──────────────┘                 └──────────────┘

┌──────────────┐   HTTP ping every 14 min (weekdays 9-5 ET)
│ cron-job.org  │ ──────────────→ Render /health (keeps server awake)
└──────────────┘
```

## Layer by Layer

| Layer | Tool | What It Does |
|-------|------|-------------|
| **Phone** | React Native + Expo Go | The screens you see and tap. Sends API requests, stores your auth token in encrypted SecureStore. |
| **API Client** | `client.ts` + React Query | Sends requests to the backend, caches responses, auto-refreshes leaderboard/portfolio every 60s. Auto-signs out on 401. |
| **Backend Server** | FastAPI (Python) on Render | Receives requests, runs business logic (trade execution, validation, leaderboard calculation), talks to the database. |
| **Database** | PostgreSQL on Render | Permanent storage: users, trades, holdings, stocks, seasons, daily snapshots. 11 tables. |
| **Stock Prices** | Finnhub API (free tier) | Provides real stock prices. Backend fetches every 15 min on weekdays via background scheduler, or on-demand if price is >5 min stale. |
| **Background Jobs** | APScheduler (runs inside backend) | Two automated jobs: price refresh (every 15 min weekdays) and daily portfolio snapshots (4:30 PM ET). |
| **Auth** | Invite codes + SHA256 token hash | Register with one-time code, get a token, token stored hashed in DB. Phone saves raw token in SecureStore. |
| **Code Storage** | GitHub | All source code lives at `tylerbvogel-max/fantasy-trading`. Push changes here, then deploy to Render. |
| **Hosting** | Render (free tier) | Runs the Docker container (backend) and PostgreSQL database. Sleeps after 15 min idle. |
| **Keep-Alive** | cron-job.org | Pings `/health` every 14 min on weekdays 9-5 ET to prevent Render from sleeping during trading hours. |
| **Deployment** | Docker + render.yaml | Dockerfile builds the Python app. render.yaml tells Render what to create (DB + web service + env vars). |

## Data Flows

### A trade (tap to database)

Phone → POST /trade → check market hours → check season membership → fetch stock price (Finnhub if stale) → validate cash/shares → create Transaction + update Holding + update cash → commit → return result → phone invalidates portfolio & leaderboard caches → UI updates

### Stock prices refresh

APScheduler (every 15 min weekdays) → loop all 50 stocks → call Finnhub API for each (1.1s delay for rate limit) → update StockActive table → done

### Daily snapshots (for Profile history chart)

APScheduler (4:30 PM ET daily) → for each active season → for each player → calculate total portfolio value → save PortfolioSnapshot + HoldingsSnapshot → done

## Key Files

| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI app, CORS, router registration |
| `backend/app/services/trade_service.py` | Trade execution + market hours check |
| `backend/app/services/portfolio_service.py` | Portfolio valuation + leaderboard + snapshots |
| `backend/app/services/finnhub_service.py` | Stock price fetching + caching |
| `backend/app/services/auth_service.py` | Registration, login, token hashing |
| `backend/app/jobs/scheduler.py` | Background price refresh + daily snapshots |
| `backend/app/routers/admin.py` | Seed, invite codes, season management |
| `mobile/App.tsx` | Root app with tab navigation + auth check |
| `mobile/src/api/client.ts` | All API calls + SecureStore + 401 handling |
| `mobile/src/hooks/useApi.ts` | React Query hooks for caching/mutations |
| `mobile/src/utils/theme.ts` | Retro 80s color scheme + design tokens |
| `render.yaml` | Infrastructure-as-code for Render deployment |

## Automations (things that happen without you)

1. **Price refresh** — every 15 min on weekdays, hourly on weekends
2. **Daily snapshots** — 4:30 PM ET, captures every player's portfolio value
3. **Cron wake-up** — every 14 min weekdays 9-5 ET, keeps Render from sleeping
4. **Auto-sign-out** — if backend returns 401, phone clears token and shows login
5. **React Query auto-refresh** — leaderboard and portfolio re-fetch every 60 seconds

## Database Schema (11 Tables)

```
users ──────────────┐
                    ├──→ player_seasons ──→ holdings
seasons ────────────┘         │
                              ├──→ transactions
                              └──→ portfolio_snapshots ──→ holdings_snapshots

invite_codes (standalone, tracks registration codes)
stocks_active (cached prices from Finnhub, refreshed every 15 min)
stocks_master (full universe of tradeable stocks with sector/tier metadata)
season_archives (Phase 2 — end-of-season records)
interaction_types + player_interactions (Phase 2 — social mechanics)
```

## Accounts & Credentials

- **Admin token**: Used for `/admin/*` endpoints (invite codes, season management, price refresh)
- **Invite codes**: One-time use, format `BETA-XXXXXX`, 100 generated and stored in `invite-codes.txt`
- **Finnhub API key**: Set in Render environment variables
- **Render**: Deployed at `https://fantasy-trading-api.onrender.com`
- **GitHub**: `github.com/tylerbvogel-max/fantasy-trading` (private)
