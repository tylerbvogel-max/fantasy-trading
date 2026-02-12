# Time Attack Mode — Design Doc

## Overview
A prediction-based mini-game where players predict whether SPY will go up or down over 2-hour windows. Designed for high engagement, daily habit formation, and cross-selling into education modules. Entirely separate game mode from league/arena/classroom seasons.

---

## Core Mechanic
- Every 2 hours during trading hours, players receive a push notification
- They see a chart (1-minute candles) for SPY
- Swipe right/up = price goes up, swipe left/down = price goes down
- Result is revealed at the next window

## Schedule
Fixed 2-hour windows during extended beta trading hours (9:30 AM - 9:00 PM ET):

| Window | Time (ET) | Context |
|--------|-----------|---------|
| 1 | 10:00 AM | Morning — post-open volatility |
| 2 | 12:00 PM | Midday — lunch break engagement |
| 3 | 2:00 PM | Afternoon — market momentum |
| 4 | 4:00 PM | Close — regular market close drama |
| 5 | 6:00 PM | Evening — after-work wind-down |
| 6 | 8:00 PM | Night — casual couch check |

~6 predictions per day. Fixed times (not rolling) so users can build habits around them.

## User Flow
1. Push notification: "Time for your next prediction" + social proof ("72% of players predicted UP. What's your call?")
2. Open app → immediately see result of last pick (dopamine hit first)
3. New chart appears for current window
4. Player chooses confidence tier (1x, 2x, or 3x)
5. Player swipes up (green) or down (red/pink)
6. Confirmation: "Locked in! Result at [next window time]"
7. Post-swipe: possibly show education prompt (see Education Integration below)
8. Close app, wait for next notification
9. End of day (9 PM ET): daily recap notification — "You went 4/6 today. 67% accuracy. Streak: 3"

---

## Security Selection

### Initial Build: SPY Only
All players predict the same security (SPY / S&P 500) for every window.

**Why SPY only:**
- **Shared experience** — everyone has the same game, same result. "Did you get the 2 o'clock right?" only works if everyone is looking at the same thing (the Wordle effect)
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

### Base Points
Points are earned or lost per pick based on confidence tier:

| Confidence | Correct Pick | Wrong Pick |
|---|---|---|
| 1x (safe) | +100 | -50 |
| 2x (confident) | +200 | -100 |
| 3x (all-in) | +300 | -150 |

### Streak Multiplier
Consecutive correct picks multiply the base points. A wrong pick resets the streak to 0.

| Streak Length | Multiplier |
|---|---|
| 1 (first correct) | 1x |
| 2 in a row | 2x |
| 3 in a row | 3x |
| 4 in a row | 4x |
| 5 in a row | 5x |
| 6 in a row | 6x |

**Formula:** Points = (base points for confidence tier) x (streak multiplier)

Wrong picks always cost the flat penalty (no streak multiplier on losses).

### Full Day Scoring Matrix

#### Perfect Day — All 6 Correct

| Window | Streak | 1x Confidence | 2x Confidence | 3x Confidence |
|--------|--------|---------------|---------------|---------------|
| 1 | 1x | 100 | 200 | 300 |
| 2 | 2x | 200 | 400 | 600 |
| 3 | 3x | 300 | 600 | 900 |
| 4 | 4x | 400 | 800 | 1,200 |
| 5 | 5x | 500 | 1,000 | 1,500 |
| 6 | 6x | 600 | 1,200 | 1,800 |
| **Total** | | **2,100** | **4,200** | **6,300** |

#### Worst Day — All 6 Wrong

| Window | Streak | 1x Confidence | 2x Confidence | 3x Confidence |
|--------|--------|---------------|---------------|---------------|
| 1 | reset | -50 | -100 | -150 |
| 2 | reset | -50 | -100 | -150 |
| 3 | reset | -50 | -100 | -150 |
| 4 | reset | -50 | -100 | -150 |
| 5 | reset | -50 | -100 | -150 |
| 6 | reset | -50 | -100 | -150 |
| **Total** | | **-300** | **-600** | **-900** |

