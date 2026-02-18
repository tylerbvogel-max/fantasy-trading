# Bounty Hunter

A stock prediction mobile game where players make directional picks on 1-hour price windows, earn Double Dollars, climb wanted levels, and collect Irons that modify gameplay.

## Project Structure

```
fantasy-trading/
├── backend/              # Python FastAPI backend
│   ├── app/
│   │   ├── main.py       # FastAPI entry point
│   │   ├── config.py     # Environment configuration
│   │   ├── database.py   # SQLAlchemy async setup
│   │   ├── seed.py       # Initial data seeder
│   │   ├── models/       # SQLAlchemy ORM models
│   │   ├── routers/      # API endpoint handlers
│   │   ├── services/     # Business logic layer
│   │   ├── schemas/      # Pydantic request/response models
│   │   └── jobs/         # Background task scheduler
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── mobile/               # React Native (Expo) app
│   ├── App.tsx           # Root component with auth + tab nav
│   ├── src/
│   │   ├── screens/      # Screen components
│   │   ├── api/          # API client
│   │   ├── hooks/        # React Query hooks
│   │   └── utils/        # Theme, helpers
│   ├── app.json
│   └── package.json
├── tools/
│   └── bounty-sim/       # Simulation dashboard for tuning game parameters
├── docs/                 # Design documents and references
└── README.md
```

## Quick Start

### Prerequisites

- Python 3.11+
- PostgreSQL 15+
- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- Expo Go app on your phone (for testing)

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Set up environment
cp .env.example .env
# Edit .env with your values:
#   DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/fantasy_trading
#   FINNHUB_API_KEY=your_key_here
#   SECRET_KEY=some-random-string

# Create the database
createdb fantasy_trading   # or use psql: CREATE DATABASE fantasy_trading;

# Run seed script (creates tables + initial data)
python -m app.seed

# ⚠️  SAVE the admin token and invite codes printed by the seed script!

# Start the server
uvicorn app.main:app --reload --port 8000
```

Visit http://localhost:8000/docs for the interactive API documentation (Swagger UI).

### 2. Mobile Setup

```bash
cd mobile

# Install dependencies
npm install

# Update API URL in src/api/client.ts
# Change API_BASE to your backend URL
# For local dev with Expo Go, use your machine's local IP:
#   const API_BASE = "http://192.168.1.XXX:8000";

# Start Expo
npx expo start
```

Scan the QR code with Expo Go on your phone.

### 3. First Steps After Setup

1. **Open Swagger UI** at http://localhost:8000/docs
2. **Test the admin token**: Click "Authorize" and paste `Bearer YOUR_ADMIN_TOKEN`
3. **Generate invite codes**: POST `/admin/invite-codes`
4. **Refresh stock prices**: POST `/admin/stocks/refresh` (first time populates prices from Finnhub)
5. **Register on mobile**: Open the app, enter an alias and one of the invite codes
6. **Start predicting!**

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register with alias + invite code |
| POST | `/auth/login` | Login with alias + token |
| GET | `/auth/me` | Get current user profile |

### Bounty
| Method | Path | Description |
|--------|------|-------------|
| GET | `/bounty/status` | Current window, picks, and player stats |
| POST | `/bounty/predict` | Submit a prediction (UP/DOWN/HOLD) |
| POST | `/bounty/skip` | Skip a stock (costs DD) |
| GET | `/bounty/board` | Leaderboard (weekly or all-time) |
| GET | `/bounty/history` | Past predictions |
| GET | `/bounty/stats` | Detailed player statistics |
| GET | `/bounty/irons` | Equipped Irons |
| GET | `/bounty/irons/offering` | Current Iron offering |
| POST | `/bounty/irons/pick` | Pick an Iron from offering |
| POST | `/bounty/reset` | Reset player stats |

### Stocks
| Method | Path | Description |
|--------|------|-------------|
| GET | `/stocks` | All stocks with prices |
| GET | `/stocks/search?q=apple` | Search by name or ticker |
| GET | `/stocks/{symbol}` | Single stock detail |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/invite-codes` | Generate invite codes |
| POST | `/admin/invite-codes/bulk` | Generate bulk invite codes |
| GET | `/admin/invite-codes` | List all codes |
| POST | `/admin/stocks/refresh` | Force price refresh |
| POST | `/admin/stocks/trending` | Refresh trending rankings |
| POST | `/admin/stocks/import` | Import stocks from Finnhub |

## Deployment

### Railway (Recommended)

1. Push to GitHub
2. Create new project on [railway.app](https://railway.app)
3. Add a PostgreSQL service
4. Add a new service from your GitHub repo, set root directory to `backend/`
5. Set environment variables: `DATABASE_URL`, `FINNHUB_API_KEY`, `SECRET_KEY`
6. Deploy — Railway auto-detects the Dockerfile

### Mobile Distribution

- **Development**: Expo Go app (scan QR code)
- **Beta Testing**: `npx eas build` for TestFlight (iOS) / APK (Android)
- **Production**: Full App Store / Play Store submission via EAS

## Background Jobs

| Job | Schedule | What It Does |
|-----|----------|--------------|
| Price Refresh | Every 15 min (weekdays) | Updates stock prices from Finnhub |
| Price Refresh | Every hour (weekends) | Lower frequency off-market |
| Trending Stocks | 10 AM ET (weekdays) | Updates trending rankings |
| Window Creation | 8:50 AM ET (weekdays) | Creates day's prediction windows |
| Window Settlement | End of each window | Scores predictions, updates stats |

## Simulation Dashboard

```bash
node tools/bounty-sim/sim.mjs --serve
# Opens at http://localhost:8080
```

Adjust all game parameters (scoring, wanted levels, Iron effects) and run Monte Carlo simulations to tune the economy.
