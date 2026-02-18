# Ideas & Decisions

## Key Decisions
- Market hours restriction: 9:30 AM - 9:00 PM ET weekdays (extended for beta)
- Retro 80s theme: black bg, dark grey cards, #6172C5 #ED2EA5 #FA8057 #FAD009
- SecureStore for token persistence, auto-logout on 401

## Ideas Bucket
- Android emulator for local testing (needs more RAM/disk — revisit if hardware upgrades)
- Swipe-based trading (Tinder-style) — swipe right to buy, left to pass on stocks (see `time-attack-design.md` for full design)
- Tappable stock name in swipe card → opens an info/detail page about the security (company info, key stats, news)
- **Bloomberg-style scrolling headlines** — pull headline data from Finviz or another rolling news source for stocks actively owned by players in a given league. Display as a ticker/marquee that cycles like the Bloomberg channel crawl

## Dev Notes
- Intro loading screen animation
- Animations in general — invest in motion/polish across the app
- Collection page of accomplishments/achievements — super granular with descriptions
- "Enhanced stocks" — behavior changes from what the market reports (more volatile, less volatile, directional shifts)
- Dummy stocks added to provide combos and add more to the 5-card monte
- Change "ante" to "fund fee" or something more financial-sounding
- Equivalent of tarot cards — check Claude for finance-world analogues
- Planet card equivalent — apply certain behavior changes to stocks; check behaviors Balatro uses for inspiration
- Booster packs (find better term) that provide modifier types above — mix into gameplay, earn them as rewards. Maybe call them "funding rounds" or similar
- Difficulty unlocks — need lever to identify different difficulty types (fewer stocks, higher ante with more stocks, preselected modifiers, other changes)
- Ability to restart at any time — need 1-hour marker to move from player-initiated timestamp
- Transition pages that give famous finance quotes — see [`finance-quotes.md`](finance-quotes.md) for 35 curated quotes organized by era
- Add more stocks as sets so rounds can be played faster — sets of 5 still, but add ~50 total. Maybe make this a variable component. Goal: allow more than single-round interaction per session, more interactions per day. Needs design work to hammer out.
- Consider what analytics tools day traders commonly use and make those selectable styles (candlestick chart, time range selection, moving averages, etc.). Depends on data availability. Ability to toggle on/off, or make these power-ups themselves.
- Leaderboard analytics needs bolstering — alpha, beta, std dev; use Fidelity performance stats for inspiration
- Future state: AI narrative based on player behavior for feedback. Must be cryptic, not fed on game mechanics so no cheating derived.
- Need disclaimer: game is for entertainment purposes and not financial advice. "This should be obvious, but… [insert disclosure here]"

---

## Mini League Sessions
- **Micro Cap Madness** — small-cap stocks only
- **Mag 7 Mania** — only Magnificent 7 stocks (AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA)
- **Pharma Frenzy** — pharma/biotech sector only
- **IPO Rush** — only companies IPO'd within the last year
- **Dinosaur Derby** — only stocks from companies founded before 1950
- **AI Arms Race** — AI/ML-related stocks only
- **Consumer Staples Scramble** — consumer staples sector only

## Badges / Achievements
- **Season Winner** — top player in their league
- **Diamond Hands** — hold a losing stock that eventually rebounds
- **Paper Hands** — panic sell at the worst time
- **Sector Savant** — win a sector-restricted league
- **Comeback Kid** — go from last to first
- **Untouchable** — win without being hit by any player actions
- **Robin Hood** — come back from last place three times
- **Warren Buffett** — hold same stocks for entire season
- **The Diversifier** — own stocks in all 11 sectors simultaneously

## Seasonal Content
- **Halloween Horror** — worst-performing "zombie stocks" special week
- **Holiday Rally** — December seasonal plays
- **Tax Season** — April league with focus on loss harvesting strategies
- **Summer Slowdown** — low-volume stocks challenge
- **Earnings Season Event** — quarterly tournaments timed to earnings

## Large Scale Player Modes
- **Team Leagues** — 2v2, 3v3, shared portfolios
- **Battle Royale** — 20+ players, top advance to next ranked league
- **Draft Leagues** — snake draft, can't pick the same stocks as others. Design events that benefit from league-style play

## Draft League Play
- Head-to-head matchups, season record matters more than prices
- Grudge matches
- "Stock drops" — new stocks become available to claim mid-season
- Volatility events: random earnings, SEC investigation (stock frozen), delisting risk (forced sell), etc.

