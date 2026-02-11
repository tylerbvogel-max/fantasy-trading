import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useStocks, useStockSearch, useStockCount, useSeasonStocks, useSeasonDetail, useProfile } from "../hooks/useApi";
import { useMode } from "../contexts/ModeContext";
import { useSeason } from "../contexts/SeasonContext";
import { Colors, Spacing, FontSize, FontFamily, Radius } from "../utils/theme";
import type { StockQuote } from "../api/client";

export default function StocksScreen() {
  const navigation = useNavigation<any>();
  const { mode } = useMode();
  const { selectedSeasonId } = useSeason();
  const { data: profile } = useProfile();
  const [searchQuery, setSearchQuery] = useState("");

  const activeSeasons = (profile?.active_seasons ?? []).filter((s) =>
    mode === "classroom" ? s.mode === "classroom" : s.mode !== "classroom"
  );
  const selectedSeason = activeSeasons.find((s) => s.id === (selectedSeasonId || activeSeasons[0]?.id));

  // Determine if season has a restricted stock list
  const isNonClassroom = mode !== "classroom" && !!selectedSeasonId;
  const { data: seasonDetail } = useSeasonDetail(isNonClassroom ? selectedSeasonId! : "");
  const hasRestriction = isNonClassroom && !!seasonDetail?.allowed_stocks;

  // Fetch season-specific stocks when restricted, otherwise all stocks
  const {
    data: seasonStocks,
    isLoading: isLoadingSeason,
    refetch: refetchSeason,
    isRefetching: isRefetchingSeason,
  } = useSeasonStocks(hasRestriction ? selectedSeasonId! : "");

  const {
    data: allStocks,
    isLoading: isLoadingAll,
    refetch: refetchAll,
    isRefetching: isRefetchingAll,
  } = useStocks();

  const {
    data: searchResults,
    isLoading: isSearching,
  } = useStockSearch(searchQuery);

  const { data: countData } = useStockCount();

  // When restricted, filter search results to only allowed symbols
  const allowedSet = hasRestriction && seasonDetail?.allowed_stocks
    ? new Set(seasonDetail.allowed_stocks)
    : null;

  const isSearchMode = searchQuery.length > 0;
  const baseStocks = hasRestriction ? (seasonStocks ?? []) : (allStocks ?? []);
  const filteredSearch = allowedSet && searchResults
    ? searchResults.filter((s) => allowedSet.has(s.symbol))
    : searchResults;
  const displayedStocks = isSearchMode ? (filteredSearch ?? []) : baseStocks;
  const isLoading = hasRestriction
    ? (isSearchMode ? isSearching : isLoadingSeason)
    : (isSearchMode ? isSearching : isLoadingAll);
  const refetch = hasRestriction ? refetchSeason : refetchAll;
  const isRefetching = hasRestriction ? isRefetchingSeason : isRefetchingAll;
  const totalCount = hasRestriction
    ? baseStocks.length
    : countData?.count ?? allStocks?.length ?? 0;

  const handleStockPress = (stock: StockQuote) => {
    navigation.navigate("Trade", {
      stockSymbol: stock.symbol,
      stockName: stock.name,
      stockPrice: stock.price,
    });
  };

  const renderStock = ({ item }: { item: StockQuote }) => {
    const hasPrice = item.price != null;
    const hasChange = item.change_pct != null;
    const isPositive = (item.change_pct ?? 0) >= 0;
    const isETF = /\bETF\b/i.test(item.name);

    return (
      <View style={styles.stockRow}>
        <TouchableOpacity
          style={styles.stockLeft}
          onPress={() => handleStockPress(item)}
        >
          <View style={styles.symbolRow}>
            <Text style={styles.stockSymbol}>{item.symbol}</Text>
            {isETF && (
              <View style={styles.etfBadge}>
                <Text style={styles.etfBadgeText}>ETF</Text>
              </View>
            )}
          </View>
          <Text style={styles.stockName} numberOfLines={1}>
            {item.name}
          </Text>
        </TouchableOpacity>
        <View style={styles.stockCenter}>
          {hasPrice ? (
            <>
              <Text style={styles.stockPrice}>
                ${item.price!.toFixed(2)}
              </Text>
              {hasChange && (
                <Text
                  style={[
                    styles.stockChange,
                    { color: isPositive ? Colors.green : Colors.red },
                  ]}
                >
                  {isPositive ? "▲" : "▼"} {Math.abs(item.change_pct!).toFixed(2)}%
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.noPrice}>—</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.finvizButton}
          onPress={() => Linking.openURL(`https://finviz.com/quote.ashx?t=${item.symbol}`)}
        >
          <Ionicons name="open-outline" size={16} color={Colors.primary} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Stocks</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>
            {totalCount.toLocaleString()} available
          </Text>
        </View>
      </View>

      {/* Season banner */}
      {mode !== "classroom" && selectedSeason && (
        <View style={styles.seasonBanner}>
          <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
          <Text style={styles.seasonBannerText} numberOfLines={1}>
            {selectedSeason.name}
          </Text>
        </View>
      )}

      {selectedSeason && new Date(selectedSeason.start_date) > new Date() && (
        <View style={styles.inactiveBanner}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.yellow} />
          <Text style={styles.inactiveBannerText}>
            Inactive season — starts {new Date(selectedSeason.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Text>
        </View>
      )}

      {/* Search bar */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by symbol or name"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Stock list */}
      {isLoading && displayedStocks.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading stocks...</Text>
        </View>
      ) : (
        <FlatList
          data={displayedStocks}
          renderItem={renderStock}
          keyExtractor={(item) => item.symbol}
          refreshControl={
            !isSearchMode ? (
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={Colors.primary}
              />
            ) : undefined
          }
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>
                {isSearchMode
                  ? `No stocks matching "${searchQuery}"`
                  : "No stocks available"}
              </Text>
            </View>
          }
          ListFooterComponent={
            !isSearchMode && displayedStocks.length > 0 ? (
              <Text style={styles.footerText}>
                {hasRestriction
                  ? `${displayedStocks.length} stocks in this season`
                  : `Showing ${displayedStocks.length} of ${totalCount.toLocaleString()} — use search to find any stock`}
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.statusBar,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  countBadge: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  countBadgeText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontFamily: FontFamily.semiBold,
  },
  seasonBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary + "15",
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  seasonBannerText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.primaryLight,
    flex: 1,
  },
  inactiveBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.yellow + "15",
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  inactiveBannerText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.yellow,
    flex: 1,
  },
  searchWrapper: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.lg,
    fontSize: FontSize.md,
    color: Colors.text,
    fontFamily: FontFamily.regular,
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
    fontFamily: FontFamily.regular,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.md,
  },
  stockLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  symbolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  etfBadge: {
    backgroundColor: Colors.primary + "25",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.sm,
  },
  etfBadgeText: {
    fontSize: 9,
    fontFamily: FontFamily.bold,
    color: Colors.primary,
  },
  stockSymbol: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.primaryLight,
  },
  stockName: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: FontFamily.regular,
    marginTop: 2,
  },
  stockCenter: {
    alignItems: "flex-end",
    marginRight: Spacing.md,
  },
  finvizButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  stockPrice: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  stockChange: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    marginTop: 2,
  },
  noPrice: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    fontFamily: FontFamily.regular,
  },
  separator: {
    height: Spacing.sm,
  },
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    paddingTop: 100,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontFamily: FontFamily.regular,
    textAlign: "center",
  },
  footerText: {
    textAlign: "center",
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
});
