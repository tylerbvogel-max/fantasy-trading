# Bounty Hunter — Stock Prediction Game

## Project Overview
A mobile stock prediction game where players make directional picks (RISE/FALL/HOLD) on real stocks within 1-hour price windows. Players earn Double Dollars, climb wanted levels with exponential multipliers, collect Irons (gear) that modify gameplay, and use leverage to amplify outcomes. Western outlaw theme throughout.

## Architecture
- **Backend**: Python FastAPI + PostgreSQL + SQLAlchemy async ORM (in `/backend`)
- **Mobile**: React Native with Expo Go (in `/mobile`)
- **Stock Data**: Finnhub free tier API (prices) + Yahoo Finance v8 API (OHLC chart candles, trending stocks)
- **Auth**: Lightweight invite-code system with JWT tokens stored in SecureStore
- **Deployment**: Backend on Render (`render.yaml`), mobile via Expo Go on physical device

## Current State

### Backend (`backend/`)
- **Models** (`app/models/`): User, StockActive, StockMaster, InviteCode, BountyWindow, BountyWindowStock, BountyPrediction, BountyPlayerStats, BountyPlayerIron, BountyIronOffering, SpyPriceLog
- **Routers** (`app/routers/`): auth, stocks, admin, bounty
- **Services** (`app/services/`):
  - `bounty_service.py` (~1340 lines) — Core game logic: window creation, prediction submission, settlement, scoring with Iron effects, chart data fetching, hot stocks pool
  - `bounty_config.py` (~710 lines) — All tunable constants: scoring tables, wanted level multipliers, 75 Iron definitions with boost variants, leverage/margin config
  - `finnhub_service.py` — Stock price fetching (Finnhub), trending stock rankings (Yahoo most-actives), auto-creation of StockActive rows from StockMaster
  - `auth_service.py` — JWT token management, invite code validation
- **Scheduler** (`app/jobs/scheduler.py`): APScheduler running:
  - Price refresh every 15 min (Mon-Fri)
  - Trending stocks refresh daily at 10:00 AM ET
  - Bounty window creation at 8:50 AM ET
  - Window settlement at :01 past each window close hour
- **Seed**: `python -m app.seed` creates 50 stocks, 10 invite codes, admin account

### Mobile (`mobile/`)

**5 tabs** (order: Stats, Irons, **Bounty** (center, prominent), Board, Profile):

- **BountyHunterScreen** (~1780 lines) — Main game screen. Tinder-style swipe cards for stock predictions. Each card shows a stock with its probability cone chart. Swipe right = RISE, left = FALL, down = HOLD, up = SKIP. Features:
  - Round-based batching: 25 trending stocks served in groups of 5 per round
  - Confidence selection (Draw/Quick Draw/Dead Eye) via revolver cylinder UI
  - Leverage slider (1x-5x, unlocked by wanted level)
  - Quote/tip transition screens between rounds (~50% chance)
  - Animated card overlays showing pick direction
  - Progress indicator: "Round X/30 - Card Y/5"

- **BountyStatsScreen** — Detailed stats: accuracy by confidence, time slot, ticker. Weekly trends, wanted level progress bar.

- **IronCollectionScreen** — Iron (gear) collection browser. Shows all 75 Irons with equipped status, rarity tiers, effect descriptions.

- **BountyBoardScreen** — Leaderboard with weekly/all-time toggle.

- **ProfileScreen** — User info, settings toggles (Light Cards, Candle Charts), sign out, reset progress.

- **WalkthroughScreen** — First-time onboarding flow.

- **AuthScreen** — Register with invite code or login with existing credentials.

**Components** (`src/components/`):
- `ProbabilityConeChart` — SVG chart (react-native-svg) showing stock price history with sigma bands and RISE/HOLD/FALL probability zones. Supports both line chart and OHLC candlestick rendering modes. Synthesizes OHLC data from close-only when backend hasn't deployed OHLC yet.
- `QuoteTransition` — Full-screen overlay between rounds. Randomly shows either a finance quote (35 quotes from famous investors) or a chart pattern tip (86 patterns: 46 candlestick + 40 line chart). Slides in from right, holds 5 seconds, slides out left. Tap to skip.
- `RevolverCylinder` — Animated revolver cylinder for confidence selection.
- `HexIronBar` — Hexagonal iron display in the equipped bar.
- `IronOfferingModal` — Modal for choosing between 3 offered Irons after window settlement.
- `SpyChart` — Legacy SPY-only chart (largely superseded by ProbabilityConeChart).
- `SwipeCard` — Card wrapper for the swipe interface.
- `PixelFire` — Animated pixel flame particle effect (currently unused, was removed from cards).

