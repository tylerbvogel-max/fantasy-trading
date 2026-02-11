import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Modal,
  type LayoutChangeEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useProfile, usePortfolio, usePortfolioHistory } from "../hooks/useApi";
import { Colors, Spacing, FontSize, Radius, FontFamily } from "../utils/theme";
import { useMode } from "../contexts/ModeContext";
import type { HoldingResponse, SeasonSummary } from "../api/client";

const CHART_HEIGHT = 160;
const CHART_BAR_WIDTH = 4;
const CHART_BAR_GAP = 2;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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

  const startValue = values[0];
  const endValue = values[values.length - 1];
  const barColor = endValue >= startValue ? Colors.green : Colors.red;

  const firstDate = data[0].date;
  const lastDate = data[data.length - 1].date;

  return (
    <View>
      <View style={styles.chartContainer}>
        <View style={styles.yAxis}>
          <Text style={styles.axisLabel}>
            ${max >= 1000 ? `${(max / 1000).toFixed(1)}k` : max.toFixed(0)}
          </Text>
          <Text style={styles.axisLabel}>
            ${min >= 1000 ? `${(min / 1000).toFixed(1)}k` : min.toFixed(0)}
          </Text>
        </View>
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
      <View style={styles.xAxis}>
        <Text style={styles.axisLabel}>{formatDate(firstDate)}</Text>
        <Text style={styles.axisLabel}>{formatDate(lastDate)}</Text>
      </View>
    </View>
  );
}

function getHeatmapColor(gainLossPct: number): string {
  if (gainLossPct >= 5) return "#15803d";
  if (gainLossPct >= 2) return "#22c55e";
  if (gainLossPct >= 0) return "#4ade80";
  if (gainLossPct >= -2) return "#f87171";
  if (gainLossPct >= -5) return "#ef4444";
  return "#b91c1c";
}