#### Mixed Day — Correct Until Window 4, Then Wrong

| Window | Result | Streak | 1x | 2x | 3x |
|--------|--------|--------|-----|-----|-----|
| 1 | Correct | 1x | 100 | 200 | 300 |
| 2 | Correct | 2x | 200 | 400 | 600 |
| 3 | Correct | 3x | 300 | 600 | 900 |
| 4 | Wrong | reset | -50 | -100 | -150 |
| 5 | Correct | 1x | 100 | 200 | 300 |
| 6 | Correct | 2x | 200 | 400 | 600 |
| **Total** | | | **850** | **1,700** | **2,550** |

#### Alternating Day — Right, Wrong, Right, Wrong...

| Window | Result | Streak | 1x | 2x | 3x |
|--------|--------|--------|-----|-----|-----|
| 1 | Correct | 1x | 100 | 200 | 300 |
| 2 | Wrong | reset | -50 | -100 | -150 |
| 3 | Correct | 1x | 100 | 200 | 300 |
| 4 | Wrong | reset | -50 | -100 | -150 |
| 5 | Correct | 1x | 100 | 200 | 300 |
| 6 | Wrong | reset | -50 | -100 | -150 |
| **Total** | | | **150** | **300** | **450** |

#### Strategic Day — Low Confidence When Unsure, High When Confident (realistic play)

| Window | Result | Confidence | Streak | Points |
|--------|--------|-----------|--------|--------|
| 1 | Correct | 1x (unsure) | 1x | 100 |
| 2 | Correct | 2x (feeling it) | 2x | 400 |
| 3 | Correct | 3x (on a roll) | 3x | 900 |
| 4 | Wrong | 1x (hedged) | reset | -50 |
| 5 | Correct | 1x (cautious) | 1x | 100 |
| 6 | Correct | 2x (building back) | 2x | 400 |
| **Total** | | | | **1,850** |

### Key Takeaways from the Matrix
- **Perfect 3x day (6,300) vs worst 3x day (-900):** A 7,200 point swing. High confidence is high stakes.
- **Perfect 1x day (2,100) vs worst 1x day (-300):** Only a 2,400 point swing. Safe play is consistent.
- **Streaks matter more than confidence:** A 6-streak at 1x (600 pts) beats a fresh pick at 3x (300 pts). This rewards consistency over gambling.
- **Strategic confidence mixing (1,850)** is competitive with constant 2x (1,700 in the mixed scenario) — rewarding players who read the market and adjust.
- **Losses are capped:** The worst possible day (-900) is only ~14% of the best possible day (6,300). Players can never lose catastrophically.

### Score Storage
Points are tracked as a standalone Time Attack score, separate from season portfolios. No cash injection into seasons — Time Attack is its own game mode with its own scoring. Score persists and accumulates over time for leaderboard ranking.

---

## Streak Shield (Under Review)

