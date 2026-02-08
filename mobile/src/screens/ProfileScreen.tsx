import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useProfile, usePortfolioHistory, usePortfolio } from "../hooks/useApi";
import { Colors, Spacing, FontSize, Radius } from "../utils/theme";
import type { SeasonSummary } from "../api/client";

const CHART_HEIGHT = 160;
const CHART_BAR_WIDTH = 4;
const CHART_BAR_GAP = 2;

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

export default function ProfileScreen() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const activeSeasons = profile?.active_seasons ?? [];

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const seasonId = selectedSeasonId || activeSeasons[0]?.id || "";

  const {
    data: history,
    isLoading: historyLoading,
    refetch,
    isRefetching,
  } = usePortfolioHistory(seasonId);

  const { data: portfolioData } = usePortfolio(seasonId);

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
});
