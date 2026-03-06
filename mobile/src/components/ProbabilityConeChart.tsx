import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import Svg, { Path, Line, Rect, Text as SvgText } from "react-native-svg";
import { Colors, LightCardColors, FontFamily, FontSize, Spacing } from "../utils/theme";

interface CandlePoint {
  timestamp: number;
  close: number;
  open?: number;
  high?: number;
  low?: number;
}

interface ProbabilityConeChartProps {
  candles: CandlePoint[];
  symbol: string;
  name?: string;
  openPrice?: number | null;
  width: number;
  height: number;
  lightTheme?: boolean;
  candleChart?: boolean;
}

const CHART_PADDING = { top: 20, right: 50, bottom: 30, left: 55 };
const PROJECTION_POINTS = 30;

// ── Volatility math ──

function computeSigma(candles: CandlePoint[]): number {
  if (candles.length < 3) return 0;
  const logReturns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i - 1].close > 0 && candles[i].close > 0) {
      logReturns.push(Math.log(candles[i].close / candles[i - 1].close));
    }
  }
  if (logReturns.length === 0) return 0;
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance =
    logReturns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / logReturns.length;
  return Math.sqrt(variance);
}

function generateCone(
  lastPrice: number,
  sigma: number,
  nSigma: number,
  points: number
): { upper: number[]; lower: number[] } {
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i <= points; i++) {
    const T = i;
    const spread = nSigma * sigma * Math.sqrt(T);
    upper.push(lastPrice * Math.exp(spread));
    lower.push(lastPrice * Math.exp(-spread));
  }
  return { upper, lower };
}

// ── Chart helpers ──

function toY(value: number, min: number, max: number, height: number): number {
  if (max === min) return height / 2;
  return height - ((value - min) / (max - min)) * height;
}

function buildPolyline(xs: number[], ys: number[]): string {
  return xs.map((x, i) => `${i === 0 ? "M" : "L"}${x},${ys[i]}`).join(" ");
}

