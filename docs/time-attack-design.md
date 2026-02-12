# Time Attack Mode — Design Doc

## Overview
A prediction-based mini-game where players predict whether SPY will go up or down over 2-hour windows. Designed for high engagement, daily habit formation, and cross-selling into education modules.

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
4. Player swipes up (green) or down (red/pink)
5. Optional: confidence tier selection (1x, 2x, 3x) before confirming
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

## Reward System

### Cash Injection (Primary)
- Correct pick earns bonus virtual cash added to season portfolio
- Base reward: ~$100 per correct pick
- Streak multiplier: 2 correct in a row = 2x, 3 = 3x, etc.
- Wrong pick resets streak and multiplier

### Risk/Reward Confidence Tiers
- Before confirming each swipe, player can choose: 1x, 2x, or 3x confidence
- Higher confidence = more points/cash if right, bigger penalty if wrong
- Adds strategy layer beyond binary up/down
- "I'm really sure about this one" vs "no idea, playing it safe"

### Streak Shield
- If a player has a 5+ streak, they earn a one-time "shield"
- Shield protects their streak multiplier on the next wrong pick (they still lose points for that pick, but the multiplier doesn't reset)
- Creates loss aversion: "I have a shield, I can't waste it, I need to keep playing"
- Natural monetization point later (buy extra shields via IAP)

### Standalone Leaderboard
- Separate "Prediction Accuracy" ranking
- Weekly/monthly win rate tracked
- Badge system:
  - "Sharp Eye" — 70%+ accuracy over 50 picks
  - "Hot Streak" — 10 correct in a row
  - "Perfect Day" — 6/6 in one day

### Trading Perks (Future)
- Streak of 5+ unlocks extended trading hours for that day
- Perfect day (6/6) unlocks a "free trade" that doesn't count toward trade limits

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

---

## Education Integration

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
- Streak shields — earn one at 5+ streak, buy extras via IAP
- Daily Call (free) funnels into Time Attack (engagement driver)

---

## Technical Considerations (for later)
- Push notification infrastructure (Expo Notifications)
- Price data: only need SPY quotes at window boundaries (minimal API load)
- New DB models: prediction records, streaks, shields, Time Attack leaderboard
- Separate from existing season/portfolio architecture
- Quiz topic mapping table
- Social proof aggregation: track prediction distribution per window

---

*Last updated: Feb 2026*
*Status: Design phase — not yet in development*
