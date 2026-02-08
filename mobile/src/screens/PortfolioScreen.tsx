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
import { useProfile, usePortfolio } from "../hooks/useApi";
import { Colors, Spacing, FontSize, Radius } from "../utils/theme";
import type { HoldingResponse, SeasonSummary } from "../api/client";

export default function PortfolioScreen() {
  const { data: profile } = useProfile();
  const activeSeasons = profile?.active_seasons ?? [];

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const seasonId = selectedSeasonId || activeSeasons[0]?.id || "";

  const {
    data: portfolioData,
    isLoading,
    refetch,
    isRefetching,
  } = usePortfolio(seasonId);

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

  const renderSeasonPill = (season: SeasonSummary) => {
    const isSelected = season.id === seasonId;
    return (
      <TouchableOpacity
        key={season.id}
        style={[styles.seasonPill, isSelected && styles.seasonPillActive]}
        onPress={() => setSelectedSeasonId(season.id)}
      >
        <Text style={[styles.seasonPillText, isSelected && styles.seasonPillTextActive]}>
          {season.season_type === "open" ? "🌐" : "🎯"} {season.name}
        </Text>
      </TouchableOpacity>
    );
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

  const ListHeader = () => (
    <View>
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

      {/* Summary card */}
      {portfolioData && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Value</Text>
          <Text style={styles.summaryValue}>
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
              <Text style={styles.summaryColValue}>
                ${portfolioData.cash_balance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>
            <View style={[styles.summaryCol, styles.summaryColCenter]}>
              <Text style={styles.summaryColLabel}>Holdings</Text>
              <Text style={styles.summaryColValue}>
                ${portfolioData.holdings_value.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryColLabel}># Holdings</Text>
              <Text style={styles.summaryColValue}>
                {portfolioData.holdings.length}
              </Text>
            </View>
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
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: FontSize.hero,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  summaryGain: {
    fontSize: FontSize.lg,
    fontWeight: "700",
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
  },
  summaryColCenter: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.border,
  },
  summaryColLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: "600",
  },
  summaryColValue: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "700",
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
    fontWeight: "700",
    color: Colors.text,
  },
  holdingName: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  holdingShares: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  holdingRight: {
    alignItems: "flex-end",
  },
  holdingValue: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
  },
  holdingGain: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    marginTop: 2,
  },
  separator: {
    height: Spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSize.md,
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
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: "center",
  },
});
