import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useProfile,
  usePortfolioHistory,
  usePortfolio,
  usePortfolioAnalytics,
  useSeasonPlayers,
} from "../hooks/useApi";
import { Colors, Spacing, FontSize, Radius } from "../utils/theme";
import { signOut } from "../api/client";
import type { SeasonSummary, BenchmarkAnalytics } from "../api/client";
import { useMode, type AppMode } from "../contexts/ModeContext";

const CHART_HEIGHT = 160;
const CHART_BAR_WIDTH = 4;
const CHART_BAR_GAP = 2;

const MODE_META: Record<AppMode, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  classroom: { icon: "school-outline", color: Colors.primary, label: "Classroom" },
  league: { icon: "trophy-outline", color: Colors.yellow, label: "League" },
  arena: { icon: "flash-outline", color: Colors.accent, label: "Arena" },
};

function MiniChart({
  data,
}: {
  data: { date: string; total_value: number; percent_gain: number }[];
}) {
  if (data.length === 0) return null;

  const values = data.map((d) => d.total_value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // Determine overall trend for color
  const startValue = values[0];
  const endValue = values[values.length - 1];
  const barColor = endValue >= startValue ? Colors.green : Colors.red;

  const firstDate = data[0].date;
  const lastDate = data[data.length - 1].date;

  return (
    <View>
      <View style={styles.chartContainer}>
        {/* Y-axis labels */}
        <View style={styles.yAxis}>
          <Text style={styles.axisLabel}>
            ${max >= 1000 ? `${(max / 1000).toFixed(1)}k` : max.toFixed(0)}
          </Text>
          <Text style={styles.axisLabel}>
            ${min >= 1000 ? `${(min / 1000).toFixed(1)}k` : min.toFixed(0)}
          </Text>
        </View>

        {/* Bars */}
        <View style={styles.chartBars}>
          {data.map((point, i) => {
            const height =
              ((point.total_value - min) / range) * (CHART_HEIGHT - 20) + 4;
            return (
              <View
                key={point.date}
                style={[
                  styles.chartBar,
                  {
                    height,
                    backgroundColor: barColor,
                    opacity: 0.4 + (i / data.length) * 0.6,
                  },
                ]}
              />
            );
          })}
        </View>
      </View>

      {/* X-axis labels */}
      <View style={styles.xAxis}>
        <Text style={styles.axisLabel}>{formatDate(firstDate)}</Text>
        <Text style={styles.axisLabel}>{formatDate(lastDate)}</Text>
      </View>
    </View>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function BetaColorDot({ beta }: { beta: number }) {
  const color =
    beta > 1.2 ? Colors.orange : beta < 0.8 ? Colors.primary : Colors.green;
  return <View style={[styles.betaDot, { backgroundColor: color }]} />;
}

function BenchmarkCard({ data }: { data: BenchmarkAnalytics }) {
  const hasSufficientData = data.data_points >= 20;

  return (
    <View style={styles.benchmarkCard}>
      <Text style={styles.benchmarkTitle}>vs {data.benchmark_name} ({data.benchmark})</Text>
      {hasSufficientData ? (
        <>
          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Beta</Text>
              <View style={styles.metricValueRow}>
                <BetaColorDot beta={data.beta} />
                <Text style={styles.metricValue}>{data.beta.toFixed(2)}</Text>
              </View>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Alpha</Text>
              <Text
                style={[
                  styles.metricValue,
                  { color: data.alpha >= 0 ? Colors.green : Colors.red },
                ]}
              >
                {data.alpha >= 0 ? "+" : ""}
                {data.alpha.toFixed(1)}%
              </Text>
            </View>
          </View>
          <Text style={styles.interpretationText}>{data.beta_interpretation}</Text>
          <Text style={styles.interpretationText}>{data.alpha_interpretation}</Text>
          <Text style={styles.dataPointsText}>Based on {data.data_points} trading days</Text>
        </>
      ) : (
        <Text style={styles.insufficientText}>
          {data.data_points} of 20 trading days collected
        </Text>
      )}
    </View>
  );
}

export default function ProfileScreen() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { mode, clearMode } = useMode();
  const activeSeasons = profile?.active_seasons ?? [];

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const [analyticsExpanded, setAnalyticsExpanded] = useState(false);
  const [comparePlayer, setComparePlayer] = useState<string | undefined>(undefined);
  const seasonId = selectedSeasonId || activeSeasons[0]?.id || "";

  const handleSwitchMode = () => {
    Alert.alert(
      "Switch Mode?",
      "You'll return to the mode selection screen. Your progress is saved.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Switch", onPress: () => clearMode() },
      ]
    );
  };

  const {
    data: history,
    isLoading: historyLoading,
    refetch,
    isRefetching,
  } = usePortfolioHistory(seasonId);

  const { data: portfolioData } = usePortfolio(seasonId);
  const { data: analytics, isLoading: analyticsLoading } = usePortfolioAnalytics(
    analyticsExpanded ? seasonId : "",
    comparePlayer
  );
  const { data: seasonPlayers } = useSeasonPlayers(seasonId);

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => signOut() },
    ]);
  };

  if (profileLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  const renderSeasonPill = (season: SeasonSummary) => {
    const isSelected = season.id === seasonId;
    return (
      <TouchableOpacity
        key={season.id}
        style={[styles.seasonPill, isSelected && styles.seasonPillActive]}
        onPress={() => setSelectedSeasonId(season.id)}
      >
        <Text
          style={[
            styles.seasonPillText,
            isSelected && styles.seasonPillTextActive,
          ]}
        >
          {season.season_type === "open" ? "🌐" : "🎯"} {season.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderHistoryRow = ({
    item,
  }: {
    item: { date: string; total_value: number; percent_gain: number };
  }) => {
    const isPositive = item.percent_gain >= 0;
    return (
      <View style={styles.historyRow}>
        <Text style={styles.historyDate}>{formatDate(item.date)}</Text>
        <Text style={styles.historyValue}>
          ${item.total_value.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </Text>
        <Text
          style={[
            styles.historyGain,
            { color: isPositive ? Colors.green : Colors.red },
          ]}
        >
          {isPositive ? "+" : ""}
          {item.percent_gain.toFixed(2)}%
        </Text>
      </View>
    );
  };

  // Compute stats from history data
  const startingValue = history && history.length > 0 ? history[0].total_value : null;
  const latestValue =
    history && history.length > 0 ? history[history.length - 1].total_value : null;
  const totalReturn =
    history && history.length > 0 ? history[history.length - 1].percent_gain : null;

  const ListHeader = () => (
    <View>
      {/* User info card */}
      <View style={styles.userCard}>
        <View style={styles.userAvatar}>
          <Ionicons name="person" size={32} color={Colors.primary} />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{profile?.alias ?? "—"}</Text>
          <Text style={styles.userMeta}>
            {activeSeasons.length} active{" "}
            {activeSeasons.length === 1 ? "season" : "seasons"}
          </Text>
          {profile?.created_at && (
            <Text style={styles.userMeta}>
              Joined {formatDate(profile.created_at.split("T")[0])}
            </Text>
          )}
        </View>
      </View>

      {/* Mode indicator */}
      {mode && (
        <View style={styles.modeCard}>
          <View style={styles.modeCardLeft}>
            <View style={[styles.modeIconCircle, { backgroundColor: MODE_META[mode].color + "20" }]}>
              <Ionicons name={MODE_META[mode].icon} size={20} color={MODE_META[mode].color} />
            </View>
            <Text style={[styles.modeLabel, { color: MODE_META[mode].color }]}>
              {MODE_META[mode].label}
            </Text>
          </View>
          <TouchableOpacity onPress={handleSwitchMode}>
            <Text style={styles.modeSwitchText}>Switch Mode</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Season selector */}
      {activeSeasons.length > 1 && (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={activeSeasons}
          renderItem={({ item }) => renderSeasonPill(item)}
          keyExtractor={(item) => item.id}
          style={styles.seasonSelector}
          contentContainerStyle={styles.seasonSelectorContent}
        />
      )}

      {activeSeasons.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="enter-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No active seasons</Text>
          <Text style={styles.emptySubtext}>
            Join a season from the Home tab to see your performance
          </Text>
        </View>
      ) : (
        <>
          {/* Chart card */}
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>Portfolio History</Text>
            {historyLoading ? (
              <View style={styles.chartPlaceholder}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : history && history.length > 1 ? (
              <MiniChart data={history} />
            ) : (
              <View style={styles.chartPlaceholder}>
                <Ionicons
                  name="analytics-outline"
                  size={32}
                  color={Colors.textMuted}
                />
                <Text style={styles.chartPlaceholderText}>
                  History builds as daily snapshots are captured
                </Text>
              </View>
            )}
          </View>

          {/* Stats row */}
          {startingValue != null && (
            <View style={styles.statsRow}>
              <View style={styles.statCol}>
                <Text style={styles.statLabel}>Starting</Text>
                <Text style={styles.statValue}>
                  ${startingValue.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>
              </View>
              <View style={[styles.statCol, styles.statColCenter]}>
                <Text style={styles.statLabel}>Current</Text>
                <Text style={styles.statValue}>
                  ${(portfolioData?.total_value ?? latestValue ?? 0).toLocaleString(
                    undefined,
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                  )}
                </Text>
              </View>
              <View style={styles.statCol}>
                <Text style={styles.statLabel}>Return</Text>
                <Text
                  style={[
                    styles.statValue,
                    {
                      color:
                        (totalReturn ?? 0) >= 0 ? Colors.green : Colors.red,
                    },
                  ]}
                >
                  {(totalReturn ?? 0) >= 0 ? "+" : ""}
                  {(totalReturn ?? 0).toFixed(2)}%
                </Text>
              </View>
            </View>
          )}

          {/* Analytics toggle */}
          <TouchableOpacity
            style={styles.analyticsToggle}
            onPress={() => setAnalyticsExpanded(!analyticsExpanded)}
          >
            <View style={styles.analyticsToggleLeft}>
              <Ionicons name="analytics" size={20} color={Colors.yellow} />
              <Text style={styles.analyticsToggleText}>Portfolio Analytics</Text>
            </View>
            <Ionicons
              name={analyticsExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={Colors.textMuted}
            />
          </TouchableOpacity>

          {/* Analytics expanded section */}
          {analyticsExpanded && (
            <View style={styles.analyticsSection}>
              {analyticsLoading ? (
                <View style={styles.analyticsLoading}>
                  <ActivityIndicator color={Colors.primary} />
                  <Text style={styles.analyticsLoadingText}>Calculating...</Text>
                </View>
              ) : analytics?.insufficient_data && analytics.days_available < 2 ? (
                <View style={styles.insufficientBanner}>
                  <Ionicons name="time-outline" size={24} color={Colors.yellow} />
                  <Text style={styles.insufficientBannerText}>
                    Need 20+ trading days for analysis.{"\n"}
                    You have {analytics.days_available} so far.
                  </Text>
                </View>
              ) : (
                <>
                  {analytics?.benchmarks.map((b) => (
                    <BenchmarkCard key={b.benchmark} data={b} />
                  ))}

                  {/* Player comparison */}
                  {seasonPlayers && seasonPlayers.length > 0 && (
                    <View style={styles.comparisonSection}>
                      <Text style={styles.comparisonTitle}>Compare vs Player</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.playerPills}
                        contentContainerStyle={styles.playerPillsContent}
                      >
                        {seasonPlayers.map((alias) => (
                          <TouchableOpacity
                            key={alias}
                            style={[
                              styles.playerPill,
                              comparePlayer === alias && styles.playerPillActive,
                            ]}
                            onPress={() =>
                              setComparePlayer(comparePlayer === alias ? undefined : alias)
                            }
                          >
                            <Text
                              style={[
                                styles.playerPillText,
                                comparePlayer === alias && styles.playerPillTextActive,
                              ]}
                            >
                              {alias}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>

                      {analytics?.player_comparison && (
                        <View style={styles.benchmarkCard}>
                          <Text style={styles.benchmarkTitle}>
                            vs {analytics.player_comparison.compare_alias}
                          </Text>
                          {analytics.player_comparison.data_points >= 20 ? (
                            <>
                              <View style={styles.metricsRow}>
                                <View style={styles.metricBox}>
                                  <Text style={styles.metricLabel}>Beta</Text>
                                  <View style={styles.metricValueRow}>
                                    <BetaColorDot beta={analytics.player_comparison.beta} />
                                    <Text style={styles.metricValue}>
                                      {analytics.player_comparison.beta.toFixed(2)}
                                    </Text>
                                  </View>
                                </View>
                                <View style={styles.metricBox}>
                                  <Text style={styles.metricLabel}>Alpha</Text>
                                  <Text
                                    style={[
                                      styles.metricValue,
                                      {
                                        color:
                                          analytics.player_comparison.alpha >= 0
                                            ? Colors.green
                                            : Colors.red,
                                      },
                                    ]}
                                  >
                                    {analytics.player_comparison.alpha >= 0 ? "+" : ""}
                                    {analytics.player_comparison.alpha.toFixed(1)}%
                                  </Text>
                                </View>
                              </View>
                              <Text style={styles.interpretationText}>
                                {analytics.player_comparison.beta_interpretation}
                              </Text>
                              <Text style={styles.interpretationText}>
                                {analytics.player_comparison.alpha_interpretation}
                              </Text>
                              <Text style={styles.dataPointsText}>
                                Based on {analytics.player_comparison.data_points} trading days
                              </Text>
                            </>
                          ) : (
                            <Text style={styles.insufficientText}>
                              {analytics.player_comparison.alpha_interpretation ||
                                `${analytics.player_comparison.data_points} of 20 trading days collected`}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          {/* Daily values header */}
          {history && history.length > 0 && (
            <View style={styles.dailyHeader}>
              <Text style={styles.sectionTitle}>Daily Values</Text>
              <Text style={styles.dailyCount}>{history.length} days</Text>
            </View>
          )}
        </>
      )}
    </View>
  );

  // Show history in reverse chronological order
  const reversedHistory = history ? [...history].reverse() : [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <FlatList
        data={activeSeasons.length > 0 ? reversedHistory : []}
        renderItem={renderHistoryRow}
        keyExtractor={(item) => item.date}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={Colors.red} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Colors.primary}
          />
        }
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
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
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: "700",
    color: Colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  userInfo: {
    marginLeft: Spacing.lg,
    flex: 1,
  },
  userName: {
    fontSize: FontSize.xl,
    fontWeight: "700",
    color: Colors.text,
  },
  userMeta: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  seasonSelector: {
    maxHeight: 44,
    marginBottom: Spacing.md,
  },
  seasonSelectorContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  seasonPill: {
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  seasonPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  seasonPillText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  seasonPillTextActive: {
    color: Colors.text,
  },
  chartCard: {
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  chartContainer: {
    flexDirection: "row",
    height: CHART_HEIGHT,
  },
  yAxis: {
    justifyContent: "space-between",
    marginRight: Spacing.sm,
    paddingVertical: 2,
  },
  axisLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  chartBars: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: CHART_BAR_GAP,
  },
  chartBar: {
    width: CHART_BAR_WIDTH,
    borderRadius: 2,
  },
  xAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.xs,
  },
  chartPlaceholder: {
    height: CHART_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
  },
  chartPlaceholderText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
  },
  statCol: {
    flex: 1,
    alignItems: "center",
  },
  statColCenter: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.border,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: "600",
  },
  statValue: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  dailyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  dailyCount: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.md,
  },
  historyDate: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    width: 70,
  },
  historyValue: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
  },
  historyGain: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    width: 70,
    textAlign: "right",
  },
  separator: {
    height: Spacing.sm,
  },
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    paddingTop: Spacing.xxxl,
    paddingHorizontal: Spacing.xl,
  },
  emptyText: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: "center",
  },
  analyticsToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  analyticsToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  analyticsToggleText: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
  },
  analyticsSection: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  analyticsLoading: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  analyticsLoadingText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  insufficientBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
  },
  insufficientBannerText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  benchmarkCard: {
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
  },
  benchmarkTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  metricsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  metricBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: Radius.md,
    alignItems: "center",
  },
  metricLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  metricValue: {
    fontSize: FontSize.xl,
    fontWeight: "700",
    color: Colors.text,
  },
  metricValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  betaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  interpretationText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  dataPointsText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  insufficientText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  comparisonSection: {
    marginTop: Spacing.sm,
  },
  comparisonTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  playerPills: {
    maxHeight: 40,
    marginBottom: Spacing.md,
  },
  playerPillsContent: {
    gap: Spacing.sm,
  },
  playerPill: {
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  playerPillActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  playerPillText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  playerPillTextActive: {
    color: Colors.text,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    marginTop: Spacing.xxl,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logoutText: {
    fontSize: FontSize.md,
    fontWeight: "600",
    color: Colors.red,
  },
  modeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  modeIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  modeLabel: {
    fontSize: FontSize.md,
    fontWeight: "700",
  },
  modeSwitchText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
});