function buildPolygon(
  upperXs: number[],
  upperYs: number[],
  lowerXs: number[],
  lowerYs: number[]
): string {
  const upper = upperXs.map(
    (x, i) => `${i === 0 ? "M" : "L"}${x},${upperYs[i]}`
  );
  const lower = [...lowerXs]
    .reverse()
    .map((x, i) => `L${x},${[...lowerYs].reverse()[i]}`);
  return [...upper, ...lower, "Z"].join(" ");
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatPrice(p: number): string {
  return p.toFixed(2);
}

// ── Component ──

export default function ProbabilityConeChart({
  candles,
  symbol,
  name,
  openPrice,
  width,
  height,
  lightTheme,
  candleChart,
}: ProbabilityConeChartProps) {
  const tc = lightTheme
    ? { text: LightCardColors.text, textMuted: LightCardColors.textMuted, border: LightCardColors.border }
    : { text: Colors.text, textMuted: Colors.textMuted, border: Colors.border };
  const plotW = width - CHART_PADDING.left - CHART_PADDING.right;
  const plotH = height - CHART_PADDING.top - CHART_PADDING.bottom;

  // Loading state — no candles and no open price
  if ((!candles || candles.length < 2) && !openPrice) {
    return (
      <View style={styles.stateWrap}>
        <ActivityIndicator size="small" color={Colors.orange} />
        <Text style={styles.stateText}>Loading {symbol} data...</Text>
      </View>
    );
  }

  // Fallback — have a price but not enough candles for a chart
  if (!candles || candles.length < 5) {
    return (
      <View style={styles.stateWrap}>
        <View style={styles.header}>
          <Text style={styles.symbol}>{symbol}</Text>
          <Text style={styles.currentPrice}>
            ${formatPrice(openPrice ?? 0)}
          </Text>
        </View>
        <View style={styles.placeholderBody}>
          <Text style={styles.stateText}>Chart building...</Text>
        </View>
      </View>
    );
  }

  // ── Use last 2 hours of data ──
  const twoHoursAgo = candles[candles.length - 1].timestamp - 2 * 3600;
  const histCandles = candles.filter((c) => c.timestamp >= twoHoursAgo);
  const rawHist =
    histCandles.length >= 3
      ? histCandles
      : candles.slice(-Math.max(5, candles.length));

  // ── Snap time range to 5-min boundaries ──
  const FIVE_MIN = 300;
  const nowTs = rawHist[rawHist.length - 1].timestamp;
  const tStart = Math.ceil(rawHist[0].timestamp / FIVE_MIN) * FIVE_MIN;
  const tEnd = Math.ceil((nowTs + 3600) / FIVE_MIN) * FIVE_MIN;
  const totalDuration = tEnd - tStart;

  const histRaw = rawHist.filter((c) => c.timestamp >= tStart);
  if (histRaw.length < 2) {
    return (
      <View style={styles.stateWrap}>
        <Text style={styles.stateText}>Need more candle data...</Text>
      </View>
    );
  }

  // ── Synthesize OHLC when candleChart is on but backend only sent close ──
  const hasRealOHLC = histRaw.some((c) => c.open != null);
  const hist: CandlePoint[] = candleChart && !hasRealOHLC
    ? (() => {
        // Compute avg absolute move to scale synthetic wicks
        let totalMove = 0;
        for (let i = 1; i < histRaw.length; i++) {
          totalMove += Math.abs(histRaw[i].close - histRaw[i - 1].close);
        }
        const avgMove = histRaw.length > 1 ? totalMove / (histRaw.length - 1) : histRaw[0].close * 0.001;
        return histRaw.map((c, i) => {
          const prevClose = i > 0 ? histRaw[i - 1].close : c.close;
          const synthOpen = prevClose;
          const bodyHigh = Math.max(synthOpen, c.close);
          const bodyLow = Math.min(synthOpen, c.close);
          // Wicks extend beyond the body by 30-80% of avgMove (seeded by index for consistency)
          const wickUp = avgMove * (0.3 + ((i * 7 + 3) % 11) / 22);
          const wickDn = avgMove * (0.3 + ((i * 13 + 5) % 11) / 22);
          return { ...c, open: synthOpen, high: bodyHigh + wickUp, low: bodyLow - wickDn };
        });
      })()
    : histRaw;

  const lastPrice = hist[hist.length - 1].close;
  const firstPrice = hist[0].close;
  const priceChange = lastPrice - firstPrice;
  const pctChange = ((priceChange / firstPrice) * 100).toFixed(2);
  const isUp = priceChange >= 0;

  // ── Time-based X mapping ──
  function timeToX(ts: number): number {
    return CHART_PADDING.left + ((ts - tStart) / totalDuration) * plotW;
  }
  const nowX = timeToX(nowTs);

  // ── Volatility / cone generation ──
  const sigma = computeSigma(hist); // per-candle σ of log returns

  // σ_window: scale per-candle σ to the full projection window
  // Estimate candle interval from data, then count how many fit in the projection
  const avgInterval =
    hist.length >= 2
      ? (hist[hist.length - 1].timestamp - hist[0].timestamp) / (hist.length - 1)
      : 300; // default 5 min
  const projSeconds = tEnd - nowTs;
  const windowCandles = Math.max(1, projSeconds / avgInterval);
  const sigmaWindow = sigma * Math.sqrt(windowCandles);

  // Dynamic hold threshold: Φ⁻¹(2/3) ≈ 0.4307 × σ_window → ~1/3 probability each
  const PHI_INV_TWO_THIRDS = 0.4307;
  const holdThreshold = Math.max(0.0003, Math.min(0.02, PHI_INV_TWO_THIRDS * sigmaWindow));

  const cone1 = generateCone(lastPrice, sigma, 1, PROJECTION_POINTS);
  const cone2 = generateCone(lastPrice, sigma, 2, PROJECTION_POINTS);
  const cone3 = generateCone(lastPrice, sigma, 3, PROJECTION_POINTS);

  // ── Y-axis range: snap to clean price intervals ──
  const histPrices = hist.map((c) => c.close);
  // Include OHLC highs/lows in range when available
  const ohlcValues = candleChart
    ? hist.flatMap((c) => [c.high ?? c.close, c.low ?? c.close])
    : [];
  const allValues = [...histPrices, ...ohlcValues, ...cone3.upper, ...cone3.lower];
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const rawRange = rawMax - rawMin;

  const niceSteps = [0.5, 1, 2, 5, 10, 20, 50, 100];
  let yStep = niceSteps[0];
  for (const s of niceSteps) {
    if (rawRange / s <= 8) {
      yStep = s;
      break;
    }
  }
  const yMin = Math.floor(rawMin / yStep) * yStep;
  const yMax = Math.ceil(rawMax / yStep) * yStep;

  // ── Build historical line (time-based X) ──
  const histXs = hist.map((c) => timeToX(c.timestamp));
  const histYs = hist.map((c) =>
    CHART_PADDING.top + toY(c.close, yMin, yMax, plotH)
  );
  const histPath = buildPolyline(histXs, histYs);

  // ── Build cone polygons ──
  const projDuration = tEnd - nowTs;
  const projXs = Array.from({ length: PROJECTION_POINTS + 1 }, (_, i) =>
    timeToX(nowTs + (projDuration * i) / PROJECTION_POINTS)
  );

  function coneYs(vals: number[]): number[] {
    return vals.map((v) => CHART_PADDING.top + toY(v, yMin, yMax, plotH));
  }

  const cone3Path = buildPolygon(
    projXs, coneYs(cone3.upper),
    projXs, coneYs(cone3.lower)
  );
  const cone2Path = buildPolygon(
    projXs, coneYs(cone2.upper),
    projXs, coneYs(cone2.lower)
  );
  const cone1Path = buildPolygon(
    projXs, coneYs(cone1.upper),
    projXs, coneYs(cone1.lower)
  );

  // ── X-axis time labels ──
  const totalMinutes = totalDuration / 60;
  const roughStep = Math.round(totalMinutes / 4 / 5) * 5;
  const labelStepSec = Math.max(5, roughStep) * 60;

  const timeLabels: { x: number; label: string }[] = [];
  timeLabels.push({ x: timeToX(tStart), label: formatTime(tStart) });
  const firstStepTs = Math.ceil(tStart / labelStepSec) * labelStepSec;
  for (let ts = firstStepTs; ts <= tEnd; ts += labelStepSec) {
    if (ts === tStart) continue;
    if (Math.abs(ts - nowTs) < labelStepSec * 0.3) continue;
    timeLabels.push({ x: timeToX(ts), label: formatTime(ts) });
  }
  timeLabels.push({ x: nowX, label: "Now" });

  // ── Y-axis price labels ──
  const yLabels: { y: number; label: string }[] = [];
  for (let val = yMin; val <= yMax + yStep * 0.01; val += yStep) {
    yLabels.push({
      y: CHART_PADDING.top + toY(val, yMin, yMax, plotH),
      label: formatPrice(val),
    });
  }

  return (
    <View>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.symbol, { color: tc.text }]}>{symbol}</Text>
          {name ? <Text style={[styles.subtitle, { color: tc.textMuted }]}>{name}</Text> : null}
        </View>
        <View style={styles.priceWrap}>
          <Text style={[styles.currentPrice, { color: tc.text }]}>${formatPrice(lastPrice)}</Text>
          <Text
            style={[
              styles.changeText,
              { color: isUp ? Colors.green : Colors.accent },
            ]}
          >
            {isUp ? "+" : ""}
            {priceChange.toFixed(2)} ({isUp ? "+" : ""}
            {pctChange}%)
          </Text>
        </View>
      </View>

      {/* SVG Chart */}
      <Svg width={width} height={height}>
        {/* Y-axis grid lines and labels */}
        {yLabels.map((yl, i) => (
          <React.Fragment key={`y-${i}`}>
            <Line
              x1={CHART_PADDING.left}
              y1={yl.y}
              x2={CHART_PADDING.left + plotW}
              y2={yl.y}
              stroke={tc.border}
              strokeWidth={0.5}
            />
            <SvgText
              x={CHART_PADDING.left - 8}
              y={yl.y + 4}
              fill={tc.textMuted}
              fontSize={10}
              textAnchor="end"
              fontFamily={FontFamily.regular}
            >
              {yl.label}
            </SvgText>
          </React.Fragment>
        ))}

        {/* 3σ cone outline */}
        <Path d={cone3Path} fill="none" stroke={tc.text} strokeOpacity={0.12} strokeWidth={1} />
        {/* 2σ cone outline */}
        <Path d={cone2Path} fill="none" stroke={tc.text} strokeOpacity={0.2} strokeWidth={1} />
        {/* 1σ cone outline */}
        <Path d={cone1Path} fill="none" stroke={tc.text} strokeOpacity={0.35} strokeWidth={1} />

        {/* Outcome zones: rise / hold / fall — to the right of "Now" */}
        {(() => {
          const refPrice = openPrice ?? lastPrice;
          const holdHalf = refPrice * holdThreshold;
          const riseY = CHART_PADDING.top + toY(refPrice + holdHalf, yMin, yMax, plotH);
          const fallY = CHART_PADDING.top + toY(refPrice - holdHalf, yMin, yMax, plotH);
          const plotTop = CHART_PADDING.top;
          const plotBottom = CHART_PADDING.top + plotH;
          const zoneLeft = nowX;
          const zoneWidth = CHART_PADDING.left + plotW - nowX;
          if (zoneWidth <= 0) return null;
          return (
            <>
              {/* Rise — green, top of plot to rise threshold */}
              <Rect
                x={zoneLeft}
                y={plotTop}
                width={zoneWidth}
                height={Math.max(0, riseY - plotTop)}
                fill={Colors.green}
                fillOpacity={0.08}
              />
              {/* Hold — blue, between rise and fall thresholds */}
              <Rect
                x={zoneLeft}
                y={riseY}
                width={zoneWidth}
                height={Math.max(0, fallY - riseY)}
                fill="#4DA6FF"
                fillOpacity={0.18}
              />
              {/* Fall — pink, from fall threshold to bottom of plot */}
              <Rect
                x={zoneLeft}
                y={fallY}
                width={zoneWidth}
                height={Math.max(0, plotBottom - fallY)}
                fill={Colors.accent}
                fillOpacity={0.08}
              />
              {/* Hold/Rise boundary */}
              <Line
                x1={zoneLeft}
                y1={riseY}
                x2={zoneLeft + zoneWidth}
                y2={riseY}
                stroke={tc.text}
                strokeOpacity={0.35}
                strokeWidth={1}
                strokeDasharray="4,4"
              />
              {/* Hold/Fall boundary */}
              <Line
                x1={zoneLeft}
                y1={fallY}
                x2={zoneLeft + zoneWidth}
                y2={fallY}
                stroke={tc.text}
                strokeOpacity={0.35}
                strokeWidth={1}
                strokeDasharray="4,4"
              />
            </>
          );
        })()}

        {/* "Now" dashed vertical line */}
        <Line
          x1={nowX}
          y1={CHART_PADDING.top}
          x2={nowX}
          y2={CHART_PADDING.top + plotH}
          stroke={tc.text}
          strokeOpacity={0.35}
          strokeWidth={1}
          strokeDasharray="4,4"
        />

        {/* Historical price data */}
        {candleChart ? (
          // ── OHLC Candlesticks ──
          <>
            {hist.map((c, i) => {
              const o = c.open ?? c.close;
              const h = c.high ?? Math.max(o, c.close);
              const lo = c.low ?? Math.min(o, c.close);
              const cx = timeToX(c.timestamp);
              const bullish = c.close >= o;
              const color = bullish ? Colors.green : Colors.accent;

              // Body
              const bodyTop = CHART_PADDING.top + toY(Math.max(o, c.close), yMin, yMax, plotH);
              const bodyBot = CHART_PADDING.top + toY(Math.min(o, c.close), yMin, yMax, plotH);
              const bodyH = Math.max(1, bodyBot - bodyTop);

              // Wick
              const wickTop = CHART_PADDING.top + toY(h, yMin, yMax, plotH);
              const wickBot = CHART_PADDING.top + toY(lo, yMin, yMax, plotH);

              // Dynamic width: scale to available space, min 1px, max 4px
              const candleW = Math.max(1, Math.min(4, (plotW / hist.length) * 0.6));

              return (
                <React.Fragment key={`candle-${i}`}>
                  {/* Wick */}
                  <Line
                    x1={cx}
                    y1={wickTop}
                    x2={cx}
                    y2={wickBot}
                    stroke={color}
                    strokeWidth={1}
                  />
                  {/* Body */}
                  <Rect
                    x={cx - candleW / 2}
                    y={bodyTop}
                    width={candleW}
                    height={bodyH}
                    fill={bullish ? color : color}
                    fillOpacity={bullish ? 0.3 : 1}
                    stroke={color}
                    strokeWidth={0.5}
                  />
                </React.Fragment>
              );
            })}
          </>
        ) : (
          // ── Line chart (default) ──
          <Path
            d={histPath}
            fill="none"
            stroke={isUp ? Colors.green : Colors.accent}
            strokeWidth={2}
          />
        )}

        {/* X-axis time labels */}
        {timeLabels.map((tl, i) => (
          <SvgText
            key={`t-${i}`}
            x={tl.x}
            y={height - 6}
            fill={tl.label === "Now" ? tc.text : tc.textMuted}
            fontSize={10}
            textAnchor="middle"
            fontFamily={tl.label === "Now" ? FontFamily.bold : FontFamily.regular}
          >
            {tl.label}
          </SvgText>
        ))}

        {/* Sigma labels centered in each exclusive upper band */}
        {(() => {
          const endIdx = PROJECTION_POINTS;
          const c1Upper = cone1.upper[endIdx];
          const c1Lower = cone1.lower[endIdx];
          const c2Upper = cone2.upper[endIdx];
          const c3Upper = cone3.upper[endIdx];
          const y1 = (c1Upper + c1Lower) / 2;
          const y2 = (c2Upper + c1Upper) / 2;
          const y3 = (c3Upper + c2Upper) / 2;
          return [
            { price: y1, sigma: "1σ", pct: "68%" },
            { price: y2, sigma: "2σ", pct: "95%" },
            { price: y3, sigma: "3σ", pct: "99.7%" },
          ].flatMap(({ price, sigma, pct }) => {
            const cy = CHART_PADDING.top + toY(price, yMin, yMax, plotH);
            const cx = CHART_PADDING.left + plotW + 6;
            return [
              <SvgText
                key={sigma}
                x={cx}
                y={cy - 2}
                fill={Colors.orange}
                fontSize={9}
                fontFamily={FontFamily.medium}
              >
                {sigma}
              </SvgText>,
              <SvgText
                key={pct}
                x={cx}
                y={cy + 9}
                fill={Colors.orange}
                fontSize={9}
                fontFamily={FontFamily.regular}
              >
                {pct}
              </SvgText>,
            ];
          });
        })()}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  stateWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  stateText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  symbol: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  priceWrap: {
    alignItems: "flex-end",
  },
  currentPrice: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  changeText: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.medium,
    marginTop: 2,
  },
  placeholderBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