function Heatmap({
  holdings,
}: {
  holdings: HoldingResponse[];
}) {
  const [containerWidth, setContainerWidth] = useState(0);

  const handleLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  if (holdings.length === 0) {
    return (
      <View style={styles.heatmapCard}>
        <View style={styles.heatmapHeader}>
          <Ionicons name="grid-outline" size={18} color={Colors.orange} />
          <Text style={styles.heatmapTitle}>Heatmap</Text>
        </View>
        <Text style={styles.heatmapEmptyText}>Make some trades to see your heatmap</Text>
      </View>
    );
  }

  const sorted = [...holdings].sort((a, b) => b.weight_pct - a.weight_pct);
  const totalWeight = sorted.reduce((sum, h) => sum + h.weight_pct, 0);

  // Pack holdings into rows — start a new row when accumulated weight hits ~50%
  const rows: typeof sorted[] = [];
  let currentRow: typeof sorted = [];
  let rowWeight = 0;
  for (const h of sorted) {
    currentRow.push(h);
    rowWeight += h.weight_pct;
    if (rowWeight >= totalWeight * 0.5 && rows.length < sorted.length - 1) {
      rows.push(currentRow);
      currentRow = [];
      rowWeight = 0;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  const TOTAL_HEIGHT = 280;

  return (
    <View style={styles.heatmapCard}>
      <View style={styles.heatmapHeader}>
        <Ionicons name="grid-outline" size={18} color={Colors.orange} />
        <Text style={styles.heatmapTitle}>Heatmap</Text>
      </View>
      <View style={styles.heatmapContainer} onLayout={handleLayout}>
        {containerWidth > 0 &&
          rows.map((row, ri) => {
            const rowTotal = row.reduce((s, h) => s + h.weight_pct, 0);
            const rowHeight =
              totalWeight > 0
                ? (rowTotal / totalWeight) * TOTAL_HEIGHT
                : TOTAL_HEIGHT / rows.length;
            return (
              <View key={ri} style={[styles.heatmapRow, { height: rowHeight }]}>
                {row.map((h) => (
                  <View
                    key={h.stock_symbol}
                    style={[
                      styles.heatmapBox,
                      {
                        flex: h.weight_pct / rowTotal,
                        backgroundColor: getHeatmapColor(h.gain_loss_pct),
                      },
                    ]}
                  >
                    <Text style={styles.heatmapSymbol} numberOfLines={1}>
                      {h.stock_symbol}
                    </Text>
                    <Text style={styles.heatmapPct} numberOfLines={1}>
                      {h.gain_loss_pct >= 0 ? "+" : ""}
                      {h.gain_loss_pct.toFixed(1)}%
                    </Text>
                  </View>
                ))}
              </View>
            );
          })}
      </View>
    </View>
  );
}

export default function PortfolioScreen() {
  const { data: profile } = useProfile();
  const { mode } = useMode();
  const activeSeasons = (profile?.active_seasons ?? []).filter((s) => s.mode === mode);

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const [seasonDropdownOpen, setSeasonDropdownOpen] = useState(false);
  const seasonId = selectedSeasonId || activeSeasons[0]?.id || "";

  const {
    data: portfolioData,
    isLoading,
    refetch: refetchPortfolio,
    isRefetching: isRefetchingPortfolio,
  } = usePortfolio(seasonId);

  const {
    data: history,
    isLoading: historyLoading,
    refetch: refetchHistory,
    isRefetching: isRefetchingHistory,
  } = usePortfolioHistory(seasonId);

  const isRefetching = isRefetchingPortfolio || isRefetchingHistory;
  const refetch = () => { refetchPortfolio(); refetchHistory(); };

  if (activeSeasons.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Portfolio</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="enter-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No active seasons</Text>
          <Text style={styles.emptySubtext}>
            Join a season to see your portfolio
          </Text>
        </View>
      </View>
    );
  }

  const handleSeasonSelect = (id: string) => {
    setSelectedSeasonId(id);
    setSeasonDropdownOpen(false);
  };

  const renderHolding = ({ item }: { item: HoldingResponse }) => {
    const isPositive = item.gain_loss_pct >= 0;
    return (
      <View style={styles.holdingRow}>
        <View style={styles.holdingLeft}>
          <Text style={styles.holdingSymbol}>{item.stock_symbol}</Text>
          <Text style={styles.holdingName} numberOfLines={1}>
            {item.stock_name}
          </Text>
          <Text style={styles.holdingShares}>
            {item.shares_owned} shares @ ${item.average_purchase_price.toFixed(2)}
          </Text>
        </View>
        <View style={styles.holdingRight}>
          <Text style={styles.holdingValue}>${item.current_value.toFixed(2)}</Text>
          <Text
            style={[
              styles.holdingGain,
              { color: isPositive ? Colors.green : Colors.red },
            ]}
          >
            {isPositive ? "▲" : "▼"} {Math.abs(item.gain_loss_pct).toFixed(2)}%
          </Text>
        </View>
      </View>
    );
  };

  const gainIsPositive = (portfolioData?.percent_gain ?? 0) >= 0;
  const selectedSeason = activeSeasons.find((s) => s.id === seasonId);

  const startingValue = history && history.length > 0 ? history[0].total_value : null;
  const latestValue =
    history && history.length > 0 ? history[history.length - 1].total_value : null;
  const totalReturn =
    history && history.length > 0 ? history[history.length - 1].percent_gain : null;
  const reversedHistory = history ? [...history].reverse() : [];

  const ListHeader = () => (
    <View>
      {/* Summary card */}
      {portfolioData && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Value</Text>
          <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
            ${portfolioData.total_value.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
          <Text
            style={[
              styles.summaryGain,
              { color: gainIsPositive ? Colors.green : Colors.red },
            ]}
          >
            {gainIsPositive ? "▲" : "▼"} {Math.abs(portfolioData.percent_gain).toFixed(2)}%
          </Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryColLabel}>Cash</Text>
              <Text style={styles.summaryColValue} numberOfLines={1} adjustsFontSizeToFit>
                ${portfolioData.cash_balance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>
            <View style={[styles.summaryCol, styles.summaryColCenter]}>
              <Text style={styles.summaryColLabel}>Holdings</Text>
              <Text style={styles.summaryColValue} numberOfLines={1} adjustsFontSizeToFit>
                ${portfolioData.holdings_value.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryColLabel}># Holdings</Text>
              <Text style={styles.summaryColValue} numberOfLines={1}>
                {portfolioData.holdings.length}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Heatmap — always visible */}
      {portfolioData && (
        <Heatmap holdings={portfolioData.holdings} />
      )}

      {/* Chart card */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Portfolio History</Text>
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

      {/* Holdings section title */}
      {portfolioData && portfolioData.holdings.length > 0 && (
        <Text style={styles.sectionTitle}>Holdings</Text>
      )}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Portfolio</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading portfolio...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Portfolio</Text>
      </View>

      {/* Season dropdown — sticky */}
      {activeSeasons.length > 1 && (
        <TouchableOpacity
          style={styles.seasonDropdown}
          onPress={() => setSeasonDropdownOpen(true)}
        >
          <Text style={styles.seasonDropdownText} numberOfLines={2}>
            {selectedSeason?.name ?? "Select Season"}
          </Text>
          <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      )}

      <FlatList
        data={portfolioData?.holdings ?? []}
        renderItem={renderHolding}
        keyExtractor={(item) => item.stock_symbol}
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
        ListEmptyComponent={
          <View style={styles.emptyHoldings}>
            <Ionicons name="briefcase-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No holdings yet</Text>
            <Text style={styles.emptySubtext}>
              Make your first trade to see holdings here
            </Text>
          </View>
        }
        ListFooterComponent={
          reversedHistory.length > 0 ? (
            <View style={styles.dailySection}>
              <View style={styles.dailyHeader}>
                <Text style={styles.dailyTitle}>Daily Values</Text>
                <Text style={styles.dailyCount}>{reversedHistory.length} days</Text>
              </View>
              {reversedHistory.map((item, i) => {
                const isPositive = item.percent_gain >= 0;
                return (
                  <View
                    key={item.date}
                    style={[styles.historyRow, i > 0 && styles.historyRowSpaced]}
                  >
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
              })}
            </View>
          ) : null
        }
      />

      {/* Season dropdown modal */}
      <Modal
        visible={seasonDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSeasonDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSeasonDropdownOpen(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Season</Text>
            {activeSeasons.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[
                  styles.modalOption,
                  s.id === seasonId && styles.modalOptionActive,
                ]}
                onPress={() => handleSeasonSelect(s.id)}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    s.id === seasonId && styles.modalOptionTextActive,
                  ]}
                  numberOfLines={2}
                >
                  {s.name}
                </Text>
                {s.id === seasonId && (
                  <Ionicons name="checkmark" size={20} color={Colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
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
  seasonDropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  seasonDropdownText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
    flex: 1,
    marginRight: Spacing.sm,
  },
  summaryCard: {
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.xl,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  summaryLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontFamily: FontFamily.semiBold,
  },
  summaryValue: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  summaryGain: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    marginTop: Spacing.xs,
  },
  summaryRow: {
    flexDirection: "row",
    marginTop: Spacing.xl,
    width: "100%",
  },
  summaryCol: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.xs,
  },
  summaryColCenter: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.border,
  },
  summaryColLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: FontFamily.semiBold,
  },
  summaryColValue: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  holdingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.md,
  },
  holdingLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  holdingSymbol: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  holdingName: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  holdingShares: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  holdingRight: {
    alignItems: "flex-end",
  },
  holdingValue: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  holdingGain: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    marginTop: 2,
  },
  separator: {
    height: Spacing.sm,
  },
  chartCard: {
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
  },
  chartTitle: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.regular,
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
    fontFamily: FontFamily.regular,
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
    fontFamily: FontFamily.semiBold,
  },
  statValue: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  dailySection: {
    marginTop: Spacing.xl,
  },
  dailyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.md,
  },
  dailyTitle: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  dailyCount: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.md,
  },
  historyRowSpaced: {
    marginTop: Spacing.sm,
  },
  historyDate: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    width: 70,
  },
  historyValue: {
    flex: 1,
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    textAlign: "center",
  },
  historyGain: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    width: 70,
    textAlign: "right",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    width: "100%",
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.xs,
    minHeight: 52,
  },
  modalOptionActive: {
    backgroundColor: Colors.primary + "20",
  },
  modalOptionText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontFamily: FontFamily.medium,
    flex: 1,
  },
  modalOptionTextActive: {
    color: Colors.primary,
    fontFamily: FontFamily.bold,
  },
  heatmapCard: {
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
  },
  heatmapHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    flexWrap: "nowrap",
  },
  heatmapTitle: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    flexShrink: 0,
  },
  heatmapContainer: {
    borderRadius: Radius.md,
    overflow: "hidden",
  },
  heatmapRow: {
    flexDirection: "row",
  },
  heatmapBox: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#111111",
    overflow: "hidden",
    paddingHorizontal: 2,
  },
  heatmapSymbol: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: "#FFFFFF",
    textAlign: "center",
  },
  heatmapPct: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: "#FFFFFF",
    textAlign: "center",
  },
  heatmapEmptyText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    textAlign: "center",
    paddingVertical: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  emptyHoldings: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    paddingTop: Spacing.xxxl,
  },
  emptyText: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    fontFamily: FontFamily.semiBold,
  },
  emptySubtext: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    textAlign: "center",
  },
});