**Contexts** (`src/contexts/`):
- `CardThemeContext` — Persists light/dark card theme and candle chart toggle via SecureStore
- `AudioContext` — Sound effect management
- `WalkthroughContext` — First-time walkthrough state

**Data** (`src/data/`):
- `financeQuotes.ts` — 35 finance quotes with attributions
- `chartPatterns.ts` — 86 chart patterns (candlestick and line) with name, signal (bullish/bearish/neutral), type, and indication text

**API Layer**:
- `src/api/client.ts` — Typed API client with all request functions and TypeScript interfaces. Auto-signs out on 401. Base URL from `app.json` extra config, defaults to Render deployment.
- `src/hooks/useApi.ts` — React Query wrappers (`useBountyStatus`, `useSubmitPrediction`, `useBountySkip`, `useBountyBoard`, etc.) with 30-second auto-refresh on bounty status.

### Simulation (`tools/bounty-sim/`)
- `config.mjs` — All tunable constants mirroring `bounty_config.py` (scoring tables, wanted levels, 25-stock pool, 5-stock batches)
- `irons.mjs` — 75 Iron definitions with effect calculations
- `sim.mjs` — Population-scale Monte Carlo simulation. CLI mode or web dashboard at `localhost:8080`. Used for balance testing.

### Docs (`docs/`)
- `how-to-play.md` — Player-facing rules (part of North Star cohesion)
- `bounty-progression.md`, `iron-catalog.md` — Design reference
- `ideas-and-decisions.md` — Historical decision log

## North Star: Mechanic Cohesion

Every gameplay mechanic change MUST be reflected across all four pillars:

1. **UI** (`mobile/`) — the player-facing experience
2. **Backend** (`backend/`) — authoritative game logic and persistence
3. **Simulation** (`tools/bounty-sim/`) — population-scale balance testing
4. **How to Play** (`docs/how-to-play.md`) — player-readable rules document

If a mechanic exists in the backend but not the simulation, balance is untested. If it exists in the UI but not the rules doc, players can't learn it. All four must stay in sync.

## Core Game Mechanics

### Prediction Flow
1. Backend creates bounty windows on a rolling basis (currently 2-min for testing, 120-min for production)
2. Each window contains 25 stocks ordered by trending rank (from Yahoo most-actives)
3. Frontend batches these into groups of 5 for swipe rounds
4. Player swipes cards: RISE (right), FALL (left), HOLD (down), SKIP (up)
5. Each pick requires: direction, confidence (1-3), leverage (1x-5x)
6. Ante cost deducted on each pick. Skip costs escalate exponentially.
7. Window settles after end_time: actual stock price change compared to hold threshold
8. Scoring: base points from DIR_SCORING/HOL_SCORING tables x wanted_multiplier x leverage, modified by all equipped Iron effects

### Hold Threshold
Dynamic per-stock: computed from candle volatility using `Phi^-1(2/3) * sigma_window` to target ~1/3 probability per outcome (RISE/HOLD/FALL). Falls back to 0.05% when candle data unavailable.

### Wanted Level System
Levels 1-10+ with exponential multipliers (1x, 2x, 4x, 8x, 18x, 42x, 100x, 230x, 530x, 1200x). Notoriety system drives level changes: accumulate positive notoriety to level up, negative to level down. Each correct/incorrect pick contributes weighted notoriety based on confidence.

### Irons (75 total)
4 rarity tiers: Common (28), Uncommon (22), Rare (15), Legendary (10). Each has base effect + boosted variant. Players equip Irons in chamber slots (1-6, unlocked by wanted level milestones). Offered 3 choices after window settlement, weighted by rarity. Effects modify: scoring bonuses, accuracy, economy (income/ante), skip costs, special mechanics (ghost chance, insurance, revive).

### Leverage
1x-5x multiplier on picks. Higher leverage unlocked at higher wanted levels. Adds carry cost per pick, margin call risk (chance of penalty + wanted drop + cooldown), and HOLD leverage is halved. Rewards: proportionally amplified scoring.

### Chart Data
Yahoo Finance v8 API fetches 5-minute OHLC candles for 2-hour range. In-memory cache with 90-second TTL. Chart fetches parallelized with `asyncio.gather()`. Frontend can render as line chart or candlestick chart (user toggle in Profile). When OHLC data unavailable, synthesizes candle bodies/wicks from close prices.

## Key Technical Patterns

