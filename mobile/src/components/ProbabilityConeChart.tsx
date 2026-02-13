import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import Svg, { Path, Line, Text as SvgText } from "react-native-svg";
import { Colors, FontFamily, FontSize, Spacing } from "../utils/theme";

interface CandlePoint {
  timestamp: number;
  close: number;
}

interface ProbabilityConeChartProps {
  candles: CandlePoint[];
  symbol: string;
  name?: string;
  openPrice?: number | null;
  width: number;
  height: number;
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
}: ProbabilityConeChartProps) {
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

  const hist = rawHist.filter((c) => c.timestamp >= tStart);
  if (hist.length < 2) {
    return (
      <View style={styles.stateWrap}>
        <Text style={styles.stateText}>Need more candle data...</Text>
      </View>
    );
  }

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
  const sigma = computeSigma(hist);
  const cone1 = generateCone(lastPrice, sigma, 1, PROJECTION_POINTS);
  const cone2 = generateCone(lastPrice, sigma, 2, PROJECTION_POINTS);
  const cone3 = generateCone(lastPrice, sigma, 3, PROJECTION_POINTS);

  // ── Y-axis range: snap to clean price intervals ──
  const histPrices = hist.map((c) => c.close);
  const allValues = [...histPrices, ...cone3.upper, ...cone3.lower];
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
          <Text style={styles.symbol}>{symbol}</Text>
          {name ? <Text style={styles.subtitle}>{name}</Text> : null}
        </View>
        <View style={styles.priceWrap}>
          <Text style={styles.currentPrice}>${formatPrice(lastPrice)}</Text>
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
              stroke={Colors.border}
              strokeWidth={0.5}
            />
            <SvgText
              x={CHART_PADDING.left - 8}
              y={yl.y + 4}
              fill={Colors.textMuted}
              fontSize={10}
              textAnchor="end"
              fontFamily={FontFamily.regular}
            >
              {yl.label}
            </SvgText>
          </React.Fragment>
        ))}

        {/* 3σ cone (lightest) */}
        <Path d={cone3Path} fill={Colors.orange} fillOpacity={0.08} />
        {/* 2σ cone */}
        <Path d={cone2Path} fill={Colors.orange} fillOpacity={0.16} />
        {/* 1σ cone (darkest) */}
        <Path d={cone1Path} fill={Colors.orange} fillOpacity={0.3} />

        {/* "Now" dashed vertical line */}
        <Line
          x1={nowX}
          y1={CHART_PADDING.top}
          x2={nowX}
          y2={CHART_PADDING.top + plotH}
          stroke={Colors.textMuted}
          strokeWidth={1}
          strokeDasharray="4,4"
        />

        {/* Historical price polyline */}
        <Path
          d={histPath}
          fill="none"
          stroke={isUp ? Colors.green : Colors.accent}
          strokeWidth={2}
        />

        {/* X-axis time labels */}
        {timeLabels.map((tl, i) => (
          <SvgText
            key={`t-${i}`}
            x={tl.x}
            y={height - 6}
            fill={tl.label === "Now" ? Colors.text : Colors.textMuted}
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