## Tutorial / Education (Future Mode — Preserved)
- **Core feature: Financial Mastery Quiz System** — progressive difficulty from basic financial literacy (what is a stock, P/E ratio, market cap) all the way up to Jane Street-level interview questions (probability puzzles, options pricing, market microstructure, expected value problems). This is the anchor feature if education mode is ever built out.
- **Tutorial Island** — 1 week intro league for complete beginners
- Tip pop-ups
- Market knowledge quiz / learning modules
- AI evaluation of holdings
- **Master Classes** — video courses from finance pros
- **Strategy Guides** — premium content from top players
- **One-on-One Coaching** — connect with mentors
- **Certification Programs** — serious investing education

## Tournament System
- **Monthly Championships** — top 64 players, bracket-style
- **Sponsor Cups** — branded tournaments with prizes
- **Qualifier System** — win local leagues to advance to regionals
- **World Finals** — annual championship with grand prize
- **Amateur vs Pro Tournaments** — new players vs veterans with handicaps

## Communications
- Discord integration for long-form chatting
- In-app chat but like Dark Souls message system
- Earnings announcements based on holdings
- RSS feed for holdings, sector-specific sessions

## Feedback / Report a Problem
- **Option A: In-app form + DB table** — `feedback` table with user_id, category (bug/suggestion/other), message text, timestamp. Best UX (stays in-app) but needs backend endpoint and a way to review submissions (admin endpoint or direct DB query).
- **Option B: Google Form link** — Zero backend work. Profile button opens a Google Form in the browser. Responses go to a Google Sheet with free email notifications. Quick to set up, upgrade to in-app later if needed.

