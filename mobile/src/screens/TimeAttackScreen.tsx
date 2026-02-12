import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, FontSize, Radius, FontFamily } from "../utils/theme";
import { useBountyStatus, useSubmitPrediction } from "../hooks/useApi";
import SpyChart from "../components/SpyChart";
import SwipeCard from "../components/SwipeCard";

const CONFIDENCE_OPTIONS = [
  { value: 1, label: "Draw", description: "$$100", color: Colors.text, bgColor: Colors.surface },
  { value: 2, label: "Quick Draw", description: "$$200", color: Colors.yellow, bgColor: Colors.yellow + "20" },
  { value: 3, label: "Dead Eye", description: "$$300", color: Colors.orange, bgColor: Colors.orange + "20" },
];

function useCountdown(targetTime: string | null) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!targetTime) {
      setTimeLeft("");
      return;
    }

    const update = () => {
      const now = Date.now();
      const target = new Date(targetTime).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft("Starting...");
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  return timeLeft;
}

export default function TimeAttackScreen() {
  const { data: status, isLoading, isError, refetch } = useBountyStatus();
  const submitPrediction = useSubmitPrediction();
  const [confidence, setConfidence] = useState(1);

  const currentWindow = status?.current_window;
  const previousWindow = status?.previous_window;
  const myPick = status?.my_pick;
  const previousPick = status?.previous_pick;
  const stats = status?.player_stats;

  const windowEndCountdown = useCountdown(currentWindow?.end_time ?? null);
  const nextWindowCountdown = useCountdown(
    !currentWindow ? status?.next_window_time ?? null : null
  );

  const handleSwipe = (prediction: "UP" | "DOWN") => {
    if (!currentWindow) return;

    submitPrediction.mutate(
      {
        bounty_window_id: currentWindow.id,
        prediction,
        confidence,
      },
      {
        onSuccess: (data) => {
          Alert.alert("Locked In!", data.message);
        },
        onError: (error) => {
          Alert.alert("Error", error.message);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Time Attack</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.orange} />
        </View>
      </View>
    );
  }

  if (isError || !status) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Time Attack</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>
            Could not load bounty data.{"\n"}The server may be waking up.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const hasActiveWindow = !!currentWindow;
  const hasPicked = !!myPick;

  // Active window, no pick — centered layout (no ScrollView)
  if (hasActiveWindow && !hasPicked) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Time Attack</Text>
        </View>

        {/* Compact stats row */}
        {stats && (
          <View style={styles.compactStatsRow}>
            <Text style={styles.compactStat}>
              <Text style={{ color: Colors.yellow }}>$$</Text> {stats.double_dollars.toLocaleString()}
            </Text>
            <Text style={styles.compactStatDivider}>|</Text>
            <Text style={styles.compactStat}>
              <Text style={{ color: Colors.orange }}>Lv.{stats.wanted_level}</Text>
            </Text>
            <Text style={styles.compactStatDivider}>|</Text>
            <Text style={styles.compactStat}>{stats.accuracy_pct}%</Text>
          </View>
        )}

        {/* Timer */}
        <View style={styles.timerRow}>
          <Text style={styles.timerLabel}>
            Bounty #{currentWindow.window_index} — Closes in
          </Text>
          <Text style={styles.timerValue}>{windowEndCountdown}</Text>
        </View>

        {/* Swipe card with chart — centered in remaining space */}
        <View style={styles.swipeArea}>
          <SwipeCard
            onSwipeRight={() => handleSwipe("UP")}
            onSwipeLeft={() => handleSwipe("DOWN")}
            enabled={!submitPrediction.isPending}
            candles={status?.spy_candles ?? []}
            openPrice={currentWindow.spy_open_price}
          />
        </View>

        {/* Confidence selector — compact at bottom */}
        <View style={styles.confidenceBar}>
          {CONFIDENCE_OPTIONS.map((opt) => {
            const isSelected = confidence === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.confButton,
                  isSelected && { backgroundColor: opt.bgColor },
                ]}
                onPress={() => setConfidence(opt.value)}
              >
                <Text style={[
                  styles.confLabel,
                  { color: isSelected ? opt.color : Colors.textMuted },
                ]}>
                  {opt.label}
                </Text>
                <Text style={[
                  styles.confDesc,
                  { color: isSelected ? opt.color : Colors.textMuted, opacity: isSelected ? 0.7 : 0.5 },
                ]}>
                  {opt.description}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  // All other states — scrollable
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Time Attack</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Stats bar */}
        {stats && (
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>$$</Text>
              <Text style={[styles.statValue, { color: Colors.yellow }]}>
                {stats.double_dollars.toLocaleString()}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Wanted</Text>
              <Text style={[styles.statValue, { color: Colors.orange }]}>
                Lv.{stats.wanted_level}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Accuracy</Text>
              <Text style={styles.statValue}>{stats.accuracy_pct}%</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Best</Text>
              <Text style={[styles.statValue, { color: Colors.green }]}>
                {stats.best_streak}
              </Text>
            </View>
          </View>
        )}

        {/* Previous result card */}
        {previousWindow && previousWindow.is_settled && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>Last Bounty</Text>
              <View style={[
                styles.resultBadge,
                { backgroundColor: previousWindow.result === "UP" ? Colors.green + "20" : Colors.accent + "20" },
              ]}>
                <Ionicons
                  name={previousWindow.result === "UP" ? "arrow-up" : "arrow-down"}
                  size={14}
                  color={previousWindow.result === "UP" ? Colors.green : Colors.accent}
                />
                <Text style={{
                  color: previousWindow.result === "UP" ? Colors.green : Colors.accent,
                  fontFamily: FontFamily.bold,
                  fontSize: FontSize.sm,
                }}>
                  {previousWindow.result}
                </Text>
              </View>
            </View>
            {previousPick && (
              <View style={styles.resultDetails}>
                <Text style={styles.resultDetailText}>
                  You picked {previousPick.prediction} ({previousPick.confidence_label})
                </Text>
                <Text style={[
                  styles.resultPayout,
                  { color: (previousPick.payout ?? 0) >= 0 ? Colors.green : Colors.accent },
                ]}>
                  {(previousPick.payout ?? 0) >= 0 ? "+" : ""}$${previousPick.payout}
                </Text>
              </View>
            )}
            {!previousPick && (
              <Text style={styles.resultMissed}>You didn't pick this bounty</Text>
            )}
          </View>
        )}

        {/* Active window, already picked */}
        {hasActiveWindow && hasPicked && (
          <>
            <View style={styles.windowInfo}>
              <Text style={styles.windowLabel}>
                Bounty #{currentWindow!.window_index} — Closes in
              </Text>
              <Text style={styles.countdown}>{windowEndCountdown}</Text>
            </View>

            <SpyChart candles={status?.spy_candles ?? []} openPrice={currentWindow?.spy_open_price} />

            <View style={styles.lockedCard}>
              <Ionicons name="checkmark-circle" size={48} color={Colors.green} />
              <Text style={styles.lockedTitle}>Locked In!</Text>
              <View style={styles.lockedDetails}>
                <View style={[
                  styles.predictionBadge,
                  { backgroundColor: myPick!.prediction === "UP" ? Colors.green + "20" : Colors.accent + "20" },
                ]}>
                  <Ionicons
                    name={myPick!.prediction === "UP" ? "arrow-up" : "arrow-down"}
                    size={20}
                    color={myPick!.prediction === "UP" ? Colors.green : Colors.accent}
                  />
                  <Text style={{
                    color: myPick!.prediction === "UP" ? Colors.green : Colors.accent,
                    fontFamily: FontFamily.bold,
                    fontSize: FontSize.lg,
                  }}>
                    {myPick!.prediction}
                  </Text>
                </View>
                <Text style={styles.lockedConfidence}>
                  {myPick!.confidence_label}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* No active window — show countdown */}
        {!hasActiveWindow && (
          <View style={styles.waitingCard}>
            <Ionicons name="timer-outline" size={48} color={Colors.orange} />
            <Text style={styles.waitingTitle}>Next Bounty</Text>
            <Text style={styles.countdown}>{nextWindowCountdown || "Calculating..."}</Text>
            <Text style={styles.waitingSubtext}>
              New bounty every 2 minutes. Predict SPY direction!
            </Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.statusBar,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  retryButton: {
    backgroundColor: Colors.orange,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  retryText: {
    color: Colors.text,
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
  },

  // ── Compact prediction layout (no scroll) ──
  compactStatsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  compactStat: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  compactStatDivider: {
    color: Colors.border,
    fontSize: FontSize.sm,
  },
  timerRow: {
    alignItems: "center",
    paddingBottom: Spacing.sm,
  },
  timerLabel: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
  },
  timerValue: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.orange,
    marginTop: 2,
  },
  swipeArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  confidenceBar: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    paddingTop: Spacing.md,
  },
  confButton: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  confLabel: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
  },
  confDesc: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    marginTop: 1,
  },

  // ── Scrollable content (other states) ──
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  statsBar: {
    flexDirection: "row",
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    justifyContent: "space-between",
    alignItems: "center",
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statLabel: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  statValue: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
  },
  resultCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  resultTitle: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  resultBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  resultDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultDetailText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
  },
  resultPayout: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
  },
  resultMissed: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
  },
  windowInfo: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  windowLabel: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
  },
  countdown: {
    fontSize: FontSize.xxxl,
    fontFamily: FontFamily.bold,
    color: Colors.orange,
    marginTop: Spacing.xs,
  },
  lockedCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.xxxl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.green + "30",
    marginTop: Spacing.lg,
  },
  lockedTitle: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.green,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  lockedDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  predictionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  lockedConfidence: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.textSecondary,
  },
  waitingCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.xxxl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.orange + "30",
    marginTop: Spacing.xxl,
  },
  waitingTitle: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginTop: Spacing.lg,
  },
  waitingSubtext: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: Spacing.lg,
    lineHeight: 20,
  },
});