### Backend
- Async everywhere: `AsyncSession`, `httpx.AsyncClient`, `asyncio.gather`
- In-memory chart cache (`_chart_cache` dict with TTL) avoids hammering Yahoo
- `get_hot_stocks_pool()` queries StockActive by trending_rank, falls back to hardcoded `WINDOW_STOCKS` if < 10 trending
- Iron effect aggregation: loops over equipped irons, merges effects dict, applies during scoring
- Settlement logic handles: base scoring, iron modifiers, ghost chance, insurance, leverage, margin calls, notoriety updates, wanted level transitions, chamber unlocks, iron offering generation

### Frontend
- React Query for all API calls with automatic cache invalidation on mutations
- `Animated` API with `useNativeDriver: true` for card swipe physics (pan gesture + spring animations)
- Card rotation interpolated from translateX for tilt effect
- Probability cone chart uses `react-native-svg` (Line, Rect, Path, Defs/LinearGradient)
- All user preferences persisted via `expo-secure-store`
- App wrapped in providers: QueryClient > SafeArea > Walkthrough > Audio > CardTheme

### Tab Bar
Bounty tab is centered and prominent: 52px circle with animated color cycling through `[orange, accent, primary, green, yellow]` at 2 seconds per color. Skull icon. Other tabs use standard Ionicons.

## Database Schema
```
users ──→ bounty_player_stats (1:1, DD balance, wanted level, notoriety, chambers, bust state)
       ──→ bounty_player_irons (equipped gear, slot_number 1-6)

bounty_windows ──→ bounty_window_stocks (per-stock: open/close price, result, is_settled)
               ──→ bounty_predictions (per-player-per-stock: direction, confidence, leverage, payout, margin_call)

stocks_active — cached prices + trending_rank from Finnhub/Yahoo
stocks_master — full stock universe with sector/tier metadata
invite_codes — registration codes
spy_price_logs — rolling SPY prices for legacy chart
bounty_iron_offerings — pending Iron selection events (3 offered, 1 chosen)
```

## Important Files (by edit frequency)
- `backend/app/services/bounty_service.py` — Core game logic (most complex, most edited)
- `mobile/src/screens/BountyHunterScreen.tsx` — Main game screen (largest frontend file)
- `backend/app/services/bounty_config.py` — All tunable constants + 75 Iron definitions
- `mobile/src/components/ProbabilityConeChart.tsx` — Stock chart rendering (SVG)
- `mobile/src/api/client.ts` — API types and functions (must match backend responses)
- `mobile/src/hooks/useApi.ts` — React Query hooks
- `backend/app/services/finnhub_service.py` — Stock data fetching
- `backend/app/jobs/scheduler.py` — Background job scheduling
- `tools/bounty-sim/config.mjs` + `irons.mjs` + `sim.mjs` — Simulation suite

## Environment
- Development on a Chromebook with Linux (Crostini)
- Mobile testing via Expo Go on iPhone (no dev client — limits native module usage like Skia)
- Backend deployed to Render (auto-deploy from git push)
- Finnhub API key in `.env` (not committed)
- TypeScript check: `cd mobile && npx tsc --noEmit`

## Commands
```bash
# Backend
cd backend && source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Mobile
cd mobile && npx expo start
# Scan QR code with iPhone camera for Expo Go

# Seed database (first time)
cd backend && python -m app.seed

# Force price refresh
curl -X POST http://localhost:8000/admin/stocks/refresh -H "Authorization: Bearer ADMIN_TOKEN"

# Deploy backend (auto on push, or manual)
git push  # Render auto-deploys from main

# Simulation dashboard
node tools/bounty-sim/sim.mjs --serve  # http://localhost:8080

# TypeScript check
cd mobile && npx tsc --noEmit
```

## Style & Patterns
- **Theme**: Pure black background (#000000), dark card (#1A1A1A), retro 80s palette
- **Colors**: orange (#FA8057), pink accent (#ED2EA5), purple primary (#6172C5), green (#38A169), yellow (#FAD009)
- **Font**: Space Grotesk (Light through Bold weights)
- **Design tokens** in `src/utils/theme.ts`: Colors, LightCardColors, Spacing, FontFamily, FontSize, Radius
- All API calls go through React Query hooks for caching and auto-refresh
- Tyler prefers step-by-step implementation with testing between steps
- Tyler values engagement features (quotes, tips, visual polish) alongside core mechanics

## Known Technical Constraints
- **Expo Go only**: No native modules (e.g., react-native-skia). All animations use React Native's `Animated` API.
- **Animated.View limits**: ~500-600 compositor layers before frame drops on mobile. Particle effects (PixelFire) were removed from cards for this reason.
- **Yahoo Finance rate limits**: Chart cache (90s TTL) + parallel fetches mitigate this. Cold cache for 25 stocks takes ~2-3s.
- **Window duration**: Currently set to 2 minutes for rapid testing (`WINDOW_DURATION_MINUTES = 2`). Production value is 120 minutes.
