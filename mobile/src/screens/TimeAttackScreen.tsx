import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
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
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useState(() => new RNAnimated.Value(0))[0];

  const showToast = (message: string) => {
    setToast(message);
    toastOpacity.setValue(1);
    setTimeout(() => {
      RNAnimated.timing(toastOpacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => setToast(null));
    }, 4500);
  };

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
        onSuccess: () => {
          showToast("Locked In!");
        },
        onError: (error) => {
          const msg = error.message ?? "";
          if (msg.includes("not currently active") || msg.includes("already made a prediction")) {
            refetch();
          } else {
            Alert.alert("Error", msg);
          }
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

  const toastElement = toast ? (
    <RNAnimated.View style={[styles.toast, { opacity: toastOpacity }]}>
      <Ionicons name="checkmark-circle" size={20} color={Colors.green} />
      <Text style={styles.toastText}>{toast}</Text>
    </RNAnimated.View>
  ) : null;

  const hasActiveWindow = !!currentWindow;
  const hasPicked = !!myPick;

  // Active window, no pick — centered layout (no ScrollView)
  if (hasActiveWindow && !hasPicked) {
    return (
      <View style={styles.container}>
        {toastElement}
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

  // Active window, already picked — no scroll
  if (hasActiveWindow && hasPicked) {
    return (
      <View style={styles.container}>
        {toastElement}
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
            Bounty #{currentWindow!.window_index} — Closes in
          </Text>
          <Text style={styles.timerValue}>{windowEndCountdown}</Text>
        </View>

        {/* SPY chart centered */}
        <View style={styles.lockedChartArea}>
          <SpyChart candles={status?.spy_candles ?? []} openPrice={currentWindow?.spy_open_price} />
        </View>

        {/* Compact locked-in bar at bottom */}
        <View style={styles.lockedBar}>
          <Ionicons name="checkmark-circle" size={24} color={Colors.green} />
          <Text style={styles.lockedBarText}>Locked In</Text>
          <View style={[
            styles.lockedBarBadge,
            { backgroundColor: myPick!.prediction === "UP" ? Colors.green + "20" : Colors.accent + "20" },
          ]}>
            <Ionicons
              name={myPick!.prediction === "UP" ? "arrow-up" : "arrow-down"}
              size={16}
              color={myPick!.prediction === "UP" ? Colors.green : Colors.accent}
            />
            <Text style={{
              color: myPick!.prediction === "UP" ? Colors.green : Colors.accent,
              fontFamily: FontFamily.bold,
              fontSize: FontSize.md,
            }}>
              {myPick!.prediction}
            </Text>
          </View>
          <Text style={styles.lockedBarConfidence}>
            {myPick!.confidence_label}
          </Text>
        </View>

        {/* Previous result inline */}
        {previousWindow && previousWindow.is_settled && previousPick && (
          <View style={styles.prevResultBar}>
            <Text style={styles.prevResultLabel}>Last:</Text>
            <Text style={[
              styles.prevResultPayout,
              { color: (previousPick.payout ?? 0) >= 0 ? Colors.green : Colors.accent },
            ]}>
              {(previousPick.payout ?? 0) >= 0 ? "+" : ""}$${previousPick.payout}
            </Text>
          </View>
        )}
      </View>
    );
  }

  // No active window — no scroll
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

      {/* Previous result card */}
      {previousWindow && previousWindow.is_settled && (
        <View style={styles.resultCardCompact}>
          <Text style={styles.resultCompactLabel}>Last Bounty</Text>
          <View style={[
            styles.resultBadgeInline,
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
          {previousPick && (
            <Text style={[
              styles.resultCompactPayout,
              { color: (previousPick.payout ?? 0) >= 0 ? Colors.green : Colors.accent },
            ]}>
              {(previousPick.payout ?? 0) >= 0 ? "+" : ""}$${previousPick.payout}
            </Text>
          )}
        </View>
      )}

      {/* Centered waiting card */}
      <View style={styles.waitingArea}>
        <Ionicons name="timer-outline" size={48} color={Colors.orange} />
        <Text style={styles.waitingTitle}>Next Bounty</Text>
        <Text style={styles.waitingCountdown}>{nextWindowCountdown || "Calculating..."}</Text>
        <Text style={styles.waitingSubtext}>
          New bounty every 2 minutes. Predict SPY direction!
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  toast: {
    position: "absolute",
    top: Spacing.statusBar + 50,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.green + "40",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    zIndex: 100,
  },
  toastText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
    color: Colors.green,
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

  // ── Locked-in state ──
  lockedChartArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  lockedBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.green + "30",
  },
  lockedBarText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
    color: Colors.green,
  },
  lockedBarBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  lockedBarConfidence: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  prevResultBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingBottom: Spacing.xxxl,
    paddingTop: Spacing.xs,
    backgroundColor: Colors.card,
  },
  prevResultLabel: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  prevResultPayout: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.sm,
  },

  // ── Waiting / no active window ──
  resultCardCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginHorizontal: Spacing.xl,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultCompactLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  resultBadgeInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  resultCompactPayout: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.sm,
    marginLeft: "auto",
  },
  waitingArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  waitingTitle: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginTop: Spacing.lg,
  },
  waitingCountdown: {
    fontSize: FontSize.xxxl,
    fontFamily: FontFamily.bold,
    color: Colors.orange,
    marginTop: Spacing.xs,
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
