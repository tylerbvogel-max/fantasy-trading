# Bounty Hunter Progression System

> Design philosophy: Never punish quitting. Make staying so rewarding the player thinks "just one more round." The cost of resetting is the lost opportunity, not a direct penalty. Inspired by Balatro's approach to roguelike incentive design.

## Overview

Four interlocking systems create reasons to keep a run alive:

1. **Run Badges** — permanent trophies earned by hitting milestones within a single run
2. **Iron Tiers** — the best irons only appear in offerings after you've reached higher wanted levels
3. **Run Score** — a composite leaderboard metric that rewards sustained play over short spikes
4. **Titles** — cosmetic name prefixes earned through patterns across multiple runs

Reset is always free. No cooldown, no cost. But every reset means giving up progress toward all four systems.

---

## 1. Run Badges

Permanent profile trophies earned during a single run. Once earned, they stay forever. Displayed on leaderboard entries and the player's profile.

### Wanted Level Badges (the core hook)

| Badge | Requirement | Icon Idea |
|---|---|---|
| **Drifter** | Reach Wanted Lv.3 | Boot spur |
| **Desperado** | Reach Wanted Lv.5 | Crossed pistols |
| **Most Wanted** | Reach Wanted Lv.8 | Wanted poster |
| **Legendary Outlaw** | Reach Wanted Lv.10 | Skull with hat |

These are the primary "just one more round" hook. A player at Lv.4 sees they're one level from Desperado and pushes forward instead of resetting.

### Accuracy Badges

| Badge | Requirement | Icon Idea |
|---|---|---|
| **Sharpshooter** | 10 correct in a row (any confidence) | Bullseye |
| **Quick on the Draw** | 5 Quick Draw correct in a row | Lightning bolt |
| **Dead Eye Legend** | 3 Dead Eye correct in a row | Crosshair |

### Economy Badges

| Badge | Requirement | Icon Idea |
|---|---|---|
| **High Roller** | Hold 25,000 DD at once | Stack of coins |
| **Tycoon** | Hold 100,000 DD at once | Gold bar |
| **Millionaire** | Hold 1,000,000 DD at once | Diamond |

These scale with wanted level multipliers — at Lv.7 (100x), big numbers become reachable. Resetting at Lv.1 means these are mathematically impossible.

### Special Condition Badges

| Badge | Requirement | Icon Idea |
|---|---|---|
| **No Mercy** | Complete 5 rounds with zero skips | Fist |
| **Iron Man** | Fill all 6 chamber slots | Shield |
| **Holster King** | Win 10 HOLD predictions in a single run | Holstered gun |
| **The Ghost** | Trigger Ghost Rider iron 3 times in one run | Ghost |
| **Comeback Kid** | Recover from below 500 DD to above 10,000 DD | Phoenix |

### Implementation Notes

- New DB model: `BountyBadge` — `user_id`, `badge_id` (string), `earned_at` (datetime), `run_context` (JSON: wanted level, DD, round number when earned)
- Badge checks run after each window settlement in `settle_window()`
- Badge definitions stored in `bounty_config.py` alongside iron defs
- Badge progress tracked in `BountyPlayerStats` via new JSON column `badge_progress` for multi-step badges (e.g. streak counters)
- API: `GET /bounty/badges` returns earned badges, `GET /bounty/badges/progress` returns in-progress badges with current/required counts

---

## 2. Iron Tiers

Currently all 15 irons can appear in any offering. This change gates the pool by current wanted level, creating a powerful incentive to stay alive.

### Tier Structure

| Tier | Wanted Level | Iron Pool |
|---|---|---|
| **Tier 1** | Lv.1+ (always) | 6 Common irons |
| **Tier 2** | Lv.3+ | + 5 Uncommon irons |
| **Tier 3** | Lv.6+ | + 4 Rare irons |

### Current Iron Inventory by Tier

**Tier 1 — Common (always available):**
- Steady Hand (+3 Draw wins)
- Thick Skin (-3 all losses)
- Lucky Horseshoe (5% insurance)
- Trail Rations (-$20 ante)
- Bandolier (-30% skip cost)
- Leather Holster (+4 holster wins)

**Tier 2 — Uncommon (Lv.3+):**
- Iron Sights (+5 Quick Draw wins)
- Snake Oil (Draw holster losses = 0)
- Deadeye Scope (10% Dead Eye insurance)
- Gold Tooth (+$50 flat per correct)
- Bounty Poster (+0.5 notoriety per correct)

