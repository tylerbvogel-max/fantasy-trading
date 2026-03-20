# How to Play — Bounty Hunter

## The Basics

Bounty Hunter is a stock prediction game. Every hour during market hours, a new **prediction window** opens with a set of stocks. You swipe to predict whether each stock will go **UP** or **DOWN** by the end of the hour, or **HOLD** if you think it'll stay flat.

Get it right and you earn **Double Dollars ($$)**. Get it wrong and you lose them. The higher your **wanted level**, the bigger the stakes.

---

## Prediction Windows

- Each window lasts **1 hour** during US market hours
- Stocks are the **top 25 by weekly volume**, pulled from Yahoo Finance trending data
- Stocks are batched into **groups of 5** per round (5 rounds per cycle through the pool)
- All players see the same stocks in the same order
- You have until the **prediction cutoff** to submit your picks
- After the window closes, results are settled automatically

---

## Making Picks

For each stock in a window, you choose:

1. **Direction**: UP, DOWN, or HOLD
2. **Bet amount**: $0–$100 on a slider (maps to confidence tiers)
3. **Leverage**: 1.0x–5.0x on a slider (amplifies wins AND losses)

You can also **skip** a stock (costs Double Dollars).

### Confidence Tiers

Your bet amount maps to a confidence tier that determines base scoring:

| Bet Range | Tier | Label |
|-----------|------|-------|
| $0–$33 | 1 | Draw |
| $34–$66 | 2 | Quick Draw |
| $67–$100 | 3 | Dead Eye |

Higher tiers win more but also lose more.

### Base Scoring (Directional: UP/DOWN)

| Tier | Win | Lose |
|------|-----|------|
| Draw | +13 | -11 |
| Quick Draw | +31 | -28 |
| Dead Eye | +57 | -70 |

### Base Scoring (HOLD)

| Tier | Win | Lose |
|------|-----|------|
| Draw | +8 | -6 |
| Quick Draw | +19 | -15 |
| Dead Eye | +35 | -30 |

### HOLD Predictions

A stock is considered "flat" (HOLD wins) if its price change stays within a dynamic threshold based on recent volatility. HOLD has lower risk/reward than directional picks.

---

## Wanted Level

Your wanted level is the core progression mechanic. It acts as a **multiplier** on all scoring:

| Level | Multiplier |
|-------|------------|
| 1 | 1x |
| 2 | 2x |
| 3 | 4x |
| 4 | 8x |
| 5 | 18x |
| 6 | 42x |
| 7 | 100x |
| 8 | 230x |
| 9 | 530x |
| 10 | 1,200x |

Levels above 10 use exponential scaling (2.3x per level).

### How Wanted Level Changes

Your wanted level is driven by **notoriety**, which accumulates each round:

- **Correct picks** add notoriety (scaled by confidence tier)
- **Wrong picks** subtract notoriety
- When round notoriety reaches **+3.0**: wanted level **goes up**
- When round notoriety reaches **-2.0**: wanted level **goes down**

### Win/Loss Formula

```
Win:  base_win × leverage × wanted_multiplier
Loss: base_lose × leverage
```

Wins scale with your wanted multiplier. Losses do not — but leverage amplifies both.

---

## Leverage

Leverage amplifies your picks from 1.0x to 5.0x. It's a risk/reward slider alongside your bet slider.

### How It Works

- **Wins**: `base × leverage × wanted_multiplier`
- **Losses**: `base × leverage`
- **HOLD hedge**: HOLD halves effective leverage — `1 + (leverage - 1) × 0.5`
  - Example: 3.0x leverage on HOLD = 2.0x effective

### Leverage Ceiling

Your maximum available leverage is gated by wanted level:

| Wanted Level | Max Leverage |
|--------------|-------------|
| 1–2 | 2.0x |
| 3–4 | 3.0x |
| 5–6 | 4.0x |
| 7+ | 5.0x |

### Carry Cost

Using leverage costs a small fee on submission:

```
carry_cost = round((leverage - 1.0) × 10) DD
```

Example: 3.0x leverage costs $$20 on submission.

### Margin Call

On a **loss** with leverage above 2.0x, there's a chance of a **margin call**:

| Leverage | Margin Call Chance |
|----------|-------------------|
| 1.0x–2.0x | 0% |
| 2.5x–3.5x | 5%–15% |
| 4.0x–5.0x | 15%–30% |

If margin call triggers:
- **-$$200** penalty
- **Wanted level drops by 1**
- **Locked to 1.0x leverage** for the next prediction (cooldown)

Margin calls **cannot** trigger on HOLD predictions or when insurance saves you.

### Notoriety Bonus

Correct picks at 3.0x+ leverage earn **+0.5 bonus notoriety**.

---

## Between Rounds

After completing all picks in a round, you'll sometimes see a **transition screen** — either a famous finance quote or a **chart pattern tip** teaching you candlestick and line chart patterns (e.g. "Three White Soldiers", "Cup and Handle"). Tap anywhere to skip it and move to the next round.

---

## Ante

Each prediction window costs an **ante** to enter: **$$75** base.

Some irons can reduce the ante cost.

---

## Skipping

You can skip a stock instead of predicting on it. Skip cost scales with your balance and how many times you've skipped in the current window:

```
skip_cost = ceil(25 × 2.5^(n-1) × max(1, balance / 5000))
```

Where `n` is the skip number (1st skip, 2nd skip, etc.).

---

## Irons (Equipment)

Irons are collectible gear items that modify your gameplay. You equip them in your **revolver** — a 6-slot hex chamber.

### Rarity Tiers

