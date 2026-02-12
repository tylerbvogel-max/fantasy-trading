# Time Attack Mode — Design Doc

## Overview
A prediction-based mini-game where players predict whether SPY will go up or down over 2-hour windows. Designed for high engagement, daily habit formation, and cross-selling into education modules. Entirely separate game mode from league/arena/classroom seasons.

Currency: **Double Dollars ($$)** — inspired by Trigun's bounty economy.

---

## Theme & Flavor: Sci-Fi Western

Time Attack has its own personality layered on top of the app's retro 80s aesthetic. The core metaphor: you're a bounty hunter chasing predictions for double dollars.

| Game Concept | Time Attack Name |
|---|---|
| Currency | Double Dollars ($$) |
| Prediction windows | Bounties |
| Streak count | Wanted Level |
| Confidence 1x | Draw |
| Confidence 2x | Quick Draw |
| Confidence 3x | Dead Eye |
| Streak shield | Last Stand |
| Daily recap (9 PM) | Sunset Report |
| Leaderboard | The Bounty Board |
| #1 on weekly board | Most Wanted |
| Perfect day (6/6) | Ace Gunslinger (badge) |

---

## Core Mechanic
- Every 2 hours during trading hours, a new bounty is posted
- Players receive a push notification
- They see a chart (1-minute candles) for SPY
- Swipe right/up = price goes up, swipe left/down = price goes down
- Result is revealed at the next bounty window

## Schedule
Fixed 2-hour bounty windows during extended beta trading hours (9:30 AM - 9:00 PM ET):

| Bounty | Time (ET) | Context |
|--------|-----------|---------|
| 1 | 10:00 AM | Morning — post-open volatility |
| 2 | 12:00 PM | Midday — lunch break engagement |
| 3 | 2:00 PM | Afternoon — market momentum |
| 4 | 4:00 PM | Close — regular market close drama |
| 5 | 6:00 PM | Evening — after-work wind-down |
| 6 | 8:00 PM | Night — casual couch check |

~6 bounties per day. Fixed times (not rolling) so players can build habits around them.

## User Flow
1. Push notification: "A new bounty just posted. 72% of gunslingers are betting UP. What's your call?"
2. Open app → immediately see result of last pick (dopamine hit first)
3. New chart appears for current bounty
4. Player chooses confidence: Draw (1x), Quick Draw (2x), or Dead Eye (3x)
5. Player swipes up (green) or down (red/pink)
6. Confirmation: "Locked in! Bounty closes at [next window time]"
7. Post-swipe: possibly show education prompt (see Education Integration below)
8. Close app, wait for next bounty
9. End of day — Sunset Report: "Today's haul: $$1,850. You went 4/6. Wanted Level: 3."

---

## Security Selection

### Initial Build: SPY Only
All players predict the same security (SPY / S&P 500) for every bounty.

**Why SPY only:**
- **Shared experience** — everyone has the same bounty, same result. "Did you get the 2 o'clock right?" only works if everyone is looking at the same thing (the Wordle effect)
- **No gaming** — allowing individual tickers would let players find low-volatility ETFs or predictable dividend plays to farm easy streaks, outside the spirit of the game
- **Minimal price data** — one symbol per window instead of hundreds. SPY is the most liquid security on earth, Finnhub will always have accurate pricing
- **Zero choice paralysis** — open app, swipe, done

### Future Expansion (if needed)
Could expand to a small set of index ETFs as a feature unlock:
- SPY (S&P 500)
- QQQ (NASDAQ)
- DIA (Dow Jones)
- IWM (Russell 2000)

Cap at 3-4 max. Individual stocks should never be added — it fragments the community and introduces gaming risk.

---

## Scoring System

### Base Double Dollars
Double dollars are earned or lost per bounty based on confidence tier:

| Confidence | Correct Pick | Wrong Pick |
|---|---|---|
| Draw (1x) | +$$100 | -$$50 |
| Quick Draw (2x) | +$$200 | -$$100 |
| Dead Eye (3x) | +$$300 | -$$150 |

### Wanted Level (Streak Multiplier)
Consecutive correct picks increase your Wanted Level, which multiplies earnings. A wrong pick resets your Wanted Level to 0.

| Wanted Level | Multiplier |
|---|---|
| 1 (first correct) | 1x |
| 2 in a row | 2x |
| 3 in a row | 3x |
| 4 in a row | 4x |
| 5 in a row | 5x |
| 6 in a row | 6x |

**Formula:** Earnings = (base $$ for confidence tier) x (Wanted Level)

Wrong picks always cost the flat penalty (Wanted Level does not multiply losses).

### Full Day Scoring Matrix

#### Perfect Day — All 6 Correct

| Bounty | Wanted Level | Draw (1x) | Quick Draw (2x) | Dead Eye (3x) |
|--------|-------------|-----------|-----------------|----------------|
| 1 | 1x | $$100 | $$200 | $$300 |
| 2 | 2x | $$200 | $$400 | $$600 |
| 3 | 3x | $$300 | $$600 | $$900 |
| 4 | 4x | $$400 | $$800 | $$1,200 |
| 5 | 5x | $$500 | $$1,000 | $$1,500 |
| 6 | 6x | $$600 | $$1,200 | $$1,800 |
| **Total** | | **$$2,100** | **$$4,200** | **$$6,300** |

#### Worst Day — All 6 Wrong

| Bounty | Wanted Level | Draw (1x) | Quick Draw (2x) | Dead Eye (3x) |
|--------|-------------|-----------|-----------------|----------------|
| 1 | reset | -$$50 | -$$100 | -$$150 |
| 2 | reset | -$$50 | -$$100 | -$$150 |
| 3 | reset | -$$50 | -$$100 | -$$150 |
| 4 | reset | -$$50 | -$$100 | -$$150 |
| 5 | reset | -$$50 | -$$100 | -$$150 |
| 6 | reset | -$$50 | -$$100 | -$$150 |
| **Total** | | **-$$300** | **-$$600** | **-$$900** |

#### Mixed Day — Correct Until Bounty 4, Then Wrong

| Bounty | Result | Wanted Level | Draw | Quick Draw | Dead Eye |
|--------|--------|-------------|------|------------|----------|
| 1 | Correct | 1x | $$100 | $$200 | $$300 |
| 2 | Correct | 2x | $$200 | $$400 | $$600 |
| 3 | Correct | 3x | $$300 | $$600 | $$900 |
| 4 | Wrong | reset | -$$50 | -$$100 | -$$150 |
| 5 | Correct | 1x | $$100 | $$200 | $$300 |
| 6 | Correct | 2x | $$200 | $$400 | $$600 |
| **Total** | | | **$$850** | **$$1,700** | **$$2,550** |

#### Alternating Day — Right, Wrong, Right, Wrong...

| Bounty | Result | Wanted Level | Draw | Quick Draw | Dead Eye |
|--------|--------|-------------|------|------------|----------|
| 1 | Correct | 1x | $$100 | $$200 | $$300 |
| 2 | Wrong | reset | -$$50 | -$$100 | -$$150 |
| 3 | Correct | 1x | $$100 | $$200 | $$300 |
| 4 | Wrong | reset | -$$50 | -$$100 | -$$150 |
| 5 | Correct | 1x | $$100 | $$200 | $$300 |
| 6 | Wrong | reset | -$$50 | -$$100 | -$$150 |
| **Total** | | | **$$150** | **$$300** | **$$450** |

#### Strategic Day — Mixed Confidence (Realistic Play)

