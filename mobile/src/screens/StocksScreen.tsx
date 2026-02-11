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
import { useStocks, useStockSearch, useStockCount } from "../hooks/useApi";
import { Colors, Spacing, FontSize, FontFamily, Radius } from "../utils/theme";
import type { StockQuote } from "../api/client";

export default function StocksScreen() {
  const [searchQuery, setSearchQuery] = useState("");

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

  const isSearchMode = searchQuery.length > 0;
  const displayedStocks = isSearchMode ? (searchResults ?? []) : (allStocks ?? []);
  const isLoading = isSearchMode ? isSearching : isLoadingAll;
  const totalCount = countData?.count ?? allStocks?.length ?? 0;

  const renderStock = ({ item }: { item: StockQuote }) => {
    const hasPrice = item.price != null;
    const hasChange = item.change_pct != null;
    const isPositive = (item.change_pct ?? 0) >= 0;

    return (
      <View style={styles.stockRow}>
        <TouchableOpacity
          style={styles.stockLeft}
          onPress={() => Linking.openURL(`https://finviz.com/quote.ashx?t=${item.symbol}`)}
        >
          <Text style={styles.stockSymbol}>{item.symbol}</Text>
          <View style={styles.stockNameRow}>
            <Text style={styles.stockName} numberOfLines={1}>
              {item.name}
            </Text>
            <Ionicons name="open-outline" size={12} color={Colors.textMuted} style={{ marginLeft: 4 }} />
          </View>
        </TouchableOpacity>
        <View style={styles.stockRight}>
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
                refreshing={isRefetchingAll}
                onRefresh={refetchAll}
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
                Showing {displayedStocks.length} of {totalCount.toLocaleString()} — use search to find any stock
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
  stockSymbol: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  stockNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  stockName: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: FontFamily.regular,
    flexShrink: 1,
  },
  stockRight: {
    alignItems: "flex-end",
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
