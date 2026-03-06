import React from "react";
import { View, Text, Dimensions, StyleSheet } from "react-native";
import { LineChart } from "react-native-chart-kit";
import { Colors, FontFamily, FontSize, Spacing } from "../utils/theme";

interface SpyCandlePoint {
  timestamp: number;
  close: number;
}

interface SpyChartProps {
  candles: SpyCandlePoint[];
  openPrice?: number | null;
}

export default function SpyChart({ candles, openPrice }: SpyChartProps) {
  const screenWidth = Dimensions.get("window").width - Spacing.xl * 2;

  if (!candles || candles.length < 2) {
    // Show open price if available, even without candle data
    if (openPrice) {
      return (
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.label}>SPY</Text>
            <Text style={[styles.price, { color: Colors.text }]}>
              ${openPrice.toFixed(2)}
            </Text>
          </View>
          <View style={styles.emptyChart}>
            <Text style={styles.emptyText}>Chart data loading...</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Waiting for price data...</Text>
      </View>
    );
  }

  // Sample down to ~20 points for readability
  const step = Math.max(1, Math.floor(candles.length / 20));
  const sampled = candles.filter((_, i) => i % step === 0 || i === candles.length - 1);

  const prices = sampled.map((c) => c.close);
  const labels = sampled.map((c) => {
    const d = new Date(c.timestamp * 1000);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  });

  // Only show a few labels to avoid crowding
  const labelStep = Math.max(1, Math.floor(labels.length / 4));
  const displayLabels = labels.map((l, i) => (i % labelStep === 0 ? l : ""));

  const priceChange = prices[prices.length - 1] - prices[0];
  const lineColor = priceChange >= 0 ? Colors.green : Colors.accent;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>SPY</Text>
        <Text style={[styles.price, { color: lineColor }]}>
          ${prices[prices.length - 1].toFixed(2)}
        </Text>
      </View>
      <LineChart
        data={{
          labels: displayLabels,
          datasets: [{ data: prices }],
        }}
        width={screenWidth}
        height={160}
        withDots={false}
        withInnerLines={false}
        withOuterLines={false}
        withVerticalLabels={true}
        withHorizontalLabels={true}
        chartConfig={{
          backgroundColor: "transparent",
          backgroundGradientFrom: Colors.card,
          backgroundGradientTo: Colors.card,
          decimalPlaces: 2,
          color: () => lineColor,
          labelColor: () => Colors.textMuted,
          propsForLabels: {
            fontSize: 10,
            fontFamily: FontFamily.regular,
          },
          strokeWidth: 2,
        }}
        bezier
        style={styles.chart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  price: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
  },
  chart: {
    marginLeft: -16,
    borderRadius: 14,
  },
  empty: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: Spacing.xxxl,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  emptyChart: {
    height: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
  },
});