**Tier 3 — Rare (Lv.6+):**
- Sheriff's Badge (+1 wins per wanted level)
- Double Barrel (Dead Eye wins 2x base)
- Ghost Rider (20% miss becomes correct)
- Golden Revolver (All scoring x1.5)

### The Incentive Loop

A player at Lv.5 with 2 common irons thinks: "One more level and I could roll Ghost Rider or Golden Revolver. My 100x multiplier combined with Golden Revolver's 1.5x would be insane." They stay.

A player who resets goes back to Lv.1 with only common irons available. They know from experience how much stronger rare irons are. The gap between "what I have" and "what I could have" drives retention.

### Implementation Notes

- Add `tier_min_level` field to each iron def in `bounty_config.py`: common = 1, uncommon = 3, rare = 6
- Modify offering roll in `settle_window()`: filter `IRON_DEFS` by `tier_min_level <= current_wanted_level`
- Show locked tiers in the iron offering UI: greyed-out "Uncommon irons unlock at Lv.3" text
- On the swipe screen, show a small "Lv.3: Uncommon irons" or "Lv.6: Rare irons" progress hint near the wanted level display

---

## 3. Run Score

A composite metric that replaces raw DD as the primary leaderboard ranking. Rewards sustained play and skilled decision-making over lucky short runs.

### Formula

```
Run Score = Peak DD × Level Bonus × Accuracy Bonus × Completion Bonus
```

**Components:**

| Factor | Calculation | Purpose |
|---|---|---|
| **Peak DD** | Highest DD balance achieved during the run | Core score — driven by multiplier scaling |
| **Level Bonus** | `1 + (peak_wanted_level × 0.1)` | Lv.5 = 1.5x, Lv.10 = 2.0x — rewards staying alive |
| **Accuracy Bonus** | `0.5 + (accuracy_pct × 0.5)` | 50% acc = 0.75x, 80% acc = 0.90x, 100% = 1.0x — rewards skill |
| **Completion Bonus** | 1.0 normally, 1.25 if run lasted 10+ rounds, 1.5 if 20+ rounds | Rewards endurance |

### Example Calculations

| Scenario | Peak DD | Level | Accuracy | Rounds | Run Score |
|---|---|---|---|---|---|
| Short hot streak | 15,000 | Lv.4 | 70% | 3 | 15,000 × 1.4 × 0.85 × 1.0 = **17,850** |
| Sustained grinder | 50,000 | Lv.7 | 65% | 15 | 50,000 × 1.7 × 0.825 × 1.25 = **87,656** |
| Perfect legend | 500,000 | Lv.10 | 80% | 25 | 500,000 × 2.0 × 0.9 × 1.5 = **1,350,000** |

The sustained player scores 5x the short streaker despite only 3x the peak DD. The system naturally rewards not resetting.

### Leaderboard Display

```
#1  Sheriff Wolverine    1,350,000 pts  ⭐🎯💎  Lv.10  80%
#2  Panda                   87,656 pts  🔫      Lv.7   65%
#3  NewPlayer               17,850 pts          Lv.4   70%
```

Each entry shows: rank, title, alias, run score, badge icons, peak wanted level, accuracy.

### Implementation Notes

- New columns on `BountyPlayerStats`: `peak_dd` (int), `peak_wanted_level` (int), `rounds_played` (int), `best_run_score` (int)
- Track `peak_dd` by updating on every DD gain: `stats.peak_dd = max(stats.peak_dd, stats.double_dollars)`
- Track `peak_wanted_level` same way
- Calculate run score on bust or reset: snapshot into `BountyRunHistory` table
- Leaderboard sorts by `best_run_score` (all-time best) or `current_run_score` (live)
- On reset, current run stats archive into `BountyRunHistory`, counters reset to zero

---

## 4. Titles

Cosmetic name prefixes displayed on the leaderboard. Earned through patterns across multiple runs, not single achievements. Titles represent mastery and commitment.

### Title Progression

| Title | Requirement | Flavor |
|---|---|---|
| **Drifter** | Default (everyone starts here) | Just passing through |
| **Gunslinger** | Complete 3 runs reaching Lv.5+ | Knows their way around |
| **Sharpshooter** | Maintain 65%+ accuracy across 5 runs (min 20 picks each) | Doesn't miss much |
| **Outlaw** | Earn the Desperado badge + accumulate 100,000 lifetime DD | Building a reputation |
| **Bounty King** | Reach Lv.8 in 3 different runs | Feared across the territory |
| **Sheriff** | Earn 5+ unique badges + best run score above 500,000 | The law in these parts |
| **Legend** | Earn the Legendary Outlaw badge + Sheriff title + 1M lifetime DD | They write songs about you |