| Bounty | Result | Confidence | Wanted Level | Earnings |
|--------|--------|-----------|-------------|----------|
| 1 | Correct | Draw (unsure) | 1x | $$100 |
| 2 | Correct | Quick Draw (feeling it) | 2x | $$400 |
| 3 | Correct | Dead Eye (on a roll) | 3x | $$900 |
| 4 | Wrong | Draw (hedged) | reset | -$$50 |
| 5 | Correct | Draw (cautious) | 1x | $$100 |
| 6 | Correct | Quick Draw (building back) | 2x | $$400 |
| **Total** | | | | **$$1,850** |

### Key Takeaways from the Matrix
- **Perfect Dead Eye day ($$6,300) vs worst Dead Eye day (-$$900):** A $$7,200 swing. Dead Eye is high stakes.
- **Perfect Draw day ($$2,100) vs worst Draw day (-$$300):** Only a $$2,400 swing. Draw is consistent.
- **Wanted Level matters more than confidence:** A Wanted Level 6 Draw ($$600) beats a fresh Dead Eye ($$300). This rewards consistency over gambling.
- **Strategic confidence mixing ($$1,850)** is competitive with constant Quick Draw ($$1,700 in the mixed scenario) — rewarding players who read the market and adjust.
- **Losses are capped:** The worst possible day (-$$900) is only ~14% of the best possible day ($$6,300). Players can never lose catastrophically.

### Score Storage
Double dollars are tracked as a standalone Time Attack score, separate from season portfolios. No cash injection into seasons — Time Attack is its own game mode with its own economy. Score persists and accumulates over time for Bounty Board ranking.

---

## Last Stand (Streak Shield — Under Review)

