# Bounty Hunter — System Architecture

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
| **Phone** | React Native + Expo Go | 5 tabs: Bounty, Stats, Board, Lab, Profile. Sends API requests, stores auth token in encrypted SecureStore. |
| **API Client** | `client.ts` + React Query | Sends requests to the backend, caches responses, auto-refreshes bounty status every 30s. Auto-signs out on 401. |
| **Backend Server** | FastAPI (Python) on Render | Receives requests, runs bounty game logic (predictions, settlement, scoring, iron effects), talks to the database. |
| **Database** | PostgreSQL on Render | Permanent storage: users, bounty windows, predictions, player stats, stocks, irons. |
| **Stock Prices** | Finnhub API (free tier) | Provides real stock prices. Backend fetches every 15 min on weekdays via background scheduler. |
| **Background Jobs** | APScheduler (runs inside backend) | Price refresh, trending stock updates, bounty window creation, and window settlement. |
| **Auth** | Invite codes + SHA256 token hash | Register with one-time code, get a token, token stored hashed in DB. Phone saves raw token in SecureStore. |
| **Code Storage** | GitHub | All source code lives at `tylerbvogel-max/fantasy-trading`. Push changes here, then deploy to Render. |
| **Hosting** | Render (free tier) | Runs the Docker container (backend) and PostgreSQL database. Sleeps after 15 min idle. |
| **Keep-Alive** | cron-job.org | Pings `/health` every 14 min on weekdays 9-5 ET to prevent Render from sleeping during trading hours. |
| **Deployment** | Docker + render.yaml | Dockerfile builds the Python app. render.yaml tells Render what to create (DB + web service + env vars). |

## Data Flows

### A bounty prediction (tap to database)

Phone → POST /bounty/predict → validate window is active → check player has balance (ante cost) → deduct ante → create BountyPrediction → return confirmation → phone invalidates bounty status cache → UI updates

### Bounty window settlement

APScheduler (at window end) → fetch close price for each stock → compare to open price → determine UP/DOWN/HOLD result → score all predictions → apply Iron effects → update player stats (DD, wanted level, streaks) → mark window settled

### Stock prices refresh

APScheduler (every 15 min weekdays) → loop all active stocks → call Finnhub API for each (1.1s delay for rate limit) → update StockActive table → done

## Key Files

| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI app, CORS, router registration |
| `backend/app/services/bounty_service.py` | Bounty game logic (predictions, settlement, scoring) |
| `backend/app/services/bounty_config.py` | All tunable constants |
| `backend/app/services/finnhub_service.py` | Stock price fetching + caching |
| `backend/app/services/auth_service.py` | Registration, login, token hashing |
| `backend/app/jobs/scheduler.py` | Background price refresh + bounty window jobs |
| `backend/app/routers/admin.py` | Invite codes, stock management |
| `mobile/App.tsx` | Root app with tab navigation + auth check |
| `mobile/src/api/client.ts` | All API calls + SecureStore + 401 handling |
| `mobile/src/hooks/useApi.ts` | React Query hooks for caching/mutations |
| `mobile/src/utils/theme.ts` | Dark western color scheme + design tokens |
| `render.yaml` | Infrastructure-as-code for Render deployment |

## Automations (things that happen without you)

1. **Price refresh** — every 15 min on weekdays, hourly on weekends
2. **Trending stocks** — 10 AM ET weekdays, updates trending rankings
3. **Bounty window creation** — 8:50 AM ET weekdays, creates day's prediction windows
4. **Bounty settlement** — at end of each window, scores predictions and updates stats
5. **Cron wake-up** — every 14 min weekdays 9-5 ET, keeps Render from sleeping
6. **Auto-sign-out** — if backend returns 401, phone clears token and shows login
7. **React Query auto-refresh** — bounty status re-fetches every 30 seconds

## Database Schema

```
users ──────────────→ bounty_player_stats (1:1, DD balance, wanted level, streaks)
                    → bounty_player_iron (equipped Irons per player)

bounty_windows ────→ bounty_window_stocks (per-stock open/close/result)
                   → bounty_predictions (player picks with confidence)

invite_codes (standalone, tracks registration codes)
stocks_active (cached prices from Finnhub, refreshed every 15 min)
stocks_master (full universe of tradeable stocks with sector/tier metadata)
spy_price_logs (historical price data for chart candles)
bounty_iron_offerings (Iron selection events after milestones)
```

## Accounts & Credentials

- **Admin token**: Used for `/admin/*` endpoints (invite codes, stock management)
- **Invite codes**: One-time use, format `BETA-XXXXXX`, stored in `invite-codes.txt`
- **Finnhub API key**: Set in Render environment variables
- **Render**: Deployed at `https://fantasy-trading-api.onrender.com`
- **GitHub**: `github.com/tylerbvogel-max/fantasy-trading` (private)
