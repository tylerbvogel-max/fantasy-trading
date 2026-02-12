import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, FontSize, Radius, FontFamily } from "../utils/theme";
import { useBountyDetailedStats, useBountyStatus } from "../hooks/useApi";

export default function BountyStatsScreen() {
  const { data: stats, isLoading } = useBountyDetailedStats();
  const { data: status } = useBountyStatus();
  const playerStats = status?.player_stats;

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Stats</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.orange} />
        </View>
      </View>
    );
  }

  if (!stats || stats.total_predictions === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Stats</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Ionicons name="stats-chart-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>
            Make your first prediction to see stats.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Stats</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Overview row */}
        <View style={styles.overviewBar}>
          <View style={styles.overviewItem}>
            <Text style={styles.overviewLabel}>$$</Text>
            <Text style={[styles.overviewValue, { color: Colors.yellow }]}>
              {stats.double_dollars.toLocaleString()}
            </Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewItem}>
            <Text style={styles.overviewLabel}>Accuracy</Text>
            <Text style={styles.overviewValue}>{stats.accuracy_pct}%</Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewItem}>
            <Text style={styles.overviewLabel}>Predictions</Text>
            <Text style={styles.overviewValue}>{stats.total_predictions}</Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewItem}>
            <Text style={styles.overviewLabel}>Best Streak</Text>
            <Text style={[styles.overviewValue, { color: Colors.green }]}>
              {stats.best_streak}
            </Text>
          </View>
        </View>

        {/* Board Rank + Weekly Trend row */}
        <View style={styles.twoColRow}>
          <View style={styles.miniCard}>
            <Text style={styles.miniLabel}>Board Rank</Text>
            <Text style={styles.miniValue}>
              {stats.board_rank ? `#${stats.board_rank}` : "—"}
            </Text>
          </View>
          <View style={styles.miniCard}>
            <Text style={styles.miniLabel}>This Week</Text>
            <Text style={[
              styles.miniValue,
              { color: stats.weekly_trend.this_week >= 0 ? Colors.green : Colors.accent },
            ]}>
              {stats.weekly_trend.this_week >= 0 ? "+" : ""}
              $${stats.weekly_trend.this_week}
            </Text>
            {stats.weekly_trend.last_week !== 0 && (
              <Text style={[
                styles.miniTrend,
                { color: stats.weekly_trend.change >= 0 ? Colors.green : Colors.accent },
              ]}>
                {stats.weekly_trend.change >= 0 ? "\u25B2" : "\u25BC"}{" "}
                vs $${stats.weekly_trend.last_week} last wk
              </Text>
            )}
          </View>
        </View>

        {/* Wanted Level XP Bar */}
        <View style={styles.xpCard}>
          <View style={styles.xpHeader}>
            <Text style={styles.xpLabel}>
              Wanted Level {stats.wanted_level_progress.current_level}
            </Text>
            <Text style={styles.xpMax}>
              / {stats.wanted_level_progress.max_level}
            </Text>
          </View>
          <View style={styles.xpBarBg}>
            <View
              style={[
                styles.xpBarFill,
                { width: `${stats.wanted_level_progress.progress_pct}%` },
              ]}
            />
          </View>
          <Text style={styles.xpSubtext}>
            {stats.wanted_level_progress.current_level < stats.wanted_level_progress.max_level
              ? `1 correct pick to Lv.${stats.wanted_level_progress.current_level + 1}`
              : "Max level reached!"}
          </Text>
        </View>

        {/* Confidence Level Win Rates */}
        <View style={styles.statsCard}>
          <Text style={styles.statsCardTitle}>Win Rate by Confidence</Text>
          {stats.confidence_stats.map((cs) => (
            <View key={cs.confidence} style={styles.statRow}>
              <Text style={styles.statRowLabel}>{cs.label}</Text>
              <View style={styles.statBarBg}>
                <View
                  style={[
                    styles.statBarFill,
                    {
                      width: `${Math.min(cs.win_rate, 100)}%`,
                      backgroundColor:
                        cs.confidence === 3 ? Colors.orange :
                        cs.confidence === 2 ? Colors.yellow :
                        Colors.textSecondary,
                    },
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
          {stats.time_slot_stats.map((ts) => (
            <View key={ts.window_index} style={styles.statRow}>
              <Text style={styles.statRowLabel}>{ts.time_label}</Text>
              <View style={styles.statBarBg}>
                <View
                  style={[
                    styles.statBarFill,
                    {
                      width: `${Math.min(ts.win_rate, 100)}%`,
                      backgroundColor: Colors.primary,
                    },
                  ]}
                />
              </View>
              <Text style={styles.statRowValue}>
                {ts.total > 0 ? `${ts.win_rate}%` : "—"}
              </Text>
            </View>
          ))}
        </View>
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
    gap: Spacing.lg,
  },
  emptyText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    textAlign: "center",
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  overviewBar: {
    flexDirection: "row",
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    justifyContent: "space-between",
    alignItems: "center",
  },
  overviewItem: {
    alignItems: "center",
    flex: 1,
  },
  overviewLabel: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  overviewValue: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  overviewDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
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
    width: 100,
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
