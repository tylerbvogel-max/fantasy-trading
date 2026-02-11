# Fantasy Stock Trading

A competitive paper trading mobile app where players compete with virtual portfolios using real stock market data across themed seasons.

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
│   ├── alembic/          # Database migrations
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
6. **Join a season**: The app will show available seasons to join
7. **Start trading!**

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register with alias + invite code |
| POST | `/auth/login` | Login with alias + token |
| GET | `/auth/me` | Get current user profile |

### Seasons
| Method | Path | Description |
|--------|------|-------------|
| GET | `/seasons` | List all seasons |
| GET | `/seasons/{id}` | Season details |
| POST | `/seasons/{id}/join` | Join a season |
| GET | `/seasons/{id}/leaderboard` | Season standings |
| GET | `/seasons/{id}/stocks` | Available stocks for season |

### Trading
| Method | Path | Description |
|--------|------|-------------|
| POST | `/trade` | Execute a market order |
| POST | `/trade/validate` | Pre-validate a trade |
| GET | `/trade/history?season_id=X` | Transaction history |

### Portfolio
| Method | Path | Description |
|--------|------|-------------|
| GET | `/portfolio?season_id=X` | Current holdings + values |
| GET | `/portfolio/history?season_id=X` | Historical snapshots |

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
| GET | `/admin/invite-codes` | List all codes |
| POST | `/admin/seasons` | Create a new season |
| POST | `/admin/seasons/{id}/end` | End a season |
| POST | `/admin/stocks/refresh` | Force price refresh |

## Themed Seasons

Create themed seasons by specifying `allowed_stocks`:

```json
{
  "id": "SEASON_TECH_01",
  "name": "Tech Titans Q1 2026",
  "season_type": "tech_only",
  "allowed_stocks": ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AMD", "CRM", "ADBE"],
  "start_date": "2026-03-01T00:00:00Z",
  "starting_cash": 50000,
  "description": "Tech stocks only! Who knows Silicon Valley best?"
}
```

Season types: `open` (all stocks), `tech_only`, `mag7`, `micro_cap`, `custom`

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

The backend runs scheduled tasks automatically:

| Job | Schedule | What It Does |
|-----|----------|--------------|
| Price Refresh | Every 15 min (weekdays) | Updates stock prices from Finnhub |
| Price Refresh | Every hour (weekends) | Lower frequency off-market |
| Daily Snapshot | 4:30 PM ET daily | Captures portfolio values for charts |

## Phase 2 Roadmap

The schema includes placeholder tables for future features:
- **Player Interactions**: Forced Sale, Forced Trade, Asset Swap, Portfolio Peek
- **Formal Auth**: JWT + OAuth (Google, Apple)
- **Push Notifications**: Trade confirmations, interaction alerts
- **Character Classes**: Investor archetypes with unique perks
- **Profile Titles/Ranks**: Knowledge score thresholds unlock titles displayed on profile (Rookie → Analyst → Trader → Fund Manager → Oracle)
- **Leaderboard Badges**: Visible knowledge tier icon next to player names on the leaderboard, showing others you earned your rank through learning
- **Advanced Quiz Content**: Use SIE exam questions as inspiration for harder difficulty tiers (black diamond+). Reference: https://quizlet.com/826371084/comprehensive-sie-practice-exam-flash-cards/