## Bounty Hunter Enhancements
- **Progression System** — see `bounty-progression.md` for full design (run badges, iron tiers, run score, titles)
- **Probability Cone Chart** ✅ — extend the stock chart 1 hour into the future with shaded probability cones showing 1σ, 2σ, and 3σ windows of possible price movement. Gives players a visual read on how volatile or stable a stock is so they feel like they're analyzing real data before swiping. Uses historical volatility to compute the cone widths.
- **Respect the Player's Time** — core design principle for launch messaging. Make it explicitly clear that we respect the player's time. No FOMO mechanics, no punishment for missing rounds. Someone interested in stocks and this game deserves that. Missed rounds = neutral effect (no DD change, no wanted level change, no streak break). All time-based effects (Iron scaling, streaks, etc.) are tied to rounds played, not calendar time. This is a competitive advantage over most mobile games that weaponize player guilt.
- **Design North Star** — Bounty Hunter should be optimized for combinatorics of power-ups and strategies, scaling math, and emergent build synergies. Polish should be focused on a clear UI, fast feedback, and addictive number escalation. Success factors: mechanically coherent design, exponential scaling tension.
- **8-bit SFX on Swipe** — play retro sound effects on each committed swipe direction (rise/fall/hold/skip). Code is written in AudioContext (`playSfx`), BountyHunterScreen (`onCommitRef`), and ProfileScreen (SFX toggle) but changes are uncommitted. Still need to generate 4 WAV files via [sfxr.me](https://sfxr.me/) and place them in `mobile/assets/audio/` as `sfx-rise.wav`, `sfx-fall.wav`, `sfx-hold.wav`, `sfx-skip.wav`. Then commit and test.
- **More Soundtrack Music** — if we want more than one song, get a subscription to [Envato Elements](https://elements.envato.com/) and download tracks from there. No development needed yet.

## Data Analytics
- **Heat Map** — which stocks are most popular in your league
- **Sentiment Tracker** — bull/bear ratio among players
- **Trading Volume** — who's most active
- **Win Rate by Strategy** — value vs growth vs day trading success rates
- **Correlation Analysis** — how do portfolios move together?
- **Best/Worst Trades** — your winning and losing picks
- **Timing Analysis** — are you buying at tops or bottoms?
- **Sector Bias** — do you over/underweight certain sectors?
- **Hold Time Average** — are you patient or trigger-happy?
- **Comparison to Benchmarks** — vs S&P 500, vs league average

## B2B Features
- **White-Label Leagues** — brands run their own
- **Corporate Dashboard** — track employee engagement
- **University Portal** — professor controls for classes
- **API for Institutions** — custom integrations

## Main Competitors
- moomoo
- Webull
- TradingView
- Paper Trading (Liefto LLC)
- Forex Trading School & Game (Fister Group SIA)
- MarketSim (Third Line LLC)
- thinkorswim (Schwab)
- Trading Game (Agents 007)

## General Priority
1. Mini-seasons — perfect for retention
2. Achievement/badge system — drives engagement through goals
3. Enhanced chat with GIFs/reactions — social glue
4. Tournament brackets — creates aspirational goals
5. AI portfolio advisor — educational value
6. Historical replay mode — learn from past events
7. Team leagues (2v2, 3v3) — new social dynamic
8. Advanced player interactions (10+ types) — key differentiator
9. Custom league rules builder — infinite variety
10. Portfolio analytics dashboard — helps users improve

## D&D-Style Play

### Investor Classes
- **The Value Investor (Tank/Defender)** — Passive: dividend stocks generate 25% more returns. Active "Deep Value": once/week buy at 10% discount if stock is down 20%+ from highs. Weakness: must hold minimum 7 days. Ultimate "Buffett's Blessing": immune to one market crash event.
- **The Day Trader (Rogue/DPS)** — Passive: unlimited trades (others limited to 5/day). Active "Quick Flip": sell within 1 hour for guaranteed 3% gain. Weakness: 2x transaction fees, max 3-day hold. Ultimate "Flash Crash Exploit": 3 instant guaranteed-gain trades during volatility.
- **The Growth Hunter (Mage/Burst)** — Passive: tech/growth stocks gain extra 5%. Active "Moonshot": once/week pick one stock for 2x returns. Weakness: dividends underperform 10%. Ultimate "Bezos's Vision": pick 3 stocks, any 10x = instant win.
- **The Contrarian (Support/Healer)** — Passive: bonus shares on beaten-down stocks (30%+ off highs). Active "Against the Crowd": once/week force-buy the most-sold stock. Weakness: can't own top 3 most popular stocks. Ultimate "Short Squeeze": reverse one week's losses into gains.
- **The Dividend Farmer (Cleric/Support)** — Passive: collects actual dividends as bonus cash. Active "Compound Interest": reinvest at 1.5x rate. Weakness: can only own dividend-paying stocks. Ultimate "Snowball": dividend income becomes instant purchasing power.
- **The Index Hugger (Bard/Support)** — Passive: auto-tracks S&P 500 as baseline. Active "Safe Haven": once/week park 30% in bonds. Weakness: can't beat market by >20%. Ultimate "Bogle's Wisdom": within 5% of S&P = top 3 finish.
- **The Activist Investor (Paladin/Tank)** — Passive: can freeze a stock for all players. Active "Proxy Fight": force another player to vote on your trade. Weakness: must hold minimum 14 days. Ultimate "Hostile Takeover": steal opponent's entire position in one stock.
- **The Quant (Artificer/Tech)** — Passive: AI-generated insights before trades. Active "Algorithm": set auto-executing buy/sell rules. Weakness: must follow own rules. Ultimate "Backtesting": rewind one week and remake decisions.

### Why Classes Work
- Identity formation ("I'm a growth hunter")
- Mastery path feels rewarding
- Team dynamics — leagues need a mix of classes
- Replayability — try different classes each season
- Balance debates drive community engagement

### Leveling & XP System
- Making trades: +10 XP
- Beating weekly benchmark: +50 XP
- Winning head-to-head: +100 XP
- Portfolio up for the week: +5 XP per %
- Using class abilities successfully: +25 XP
- Surviving player attacks: +30 XP
- Helping another player: +20 XP

### Level Progression
- **Level 1-5 (Novice, Weeks 1-2)** — basic trading, 10 stocks max, 1 active ability
- **Level 6-10 (Intermediate, Weeks 3-5)** — options trading, 15 stocks, 2 abilities, 1 power-up slot
- **Level 11-15 (Advanced, Weeks 6-8)** — international stocks, 20 stocks, 3 abilities, 2 power-up slots
- **Level 16-20 (Master, Weeks 9-12)** — all features, unlimited holdings, ultimate ability, can mentor others

### Skill Trees (3 paths per class)
Example — Day Trader:
- **Path A: Scalper** — many small trades. Tiers: 50% fee reduction → 10 trades/day → guaranteed +1% on trades under $5k
- **Path B: Momentum Trader** — ride trends. Tiers: see "hot" stocks → +10% on stocks up 5%+ that day → auto-sell on momentum break
- **Path C: Volatility Hunter** — profit from chaos. Tiers: identify highest volatility → 2x gains on crash days → trigger artificial volatility event

### Prestige Classes (Level 20)
- Multi-class into hybrid roles (e.g., Value Trader = Value Investor + Day Trader)
- Requires completing special challenges

*Last updated: Feb 2026*
