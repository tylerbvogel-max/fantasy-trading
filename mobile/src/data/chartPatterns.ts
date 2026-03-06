export type PatternType = "candlestick" | "line";
export type PatternSignal = "bullish" | "bearish" | "neutral";

export interface ChartPattern {
  name: string;
  type: PatternType;
  signal: PatternSignal;
  indication: string;
}

// ── Candlestick Patterns ──

export const CANDLESTICK_PATTERNS: ChartPattern[] = [
  // Single candle
  { name: "Hammer", type: "candlestick", signal: "bullish", indication: "Long lower shadow after a downtrend signals potential reversal upward." },
  { name: "Inverted Hammer", type: "candlestick", signal: "bullish", indication: "Long upper shadow after a downtrend hints buyers are testing higher prices." },
  { name: "Hanging Man", type: "candlestick", signal: "bearish", indication: "Long lower shadow after an uptrend warns of selling pressure building." },
  { name: "Shooting Star", type: "candlestick", signal: "bearish", indication: "Long upper shadow after an uptrend signals rejection at higher prices." },
  { name: "Doji", type: "candlestick", signal: "neutral", indication: "Open and close nearly equal — market indecision. Watch for the next candle to confirm direction." },
  { name: "Dragonfly Doji", type: "candlestick", signal: "bullish", indication: "Long lower shadow with open/close at the high — sellers pushed down but buyers reclaimed." },
  { name: "Gravestone Doji", type: "candlestick", signal: "bearish", indication: "Long upper shadow with open/close at the low — buyers pushed up but sellers rejected." },
  { name: "Long-Legged Doji", type: "candlestick", signal: "neutral", indication: "Very long shadows on both sides — extreme indecision between bulls and bears." },
  { name: "Spinning Top", type: "candlestick", signal: "neutral", indication: "Small body with upper and lower shadows — neither side has control." },
  { name: "Marubozu (Bullish)", type: "candlestick", signal: "bullish", indication: "Full-body green candle with no shadows — strong buyer conviction from open to close." },
  { name: "Marubozu (Bearish)", type: "candlestick", signal: "bearish", indication: "Full-body red candle with no shadows — relentless selling pressure all session." },

  // Two candle
  { name: "Bullish Engulfing", type: "candlestick", signal: "bullish", indication: "Green candle completely engulfs previous red candle — buyers overwhelm sellers." },
  { name: "Bearish Engulfing", type: "candlestick", signal: "bearish", indication: "Red candle completely engulfs previous green candle — sellers take control." },
  { name: "Piercing Line", type: "candlestick", signal: "bullish", indication: "Green candle opens below prior close and closes above its midpoint — reversal signal." },
  { name: "Dark Cloud Cover", type: "candlestick", signal: "bearish", indication: "Red candle opens above prior close and closes below its midpoint — bearish reversal." },
  { name: "Tweezer Tops", type: "candlestick", signal: "bearish", indication: "Two candles with matching highs at a peak — resistance confirmed, reversal likely." },
  { name: "Tweezer Bottoms", type: "candlestick", signal: "bullish", indication: "Two candles with matching lows at a trough — support confirmed, bounce likely." },
  { name: "Bullish Harami", type: "candlestick", signal: "bullish", indication: "Small green candle contained within prior large red candle — selling momentum fading." },
  { name: "Bearish Harami", type: "candlestick", signal: "bearish", indication: "Small red candle contained within prior large green candle — buying momentum fading." },
  { name: "Harami Cross", type: "candlestick", signal: "neutral", indication: "Doji inside the prior candle's body — strong indecision after a trending move." },

  // Three candle
  { name: "Three White Soldiers", type: "candlestick", signal: "bullish", indication: "Three consecutive long green candles — strong sustained buying pressure." },
  { name: "Three Black Crows", type: "candlestick", signal: "bearish", indication: "Three consecutive long red candles — aggressive sustained selling." },
  { name: "Morning Star", type: "candlestick", signal: "bullish", indication: "Red candle → small body → green candle. Classic three-bar bottom reversal." },
  { name: "Evening Star", type: "candlestick", signal: "bearish", indication: "Green candle → small body → red candle. Classic three-bar top reversal." },
  { name: "Morning Doji Star", type: "candlestick", signal: "bullish", indication: "Red candle → doji → green candle. Stronger reversal signal than regular morning star." },
  { name: "Evening Doji Star", type: "candlestick", signal: "bearish", indication: "Green candle → doji → red candle. Stronger reversal signal than regular evening star." },
  { name: "Three Inside Up", type: "candlestick", signal: "bullish", indication: "Bullish harami confirmed by a third green close above the first candle." },
  { name: "Three Inside Down", type: "candlestick", signal: "bearish", indication: "Bearish harami confirmed by a third red close below the first candle." },
  { name: "Three Outside Up", type: "candlestick", signal: "bullish", indication: "Bullish engulfing confirmed by a third higher close — strong reversal." },
  { name: "Three Outside Down", type: "candlestick", signal: "bearish", indication: "Bearish engulfing confirmed by a third lower close — strong reversal." },
  { name: "Abandoned Baby (Bullish)", type: "candlestick", signal: "bullish", indication: "Doji gaps below a downtrend then gaps up — rare and powerful reversal." },
  { name: "Abandoned Baby (Bearish)", type: "candlestick", signal: "bearish", indication: "Doji gaps above an uptrend then gaps down — rare and powerful reversal." },
  { name: "Tri-Star (Bullish)", type: "candlestick", signal: "bullish", indication: "Three dojis with the middle one gapping lower — extreme indecision resolving upward." },
  { name: "Tri-Star (Bearish)", type: "candlestick", signal: "bearish", indication: "Three dojis with the middle one gapping higher — extreme indecision resolving downward." },

  // Continuation
  { name: "Rising Three Methods", type: "candlestick", signal: "bullish", indication: "Long green, three small reds contained within it, then another long green — uptrend continues." },
  { name: "Falling Three Methods", type: "candlestick", signal: "bearish", indication: "Long red, three small greens contained within it, then another long red — downtrend continues." },
  { name: "Tasuki Gap Up", type: "candlestick", signal: "bullish", indication: "Gap up followed by a red candle that doesn't fill the gap — uptrend holds." },
  { name: "Tasuki Gap Down", type: "candlestick", signal: "bearish", indication: "Gap down followed by a green candle that doesn't fill the gap — downtrend holds." },
  { name: "Mat Hold", type: "candlestick", signal: "bullish", indication: "Strong green candle, brief pullback of small candles, then continuation — strong bull trend." },

  // Gap patterns
  { name: "Bullish Kicker", type: "candlestick", signal: "bullish", indication: "Red candle followed by green candle that gaps above the red open — one of the strongest bullish signals." },
  { name: "Bearish Kicker", type: "candlestick", signal: "bearish", indication: "Green candle followed by red candle that gaps below the green open — one of the strongest bearish signals." },

  // Other notable
  { name: "Belt Hold (Bullish)", type: "candlestick", signal: "bullish", indication: "Long green candle opens at its low with no lower shadow — immediate buyer takeover." },
  { name: "Belt Hold (Bearish)", type: "candlestick", signal: "bearish", indication: "Long red candle opens at its high with no upper shadow — immediate seller takeover." },
  { name: "Counterattack (Bullish)", type: "candlestick", signal: "bullish", indication: "Red candle followed by green candle closing at the same level — bulls fight back to even." },
  { name: "Counterattack (Bearish)", type: "candlestick", signal: "bearish", indication: "Green candle followed by red candle closing at the same level — bears fight back to even." },
];