The streak shield concept: at 5+ streak, player earns a one-time shield that protects their streak multiplier on the next wrong pick (they still lose the flat penalty, but the multiplier doesn't reset).

**How it would interact with scoring:**

Without shield — 5-streak, wrong pick at 2x:
- Points: -100, streak resets to 0
- Next correct pick starts at 1x again

With shield — 5-streak, wrong pick at 2x:
- Points: -100 (penalty still applies)
- Shield consumed, streak stays at 5
- Next correct pick earns at 6x multiplier

**Impact:** The shield's value scales with streak length. At streak 5, the shield preserves a 5x multiplier that would otherwise reset to 1x. This means the next correct pick at 3x confidence would earn 1,800 instead of 300 — a 1,500 point difference. This is powerful and may need balancing.

**Decision:** Revisit after playtesting the base scoring system. The shield may be more appropriate as a rare reward or monetization feature than an automatic earn.

---

## Leaderboard

Entirely separate from league/arena/classroom leaderboards. Different game mode, different architecture.

- **Weekly leaderboard:** Resets every Monday. Total points earned that week.
- **All-time leaderboard:** Cumulative score since player started Time Attack.
- **Accuracy ranking:** Win rate percentage (minimum 20 picks to qualify).
- **Badge system:**
  - "Sharp Eye" — 70%+ accuracy over 50 picks
  - "Hot Streak" — 10 correct in a row
  - "Perfect Day" — 6/6 in one day

---

## Notification Loop (Key Engagement Driver)

### Prediction Window Push
- Sent at each 2-hour window
- Includes social proof: "72% of players predicted UP for this window. What's your call?"
- Creates urgency (am I contrarian or going with the crowd?) and makes player feel part of something bigger

### Daily Recap Push (9 PM ET)
- Summary of the day: "You went 4/6 today. 67% accuracy. Your streak is at 3."
- Closes the loop so the day feels complete
- Teases tomorrow: "Can I keep this streak going?" is the thought they go to bed with

### Missed Window Handling
- If a player misses a prediction window, skip it — no penalty, no streak break
- Rationale: punishing absence causes players who miss one window to give up on the rest of the day
- Forgiving missed windows keeps the notification loop alive — a player who misses 10 AM can still jump in at noon

### Re-Engagement for Lapsed Players
For players who drop out for 2+ days due to real-life circumstances:

- **"Welcome Back" Streak Starter:** First correct pick after 2+ days of inactivity starts at 2x streak multiplier instead of 1x. Lowers the barrier to return — they don't feel like they're starting from zero.
- **Weekly Digest (even if inactive):** A single push every Sunday evening: "SPY moved +2.3% this week. 61% of players predicted correctly. Your streak is waiting." Low pressure, no guilt, keeps the app in mind.
- **Decay, Not Delete:** Never wipe historical stats or leaderboard position while away. When they come back, they see "You're #7 on the weekly board" — that's motivation to climb, not discouragement. Weekly board resets naturally on Monday, so returning on any Monday feels like a fresh start.
- **Notification Tapering:** If a player hasn't engaged in 3+ days, reduce prediction window pushes to once per day (the best window — typically noon or 4 PM). Prevents notification fatigue that leads to app deletion. If no engagement after 7 days, stop prediction pushes entirely and only send the weekly digest.

---

## Education Integration

### Reward Connection
Correct predictions and streak milestones increase the probability of receiving a learning prompt. The education modules are the primary cross-sell from Time Attack — not cash or trading perks.

### Post-Swipe Quiz Prompt
After a player locks in their prediction (step 6 above), optionally show a prompt to take a quick quiz. Framing: "Sharpen your edge?" or "Quick challenge?" — always dismissible.

### Timing Rules
- **Show after swipe** (waiting for result) — this is dead time, perfect for engagement
- **Never show before result** — users came back to see their pick, don't gate it
- **Never show twice in a row** — prevents fatigue

### Context-Aware Topic Mapping
Tie the quiz topic to the player's current state:

| Prediction Context | Relevant Quiz Topics |
|---|---|
| General SPY prediction | Market Fundamentals, Diversification |
| Player picked "down" | Risk Management, Bear Markets |
| Player is on a streak | Trading Psychology, Behavioral Finance |
| Player just broke a streak | Loss Aversion, Emotional Trading |

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
- Serves as the "free drink" that gets users in the door; Time Attack is the table they sit down at

---

## Monetization Notes
- 6 touchpoints per day creates viable ad/engagement surface
- Confidence tiers create premium feature potential (e.g., unlock 3x tier)
- Streak shields — potential IAP item (under review, see Streak Shield section)
- Daily Call (free) funnels into Time Attack (engagement driver)

---

## Technical Considerations (for later)
- Push notification infrastructure (Expo Notifications)
- Price data: only need SPY quotes at window boundaries (minimal API load)
- New DB models: prediction records, streaks, shields, Time Attack score, Time Attack leaderboard
- Entirely separate from existing season/portfolio architecture — no shared models
- Quiz topic mapping table
- Social proof aggregation: track prediction distribution per window
- Notification tapering logic for lapsed players

---

*Last updated: Feb 2026*
*Status: Design phase — not yet in development*
