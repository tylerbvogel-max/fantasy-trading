import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, FontFamily, FontSize, Spacing, Radius } from "../utils/theme";
import { useBountyStatus } from "../hooks/useApi";
import ProbabilityConeChart from "../components/ProbabilityConeChart";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_WIDTH = SCREEN_WIDTH - Spacing.xl * 2 - Spacing.lg * 2;
const CHART_HEIGHT = 280;

export default function TestChartScreen() {
  const { data: status, isLoading } = useBountyStatus();

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.orange} />
        </View>
      </SafeAreaView>
    );
  }

  const candles = status?.spy_candles ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Probability Cone</Text>

      <View style={styles.card}>
        <ProbabilityConeChart
          candles={candles}
          symbol="SPY"
          name="S&P 500 ETF"
          width={CHART_WIDTH}
          height={CHART_HEIGHT}
        />
      </View>

      <Text style={styles.footnote}>
        Based on historical volatility of candle intervals
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.xl,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  footnote: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: Spacing.md,
  },
});