| Rarity | Count | Color |
|--------|-------|-------|
| Common | 28 | Gray |
| Uncommon | 22 | Teal |
| Rare | 15 | Yellow |
| Legendary | 10 | Orange |

### Chambers

You start with **1 chamber slot** and unlock more as your wanted level rises:

| Wanted Level | Chambers |
|--------------|----------|
| 1 | 1 |
| 3 | 2 |
| 5 | 3 |
| 7 | 4 |
| 9 | 5 |
| 10 | 6 |

### Iron Offerings

After certain events, you receive an **iron offering** — a choice of irons to pick from. The pool is weighted by rarity.

### Boosted Iron

The iron at the **top of your revolver** (12 o'clock position) is **boosted** — it gets enhanced effects. Spin the revolver to choose which iron gets the boost.

### Example Irons

- **Steady Hand** (Common): +3 Draw wins
- **Ghost Rider** (Rare): 20% chance a miss becomes correct
- **Golden Revolver** (Rare): All scoring x1.5
- **The Peacemaker** (Legendary): All picks use Dead Eye win values

---

## Busting

If your Double Dollars drop to **$$0 or below**, you're **busted**. Your run ends and stats reset.

Some irons can prevent busting:
- **Saloon Door**: First bust per run — survive with $$500
- **Phoenix Feather**: On bust — revive at $$1,000

---

## Resetting

You can **reset** your run at any time for free. This:
- Resets your Double Dollars to $$5,000
- Resets your wanted level to 1
- Clears your equipped irons
- Clears your margin call cooldown

Reset is always free — the cost is the lost opportunity of your current run's progress.

---

## Iron Tier Gating

Not all irons are available from the start. Higher-rarity irons unlock at higher wanted levels:

| Rarity | Min. Wanted Level |
|--------|-------------------|
| Common | 1+ (always) |
| Uncommon | 3+ |
| Rare | 6+ |
| Legendary | 8+ |

Locked tiers won't appear in iron offerings until you reach the required level. Pushing to higher levels gives you access to more powerful irons.

---

## Iron Synergy Combos

Equipping specific combinations of 3 irons activates a **synergy combo** with a bonus effect. These are like portfolio construction — the right combination creates alpha beyond individual assets.

**Examples:**
- **Dead Man's Arsenal** (Double Barrel + Gatling Gun + Tombstone Ace) → Dead Eye effects doubled
- **The Vault** (Gold Tooth + Platinum Tooth + El Dorado) → +50% to flat cash bonuses
- **Iron Curtain** (Thick Skin + Chaps + Campfire) → All losses capped at 50% base

12 combos total — experiment with combinations to discover them.

---

## Run Score

Your performance is measured by **Run Score** — a composite metric like a Sharpe ratio for predictions:

`Run Score = Peak DD × (1 + level × 0.1) × (0.5 + accuracy × 0.5) × completion_bonus`

Run Score rewards sustained, high-accuracy play at high wanted levels. The **all-time leaderboard** ranks by best Run Score.

---

## Run History

Every completed run (bust or reset) is archived with its Run Score, peak DD, peak wanted level, and accuracy. View your run history to track improvement over time.

---

## Badges (16 total)

Permanent achievements earned across runs in 4 categories:

**Wanted Level:** Drifter (Lv.3), Desperado (Lv.5), Most Wanted (Lv.8), Legendary Outlaw (Lv.10)

**Accuracy:** Sharpshooter (10 correct streak), Quick on the Draw (5 QD streak), Dead Eye Legend (3 DE streak)

**Economy:** High Roller (25k DD), Tycoon (100k DD), Millionaire (1M DD)

**Special:** No Mercy (5 rounds zero skips), Iron Man (6 chambers full), Holster King (10 HOLD wins/run), The Ghost (3 Ghost Rider triggers/run), Comeback Kid (sub-500 to 10k+ DD), Streak Master (30-day streak)

---

## Titles

7 cosmetic prefixes displayed on the leaderboard, unlocked via cross-run milestones:

Drifter (default) → Gunslinger → Sharpshooter → Outlaw → Bounty King → Sheriff → Legend

Each title has specific requirements (badges, run count, lifetime DD). Equip your title from the profile screen.

---

## Daily Streaks

Predict on at least 1 stock per calendar day (ET) to maintain your streak. Escalating rewards:

| Day | Reward |
|-----|--------|
| 3 | Bonus iron offering |
| 5 | +$$500 |
| 7 | Guaranteed uncommon+ offering |
| 14 | +$$2,000 |
| 30 | "Streak Master" badge + guaranteed rare offering |

At streak 7+, you earn a **streak shield** that forgives one missed day. The shield re-earns at the next 7+ milestone.

---

## Key Strategy Concepts

1. **Wanted level is everything** — the exponential multiplier means a correct pick at level 7 is worth 100x what it's worth at level 1
2. **Leverage is dangerous** — it amplifies losses AND can trigger margin calls that drop your wanted level
3. **HOLD is a hedge** — lower risk, lower reward, and halves leverage impact
4. **Iron synergies matter** — the right combination of irons at the boosted slot can dramatically change your scoring
5. **Know when to be conservative** — Dead Eye (tier 3) loses more than it wins on base scoring. You need wanted level multipliers to make it profitable
6. **Skip strategically** — sometimes paying to skip is better than risking a loss that could drop your wanted level
7. **Build toward iron combos** — 3-iron synergy combos grant powerful bonus effects
8. **Chase badges for titles** — badges unlock titles which unlock bragging rights on the leaderboard
9. **Maintain your streak** — daily consistency earns escalating rewards and the Streak Master badge
10. **Watch the post-settlement analysis** — learn why stocks moved and where your edge is