// ── Line Chart / Technical Patterns ──

export const LINE_CHART_PATTERNS: ChartPattern[] = [
  // Reversal
  { name: "Head and Shoulders", type: "line", signal: "bearish", indication: "Three peaks with the middle highest — classic top reversal. Break of neckline confirms." },
  { name: "Inverse Head and Shoulders", type: "line", signal: "bullish", indication: "Three troughs with the middle lowest — classic bottom reversal. Neckline break confirms." },
  { name: "Double Top", type: "line", signal: "bearish", indication: "Price tests the same resistance twice and fails — \"M\" shape signals reversal down." },
  { name: "Double Bottom", type: "line", signal: "bullish", indication: "Price tests the same support twice and bounces — \"W\" shape signals reversal up." },
  { name: "Triple Top", type: "line", signal: "bearish", indication: "Three failed attempts at resistance — sellers firmly in control at that level." },
  { name: "Triple Bottom", type: "line", signal: "bullish", indication: "Three bounces off support — buyers reliably defend that price level." },
  { name: "Rounding Top", type: "line", signal: "bearish", indication: "Gradual arc from uptrend to downtrend — slow shift in sentiment from bullish to bearish." },
  { name: "Rounding Bottom", type: "line", signal: "bullish", indication: "Gradual arc from downtrend to uptrend — slow accumulation phase before breakout." },
  { name: "Bump and Run Reversal", type: "line", signal: "bearish", indication: "Steep price acceleration above a trendline then reversal — overextended move snaps back." },
  { name: "Diamond Top", type: "line", signal: "bearish", indication: "Broadening pattern followed by narrowing at a peak — volatile topping formation." },
  { name: "Diamond Bottom", type: "line", signal: "bullish", indication: "Broadening pattern followed by narrowing at a trough — volatile bottoming formation." },

  // Continuation
  { name: "Bullish Flag", type: "line", signal: "bullish", indication: "Sharp rally then tight downward channel — brief pause before the uptrend resumes." },
  { name: "Bearish Flag", type: "line", signal: "bearish", indication: "Sharp drop then tight upward channel — brief pause before the downtrend resumes." },
  { name: "Bullish Pennant", type: "line", signal: "bullish", indication: "Converging trendlines after a rally — compression before breakout higher." },
  { name: "Bearish Pennant", type: "line", signal: "bearish", indication: "Converging trendlines after a drop — compression before breakout lower." },
  { name: "Ascending Triangle", type: "line", signal: "bullish", indication: "Flat resistance with rising lows — buyers getting more aggressive, breakout likely." },
  { name: "Descending Triangle", type: "line", signal: "bearish", indication: "Flat support with falling highs — sellers getting more aggressive, breakdown likely." },
  { name: "Symmetrical Triangle", type: "line", signal: "neutral", indication: "Converging trendlines from both sides — breakout direction determines the trend." },
  { name: "Rising Wedge", type: "line", signal: "bearish", indication: "Both trendlines slope up but converge — diminishing momentum, usually breaks down." },
  { name: "Falling Wedge", type: "line", signal: "bullish", indication: "Both trendlines slope down but converge — selling exhaustion, usually breaks up." },
  { name: "Rectangle (Bullish)", type: "line", signal: "bullish", indication: "Price bounces between parallel support and resistance in an uptrend — consolidation before continuation." },
  { name: "Rectangle (Bearish)", type: "line", signal: "bearish", indication: "Price bounces between parallel support and resistance in a downtrend — consolidation before continuation." },
  { name: "Cup and Handle", type: "line", signal: "bullish", indication: "U-shaped base with a small pullback at the rim — strong accumulation pattern." },
  { name: "Inverted Cup and Handle", type: "line", signal: "bearish", indication: "Inverted U-shape with a small rally at the rim — distribution pattern." },

  // Channel
  { name: "Ascending Channel", type: "line", signal: "bullish", indication: "Parallel upward-sloping trendlines — healthy uptrend with predictable pullbacks." },
  { name: "Descending Channel", type: "line", signal: "bearish", indication: "Parallel downward-sloping trendlines — orderly downtrend with predictable rallies." },
  { name: "Horizontal Channel", type: "line", signal: "neutral", indication: "Price trading sideways between parallel levels — range-bound, trade the bounces." },

  // Broadening
  { name: "Broadening Top", type: "line", signal: "bearish", indication: "Higher highs and lower lows expanding — increasing volatility and uncertainty at a top." },
  { name: "Broadening Bottom", type: "line", signal: "bullish", indication: "Expanding range at a low — sellers exhausting before a reversal." },
  { name: "Megaphone", type: "line", signal: "neutral", indication: "Expanding price swings in both directions — high volatility, directional breakout pending." },

  // Gap patterns (on line charts)
  { name: "Breakaway Gap", type: "line", signal: "neutral", indication: "Price gaps through support/resistance with high volume — new trend begins." },
  { name: "Runaway Gap", type: "line", signal: "neutral", indication: "Gap in the middle of a trend — strong momentum, trend accelerating." },
  { name: "Exhaustion Gap", type: "line", signal: "neutral", indication: "Gap near the end of a trend — final burst before reversal." },
  { name: "Island Reversal", type: "line", signal: "neutral", indication: "Price gaps away then gaps back, isolating a cluster — sharp reversal signal." },

  // Other
  { name: "V-Bottom", type: "line", signal: "bullish", indication: "Sharp decline immediately followed by sharp recovery — rapid sentiment reversal." },
  { name: "V-Top", type: "line", signal: "bearish", indication: "Sharp rally immediately followed by sharp decline — sudden rejection." },
  { name: "Measured Move Up", type: "line", signal: "bullish", indication: "Two rally legs of equal length with a correction between — second leg targets the first leg's size." },
  { name: "Measured Move Down", type: "line", signal: "bearish", indication: "Two decline legs of equal length with a rally between — second leg targets the first leg's size." },
  { name: "Wolfe Wave (Bullish)", type: "line", signal: "bullish", indication: "Five-wave pattern within converging lines — predicts a sharp breakout from the wedge." },
  { name: "Wolfe Wave (Bearish)", type: "line", signal: "bearish", indication: "Five-wave pattern within converging lines — predicts a sharp breakdown from the wedge." },
];

export const ALL_CHART_PATTERNS: ChartPattern[] = [
  ...CANDLESTICK_PATTERNS,
  ...LINE_CHART_PATTERNS,
];
