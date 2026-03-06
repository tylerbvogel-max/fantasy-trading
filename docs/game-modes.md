# Game Modes

Fantasy Trading supports three distinct season modes. Each mode shares the same core engine (trading, portfolio management, leaderboard, analytics) but differs in what features are layered on top. The mode is configured per-season at creation time and determines the app's behavior and tone.

---

## Mode 1: Classroom

**Purpose**: A legitimate educational tool for high school and undergraduate courses in portfolio management and financial literacy.

**Target audience**: Students, teachers, academic institutions.

**What's enabled**:
- Portfolio trading (buy/sell stocks with virtual cash)
- Leaderboard (class rankings)
- Portfolio analytics (beta, alpha, benchmark comparisons)
- Educational micro-learning content and quizzes
- Quiz completion tracking (for grading purposes)

**What's disabled**:
- All player interactions (no sabotage, no forced swaps, no disruption)
- Interaction point earning/spending
- Any gamification that would undermine the tool's credibility as an educational platform

**Design considerations**:
- The UI tone should feel like an educational platform, not a game. Language should be informational and professional.
- A teacher should be able to assign this with confidence that it's appropriate for a classroom setting.
- No gambling-adjacent mechanics, no "pay to win" vibes.
- Quiz and learning content is front and center, not buried in a side tab.
- Could support instructor-facing features in the future (class management, grade export, progress tracking).

---

## Mode 2: League

**Purpose**: Competitive paper trading in the style of fantasy football leagues. Skill-based, fair, and serious.

**Target audience**: Friend groups, coworkers, investing clubs, competitive players.

**What's enabled**:
- Portfolio trading
- Leaderboard with competitive rankings
- Portfolio analytics and player-vs-player comparison
- Educational content and quizzes (optional, for personal development)

**What's disabled**:
- All player interactions (no sabotage mechanics)
- Interaction point earning/spending

**Design considerations**:
- The competitive loop is the product. Leaderboard standings matter.
- Analytics (beta, alpha) serve as bragging rights and objective skill measurement.
- This is the mode with the most potential for growth into ranked play, ELO/MMR systems, seasonal rankings, and matchmaking.
- Fair play is paramount: no mechanics that let one player directly affect another's portfolio.
- Tone is competitive but clean, like a fantasy sports app.

---

## Mode 3: Arena

**Purpose**: High-energy, sabotage-enabled competitive play. Inspired by games like Balatro where simple base mechanics are layered with increasingly wild modifiers.

**Target audience**: Gamers, social groups who want chaos, players looking for a more interactive experience.

**What's enabled**:
- Portfolio trading
- Leaderboard
- Portfolio analytics
- Educational micro-learning content and quizzes
- **Experience points (XP) earned from quiz completion**
- **Player interactions purchased with XP** (forced swaps, position liquidation, etc.)
- **Defensive spending** (leaders can spend XP to protect against attacks)

**What's disabled**:
- Nothing. All features are active.

**Design considerations**:
- The base game (trading) is simple. The meta-game (interactions) is where the depth lives. Like Balatro: poker is the base, jokers are the game.
- Interactions should have escalating cost and impact. Minor disruptions are cheap and frequent. Major disruptions (liquidating positions) are expensive and rare.
- **Anti-gang-up protection**: There must be a cap on how many negative interactions can target a single player within a time window. Multiple players should not be able to coordinate to destroy one player in the final days of a season.
- **Attack vs. defend tension**: XP can be spent offensively (interactions against others) or defensively (shielding your own portfolio). This creates a strategic resource allocation decision — hoard for defense or spend aggressively.
- **Point costs will be tuned over time**. Expect to adjust pricing across the lifecycle of the game as the meta develops. The architecture should make cost adjustments easy (config, not hardcoded).
- Combo mechanics and interaction synergies are a future opportunity to deepen the meta-game.

---

## Season Configuration

The season mode is set at creation time and determines feature availability. This should be clearly communicated to players when they join a season so expectations are set upfront.