The Last Stand concept: at Wanted Level 5+, player earns a one-time shield that protects their Wanted Level on the next wrong pick (they still lose the flat $$ penalty, but the Wanted Level doesn't reset).

**How it would interact with scoring:**

Without Last Stand — Wanted Level 5, wrong pick at Quick Draw:
- Earnings: -$$100, Wanted Level resets to 0
- Next correct pick starts at Wanted Level 1 again

With Last Stand — Wanted Level 5, wrong pick at Quick Draw:
- Earnings: -$$100 (penalty still applies)
- Last Stand consumed, Wanted Level stays at 5
- Next correct pick earns at Wanted Level 6

**Impact:** Last Stand's value scales with Wanted Level. At level 5, it preserves a 5x multiplier that would otherwise reset to 1x. This means the next correct Dead Eye pick would earn $$1,800 instead of $$300 — a $$1,500 difference. This is powerful and may need balancing.

**Decision:** Revisit after playtesting the base scoring system. Last Stand may be more appropriate as a rare reward or monetization feature than an automatic earn.

---

## The Bounty Board (Leaderboard)

Entirely separate from league/arena/classroom leaderboards. Different game mode, different architecture.

- **Weekly Bounty Board:** Resets every Monday. Total $$ earned that week. #1 each week earns the **"Most Wanted"** title.
- **All-Time Bounty Board:** Cumulative $$ since player started Time Attack.
- **Accuracy ranking:** Win rate percentage (minimum 20 bounties to qualify).
- **Badge system:**
  - **"Sharp Eye"** — 70%+ accuracy over 50 bounties
  - **"Hot Streak"** — Wanted Level 10 (10 correct in a row)
  - **"Ace Gunslinger"** — Perfect day, 6/6 bounties

---

## Notification Loop (Key Engagement Driver)

### Bounty Alert
- Sent at each 2-hour window
- "A new bounty just posted. 72% of gunslingers are betting UP. What's your call?"
- Creates urgency (am I contrarian or going with the crowd?) and makes player feel part of something bigger

### Sunset Report (9 PM ET)
- "Today's haul: $$1,850. You went 4/6. Wanted Level: 3."
- Closes the loop so the day feels complete
- Teases tomorrow: "Can I keep this Wanted Level going?" is the thought they go to bed with

### Missed Bounty Handling
- If a player misses a bounty window, skip it — no penalty, no Wanted Level break
- Rationale: punishing absence causes players who miss one window to give up on the rest of the day
- Forgiving missed bounties keeps the notification loop alive — a player who misses 10 AM can still jump in at noon

### Re-Engagement for Lapsed Players
For players who drop out for 2+ days due to real-life circumstances:

- **"Welcome Back" Boost:** First correct pick after 2+ days of inactivity starts at Wanted Level 2 instead of 1. Lowers the barrier to return — they don't feel like they're starting from zero.
- **Weekly Digest (even if inactive):** A single push every Sunday evening: "SPY moved +2.3% this week. 61% of gunslingers predicted correctly. The bounty board is waiting." Low pressure, no guilt, keeps the app in mind.
- **Decay, Not Delete:** Never wipe historical stats or Bounty Board position while away. When they come back, they see "You're #7 on the board" — that's motivation to climb, not discouragement. Weekly board resets naturally on Monday, so returning on any Monday feels like a fresh start.
- **Notification Tapering:** If a player hasn't engaged in 3+ days, reduce bounty alerts to once per day (the best window — typically noon or 4 PM). Prevents notification fatigue that leads to app deletion. If no engagement after 7 days, stop bounty alerts entirely and only send the weekly digest.

---

## Education Integration

### Reward Connection
Correct predictions and Wanted Level milestones increase the probability of receiving a learning prompt. The education modules are the primary cross-sell from Time Attack — not cash or trading perks.

### Post-Swipe Quiz Prompt
After a player locks in their prediction (step 6 above), optionally show a prompt to take a quick quiz. Framing: "Sharpen your edge, gunslinger?" or "Quick challenge?" — always dismissible.

### Timing Rules
- **Show after swipe** (waiting for result) — this is dead time, perfect for engagement
- **Never show before result** — players came back to see their bounty, don't gate it
- **Never show twice in a row** — prevents fatigue

### Context-Aware Topic Mapping
Tie the quiz topic to the player's current state:

| Prediction Context | Relevant Quiz Topics |
|---|---|
| General SPY prediction | Market Fundamentals, Diversification |
| Player picked "down" | Risk Management, Bear Markets |
| Player is on a Wanted Level streak | Trading Psychology, Behavioral Finance |
| Player just lost their Wanted Level | Loss Aversion, Emotional Trading |

Implementation: a config lookup table of `prediction_context -> [eligible_topic_ids]`, then pick one at random from the eligible list.

### Randomizer for Prompt Frequency
Simple probability check, not a complex algorithm:

- Base chance: 40% show a prompt
- Boost to 60% if no quiz completed in 24+ hours
- Drop to 20% if quiz completed in current session
- Never show twice in a row

Intermittent reinforcement (same psychology as slot machines) — unpredictability increases engagement when the prompt does appear.

---

## Daily Call (Companion Feature)
A simpler, once-per-day prediction alongside Time Attack:

- Predict SPY up or down for the full trading day (open to close)
- Free for everyone, low stakes
- Social sharing hook: "Did you pick up or down today?"
- Serves as the "free drink" that gets you in the saloon; Time Attack is the table you sit down at

---

## Monetization Notes
- 6 touchpoints per day creates viable ad/engagement surface
- Confidence tiers create premium feature potential (e.g., unlock Dead Eye as premium)
- Last Stand — potential IAP item (under review, see Last Stand section)
- Daily Call (free) funnels into Time Attack (engagement driver)

---

## Technical Considerations (for later)
- Push notification infrastructure (Expo Notifications)
- Price data: only need SPY quotes at bounty window boundaries (minimal API load)
- New DB models: bounty records, Wanted Level, Last Stand, double dollar balance, Bounty Board
- Entirely separate from existing season/portfolio architecture — no shared models
- Quiz topic mapping table
- Social proof aggregation: track prediction distribution per bounty window
- Notification tapering logic for lapsed players

---

*Last updated: Feb 2026*
*Status: Design phase — not yet in development*