### Title Rules

- Only one title active at a time (player picks which to display)
- Higher titles don't auto-replace — player might prefer "Sharpshooter" over "Outlaw" for style
- Title progress persists across resets (that's the point — resets don't hurt title progress, only the current run)
- Lifetime DD = total DD earned across all runs, not current balance

### Implementation Notes

- New DB model: `BountyTitle` — `user_id`, `title_id`, `unlocked_at`
- Lifetime stats in `BountyPlayerStats`: `lifetime_dd_earned` (int), `runs_completed` (int), `runs_reaching_lv5` (int), `runs_reaching_lv8` (int)
- These accumulate on every reset/bust — they never go down
- Active title stored as `active_title` (string) on `BountyPlayerStats`
- Title checks run on reset/bust (when a run ends)
- API: `GET /bounty/titles` returns unlocked titles, `POST /bounty/titles/equip` sets active

---

## How the Systems Interact

### The Player Journey

**New player (Run 1):**
- Starts at Lv.1, common irons only
- Learns the basics, gets to Lv.2-3
- Busts or resets. Earns nothing special. That's fine — they learned.

**Returning player (Runs 2-5):**
- Knows the system now, pushes to Lv.3 → uncommon irons unlock, gets excited
- Reaches Lv.5, earns Desperado badge. Sees "Most Wanted requires Lv.8" — new goal
- Gets to Lv.6, rare irons unlock → rolls Golden Revolver → massive scoring
- Busts at Lv.7 with 45,000 peak DD. Run score: ~50,000. Unlocks "Gunslinger" title.

**Veteran player (Runs 10+):**
- Consistently reaches Lv.6+, has multiple badges
- Working toward "Sheriff" title — needs 5 unique badges and 500K run score
- At Lv.8 with Ghost Rider + Golden Revolver + Sheriff's Badge, scoring is astronomical
- Peak DD hits 300,000. One more good round could break 500K for the Sheriff title.
- "Just one more round..."

### The Reset Decision

A player considering reset faces this calculus:

**What they keep:** lifetime DD progress, title progress, all badges earned
**What they lose:** current wanted level, current irons, current run score progress, iron tier access

The higher the wanted level, the more they lose by resetting. At Lv.6+ with rare irons, resetting means starting over with common irons at 1x multiplier. The opportunity cost is enormous.

But if they're at Lv.2 with bad irons and low DD, resetting is cheap. The system naturally makes resets expensive when you're doing well and cheap when you're doing poorly.

---

## UI Additions

### Profile / Stats Screen
- **Badges section:** Grid of earned badges (colored) and locked badges (greyed silhouettes with requirements)
- **Titles section:** List of unlocked titles with "Equip" button, locked titles with progress bars
- **Run History:** Last 10 runs with run score, peak level, accuracy, duration

### Leaderboard Enhancements
- Show active title before alias
- Show top 3 badge icons after alias
- Sort by run score instead of raw DD
- Tab toggle: "Current Run" vs "All-Time Best"

### Swipe Screen Hints
- Near wanted level: "Lv.3 → Uncommon Irons" or "Lv.6 → Rare Irons" progress text
- On level-up: brief celebration toast "Uncommon Irons Unlocked!" or "New Badge: Desperado!"

### Iron Offering Modal
- If below Lv.3: show a locked section "Uncommon irons unlock at Lv.3"
- If below Lv.6: show "Rare irons unlock at Lv.6"
- Creates visible aspiration even during common-only offerings

---

## Build Priority

1. **Iron Tiers** — smallest change, biggest gameplay impact. Just filter the offering pool by wanted level.
2. **Run Score** — add tracking columns, compute on bust/reset, update leaderboard sort.
3. **Run Badges** — new table, check logic in settle_window, display on profile/leaderboard.
4. **Titles** — depends on badges + run score existing first. Last to build, most aspirational.

---

## Open Questions

- Should there be a "prestige" system where completing a legendary run unlocks a permanent passive bonus for future runs? (e.g., "All future runs start with +1 chamber")
- Should badges be visible to other players on the leaderboard, or only on profile?
- Should there be seasonal/weekly badges that rotate, creating time-limited goals?
- Should title requirements scale with the player base? (e.g., "Top 10 run score" instead of fixed thresholds)

---

*Aligns with design north star: optimized for combinatorics, scaling math, and emergent strategies. Respects the player's time — reset is always free, progress is never punished.*