| Feature | Classroom | League | Arena | Bounty Hunter |
|---|---|---|---|---|
| Trading | Yes | Yes | Yes | No |
| Leaderboard | Yes | Yes | Yes | Yes |
| Portfolio analytics | Yes | Yes | Yes | No |
| Educational content | Yes | Optional | Yes | No |
| Quizzes | Yes | Optional | Yes | No |
| XP from quizzes | No | No | Yes | No |
| Player interactions | No | No | Yes | No |
| Defensive XP spending | No | No | Yes | No |
| Anti-gang-up caps | N/A | N/A | Yes | N/A |
| Directional predictions | No | No | No | Yes |
| Wanted level system | No | No | No | Yes |
| Iron collectibles | No | No | No | Yes |
| Bust/revival mechanics | No | No | No | Yes |

---

## Mode 4: Bounty Hunter

**Purpose**: A high-stakes prediction game layered on top of stock price movements. Players make directional predictions (rise/fall) or defensive plays (holster) on 1-hour price windows, earning score multiplied by a "wanted level" that escalates with aggressive play. Inspired by roguelike deckbuilders — simple base mechanics with layered modifiers (Irons) that create emergent strategy.

**Target audience**: Gamers, prediction market enthusiasts, players who enjoy risk/reward escalation and build-crafting.

### Core Design Decisions

**Round timing — 1-hour prediction windows, 30 rounds per season week.**
Each round corresponds to a 1-hour real-time window. During standard US market hours (9:30 AM - 4:00 PM ET, Mon-Fri), this yields ~32.5 potential windows per week. With after-hours trading windows available, players can complete their 30 rounds on a flexible schedule — they don't need to play every hour, but the cadence encourages multiple daily check-ins (similar to Duolingo streaks or sports betting micro-sessions). The 1-hour window was chosen over 2-hour windows because:
- More frequent decision points create stronger habit loops (4-6 daily touchpoints vs 2-3)
- Shorter prediction windows feel more skill-testable and actionable
- 30 rounds provides enough progression for meaningful iron builds and wanted level arcs
- After-hours flexibility means players aren't punished for missing market hours

**What's enabled**:
- 5 picks per round: rise, fall, or holster on stock price direction within the 1-hour window
- Confidence levels (1-3) that multiply both wins and losses
- Wanted level system — escalates with aggressive play, multiplies all scoring
- Notoriety tracking — determines wanted level changes based on play style
- Iron system: 75 collectible modifiers across 4 rarity tiers (Common, Uncommon, Rare, Legendary) that alter scoring, accuracy, economy, and special mechanics
- Chamber slots (2-6) that limit how many Irons can be equipped simultaneously
- Skip mechanic with escalating costs
- Ante system (flat cost per round to stay in)

**What's disabled**:
- Direct player-vs-player interactions (competition is leaderboard-based)
- Traditional portfolio trading (this mode replaces buy/sell with prediction mechanics)

**Design considerations**:
- The wanted level creates natural drama arcs — conservative players plateau safely, aggressive players risk bust for exponential returns
- Iron builds create replayability and strategic diversity (75 irons, ~30 equipped per run)
- Bust mechanics (balance reaching $0) add real stakes without real money
- The mode is designed so that skilled + lucky players can reach ludicrous balance levels ($10M+), which makes leaderboard competition exciting
- Balancing is done via the bounty-sim dashboard (`tools/bounty-sim/sim.mjs --serve`)

---

## Implementation Notes

- The `Season` model should include a `mode` field (`classroom`, `league`, `arena`, `bounty`) that gates feature availability.
- Player interaction types, costs, cooldowns, and targeting caps should be stored in configuration (database or config file), not hardcoded, to allow tuning.
- The existing `interaction_types` and `player_interactions` tables (Phase 2 models already in the schema) will be activated for Arena mode.
- The UI should adapt its tone and presentation based on the season mode — not just toggling features on/off, but adjusting how the app feels.
- Bounty Hunter rounds are tied to 1-hour real-time price windows. The backend must track round availability based on market hours and after-hours windows. 30 rounds per season week.
- Iron definitions, rarity weights, and effect values live in `tools/bounty-sim/irons.mjs` and should be mirrored to backend config when the mode is implemented.
- Bounty Hunter balance tuning is done via the simulation dashboard (`node tools/bounty-sim/sim.mjs --serve`) — all scoring, economy, and iron parameters are adjustable there.
