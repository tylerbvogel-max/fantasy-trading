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
import { useBountyStatus, useSubmitPrediction, useBountyDetailedStats } from "../hooks/useApi";
import SpyChart from "../components/SpyChart";
import SwipeCard from "../components/SwipeCard";

const CONFIDENCE_OPTIONS = [
  { value: 1, label: "Draw", description: "$$100 / -$$50", color: Colors.textSecondary },
  { value: 2, label: "Quick Draw", description: "$$200 / -$$100", color: Colors.yellow },
  { value: 3, label: "Dead Eye", description: "$$300 / -$$150", color: Colors.orange },
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
  const { data: detailedStats } = useBountyDetailedStats();
  const submitPrediction = useSubmitPrediction();
  const [confidence, setConfidence] = useState(1);

  const currentWindow = status?.current_window;
  const previousWindow = status?.previous_window;
  const myPick = status?.my_pick;
  const previousPick = status?.previous_pick;
  const stats = status?.player_stats;

  const windowEndCountdown = useCountdown(currentWindow?.end_time ?? null);
  const predictionCutoffCountdown = useCountdown(currentWindow?.prediction_cutoff ?? null);
  const nextWindowCountdown = useCountdown(
    !currentWindow ? status?.next_window_time ?? null : null
  );

  // Prediction cutoff disabled for beta testing
  const predictionsClosed = false;

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
          <Text style={{ color: Colors.textMuted, fontFamily: FontFamily.regular, fontSize: FontSize.md, textAlign: "center", marginBottom: Spacing.lg }}>
            Could not load bounty data.{"\n"}The server may be waking up.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: Colors.orange, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.lg }}
            onPress={() => refetch()}
          >
            <Text style={{ color: Colors.text, fontFamily: FontFamily.bold, fontSize: FontSize.md }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const hasActiveWindow = !!currentWindow;
  const hasPicked = !!myPick;

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

        {/* Active window with no pick */}
        {hasActiveWindow && !hasPicked && (
          <>
            <View style={styles.windowInfo}>
              {predictionsClosed ? (
                <>
                  <Text style={styles.windowLabel}>
                    Bounty #{currentWindow!.window_index} — Picks locked, settles in
                  </Text>
                  <Text style={styles.countdown}>{windowEndCountdown}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.windowLabel}>
                    Bounty #{currentWindow!.window_index} — Pick closes in
                  </Text>
                  <Text style={styles.countdown}>{predictionCutoffCountdown}</Text>
                </>
              )}
            </View>

            <SpyChart candles={status?.spy_candles ?? []} />

            {predictionsClosed ? (
              <View style={styles.lockedCard}>
                <Ionicons name="time-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.lockedTitle}>Picks Locked</Text>
                <Text style={styles.missedText}>
                  You missed this window. Next bounty opens soon.
                </Text>
              </View>
            ) : (
              <>
                {/* Confidence selector */}
                <View style={styles.confidenceSection}>
                  <Text style={styles.confidenceTitle}>Confidence Level</Text>
                  <View style={styles.confidenceRow}>
                    {CONFIDENCE_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.confidenceButton,
                          confidence === opt.value && styles.confidenceButtonActive,
                          confidence === opt.value && { borderColor: opt.color },
                        ]}
                        onPress={() => setConfidence(opt.value)}
                      >
                        <Text style={[
                          styles.confidenceLabel,
                          confidence === opt.value && { color: opt.color },
                        ]}>
                          {opt.label}
                        </Text>
                        <Text style={styles.confidenceDesc}>{opt.description}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <SwipeCard
                  onSwipeUp={() => handleSwipe("UP")}
                  onSwipeDown={() => handleSwipe("DOWN")}
                  enabled={!submitPrediction.isPending}
                />
              </>
            )}
          </>
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

            <SpyChart candles={status?.spy_candles ?? []} />

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
              Bounties run every 2 hours, 9 AM - 9 PM ET, weekdays.{"\n"}
              You have 90 minutes to lock in your pick.
            </Text>
          </View>
        )}

        {/* Detailed Stats Section */}
        {detailedStats && detailedStats.total_predictions > 0 && (
          <View style={styles.detailedStatsSection}>
            <Text style={styles.sectionTitle}>Your Stats</Text>

            {/* Wanted Level XP Bar */}
            <View style={styles.xpCard}>
              <View style={styles.xpHeader}>
                <Text style={styles.xpLabel}>
                  Wanted Level {detailedStats.wanted_level_progress.current_level}
                </Text>
                <Text style={styles.xpMax}>
                  / {detailedStats.wanted_level_progress.max_level}
                </Text>
              </View>
              <View style={styles.xpBarBg}>
                <View
                  style={[
                    styles.xpBarFill,
                    { width: `${detailedStats.wanted_level_progress.progress_pct}%` },
                  ]}
                />
              </View>
              <Text style={styles.xpSubtext}>
                {detailedStats.wanted_level_progress.current_level < detailedStats.wanted_level_progress.max_level
                  ? `1 correct pick to Lv.${detailedStats.wanted_level_progress.current_level + 1}`
                  : "Max level reached!"}
              </Text>
            </View>

            {/* Board Rank + Weekly Trend row */}
            <View style={styles.twoColRow}>
              <View style={styles.miniCard}>
                <Text style={styles.miniLabel}>Board Rank</Text>
                <Text style={styles.miniValue}>
                  {detailedStats.board_rank ? `#${detailedStats.board_rank}` : "—"}
                </Text>
              </View>
              <View style={styles.miniCard}>
                <Text style={styles.miniLabel}>This Week</Text>
                <Text style={[
                  styles.miniValue,
                  { color: detailedStats.weekly_trend.this_week >= 0 ? Colors.green : Colors.accent },
                ]}>
                  {detailedStats.weekly_trend.this_week >= 0 ? "+" : ""}
                  $${detailedStats.weekly_trend.this_week}
                </Text>
                {detailedStats.weekly_trend.last_week !== 0 && (
                  <Text style={[
                    styles.miniTrend,
                    { color: detailedStats.weekly_trend.change >= 0 ? Colors.green : Colors.accent },
                  ]}>
                    {detailedStats.weekly_trend.change >= 0 ? "\u25B2" : "\u25BC"}{" "}
                    vs $${detailedStats.weekly_trend.last_week} last wk
                  </Text>
                )}
              </View>
            </View>

            {/* Confidence Level Win Rates */}
            <View style={styles.statsCard}>
              <Text style={styles.statsCardTitle}>Win Rate by Confidence</Text>
              {detailedStats.confidence_stats.map((cs) => (
                <View key={cs.confidence} style={styles.statRow}>
                  <Text style={styles.statRowLabel}>{cs.label}</Text>
                  <View style={styles.statBarBg}>
                    <View
                      style={[
                        styles.statBarFill,
                        { width: `${Math.min(cs.win_rate, 100)}%`, backgroundColor: cs.confidence === 3 ? Colors.orange : cs.confidence === 2 ? Colors.yellow : Colors.textSecondary },
                      ]}
                    />
                  </View>
                  <Text style={styles.statRowValue}>
                    {cs.total > 0 ? `${cs.win_rate}%` : "—"}
                  </Text>
                </View>
              ))}
            </View>

            {/* Time Slot Win Rates */}
            <View style={styles.statsCard}>
              <Text style={styles.statsCardTitle}>Win Rate by Time Slot</Text>
              {detailedStats.time_slot_stats.map((ts) => (
                <View key={ts.window_index} style={styles.statRow}>
                  <Text style={styles.statRowLabel}>{ts.time_label}</Text>
                  <View style={styles.statBarBg}>
                    <View
                      style={[
                        styles.statBarFill,
                        { width: `${Math.min(ts.win_rate, 100)}%`, backgroundColor: Colors.primary },
                      ]}
                    />
                  </View>
                  <Text style={styles.statRowValue}>
                    {ts.total > 0 ? `${ts.win_rate}%` : "—"}
                  </Text>
                </View>
              ))}
            </View>
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
    paddingBottom: Spacing.md,
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
  confidenceSection: {
    marginBottom: Spacing.md,
  },
  confidenceTitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  confidenceRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  confidenceButton: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  confidenceButtonActive: {
    borderWidth: 2,
    backgroundColor: Colors.cardLight,
  },
  confidenceLabel: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  confidenceDesc: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
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
  missedText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: Spacing.sm,
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
  detailedStatsSection: {
    marginTop: Spacing.xxl,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  xpCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.orange + "30",
  },
  xpHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: Spacing.sm,
  },
  xpLabel: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.orange,
  },
  xpMax: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginLeft: Spacing.xs,
  },
  xpBarBg: {
    height: 10,
    backgroundColor: Colors.surface,
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  xpBarFill: {
    height: 10,
    backgroundColor: Colors.orange,
    borderRadius: 5,
  },
  xpSubtext: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
  },
  twoColRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  miniCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  miniLabel: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  miniValue: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  miniTrend: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    marginTop: Spacing.xs,
  },
  statsCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statsCardTitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  statRowLabel: {
    width: 80,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
  },
  statBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surface,
    borderRadius: 3,
    overflow: "hidden",
    marginHorizontal: Spacing.sm,
  },
  statBarFill: {
    height: 6,
    borderRadius: 3,
  },
  statRowValue: {
    width: 40,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: Colors.textSecondary,
    textAlign: "right",
  },
});
