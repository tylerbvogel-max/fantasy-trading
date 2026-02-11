import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useProfile,
  useStockSearch,
  useValidateTrade,
  useTrade,
  useTradeHistory,
} from "../hooks/useApi";
import { Colors, Spacing, FontSize, FontFamily, Radius } from "../utils/theme";
import { trading } from "../api/client";
import type { StockQuote, SeasonSummary, TransactionHistory } from "../api/client";

export default function TradeScreen() {
  const { data: profile } = useProfile();
  const activeSeasons = profile?.active_seasons ?? [];

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const seasonId = selectedSeasonId || activeSeasons[0]?.id || "";

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState<StockQuote | null>(null);
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");
  const [sharesInput, setSharesInput] = useState("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);

  const { data: searchResults, isLoading: isSearching } = useStockSearch(searchQuery);
  const validateTrade = useValidateTrade();
  const executeTrade = useTrade();
  const { data: tradeHistory } = useTradeHistory(seasonId);

  const shares = parseFloat(sharesInput) || 0;
  const displayPrice = livePrice ?? selectedStock?.price ?? null;
  const estimatedTotal = displayPrice ? shares * displayPrice : 0;

  if (activeSeasons.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Trade</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="enter-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No active seasons</Text>
          <Text style={styles.emptySubtext}>
            Join a season from the Home tab to start trading
          </Text>
        </View>
      </View>
    );
  }

  const handlePreview = () => {
    if (!selectedStock || shares <= 0) {
      Alert.alert("Invalid Trade", "Select a stock and enter a valid number of shares.");
      return;
    }

    validateTrade.mutate(
      {
        season_id: seasonId,
        stock_symbol: selectedStock.symbol,
        transaction_type: tradeType,
        shares,
      },
      {
        onSuccess: (validation) => {
          const details = [
            `${tradeType} ${shares} shares of ${validation.stock_symbol}`,
            `Price: $${validation.current_price.toFixed(2)}`,
            `Total: $${validation.estimated_total.toFixed(2)}`,
            "",
            validation.message,
          ].join("\n");

          if (validation.is_valid) {
            Alert.alert("Confirm Trade", details, [
              { text: "Cancel", style: "cancel" },
              { text: "Execute", onPress: handleExecute },
            ]);
          } else {
            Alert.alert("Trade Invalid", validation.message);
          }
        },
        onError: (err) => {
          Alert.alert("Validation Error", err.message);
        },
      }
    );
  };

  const handleExecute = () => {
    if (!selectedStock) return;

    executeTrade.mutate(
      {
        season_id: seasonId,
        stock_symbol: selectedStock.symbol,
        transaction_type: tradeType,
        shares,
      },
      {
        onSuccess: (result) => {
          Alert.alert(
            "Trade Executed!",
            `${result.transaction_type} ${result.shares} shares of ${result.stock_symbol} at $${result.price_per_share.toFixed(2)}\n\nTotal: $${result.total_amount.toFixed(2)}\nCash remaining: $${result.new_cash_balance.toFixed(2)}`
          );
          setSelectedStock(null);
          setSharesInput("");
          setSearchQuery("");
          setLivePrice(null);
        },
        onError: (err) => {
          Alert.alert("Trade Failed", err.message);
        },
      }
    );
  };

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

  const renderSearchResult = ({ item }: { item: StockQuote }) => (
    <TouchableOpacity
      style={styles.searchResultRow}
      onPress={() => {
        setSelectedStock(item);
        setSearchQuery("");
        setLivePrice(null);
        if (seasonId) {
          setFetchingPrice(true);
          trading.validate({
            season_id: seasonId,
            stock_symbol: item.symbol,
            transaction_type: "BUY",
            shares: 1,
          })
            .then((v) => setLivePrice(v.current_price))
            .catch(() => {})
            .finally(() => setFetchingPrice(false));
        }
      }}
    >
      <View style={styles.searchResultInfo}>
        <Text style={styles.searchResultSymbol}>{item.symbol}</Text>
        <Text style={styles.searchResultName} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
      <Text style={styles.searchResultPrice}>
        {item.price != null ? `$${item.price.toFixed(2)}` : "—"}
      </Text>
    </TouchableOpacity>
  );

  const renderTradeHistoryItem = ({ item }: { item: TransactionHistory }) => {
    const isBuy = item.transaction_type === "BUY";
    return (
      <View style={styles.historyRow}>
        <View style={[styles.typeBadge, { backgroundColor: isBuy ? Colors.green : Colors.red }]}>
          <Text style={styles.typeBadgeText}>{item.transaction_type}</Text>
        </View>
        <View style={styles.historyInfo}>
          <Text style={styles.historySymbol}>{item.stock_symbol}</Text>
          <Text style={styles.historyDetail}>
            {item.shares} shares @ ${item.price_per_share.toFixed(2)}
          </Text>
        </View>
        <Text style={styles.historyTotal}>${item.total_amount.toFixed(2)}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Trade</Text>
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

        {/* Stock search */}
        <View style={styles.section}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search stocks (e.g., AAPL)"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Search results */}
          {searchQuery.length > 0 && (
            <View style={styles.searchResults}>
              {isSearching ? (
                <ActivityIndicator color={Colors.primary} style={styles.searchLoading} />
              ) : searchResults && searchResults.length > 0 ? (
                searchResults.slice(0, 8).map((stock) => (
                  <React.Fragment key={stock.symbol}>
                    {renderSearchResult({ item: stock })}
                  </React.Fragment>
                ))
              ) : (
                <Text style={styles.noResults}>No stocks matching "{searchQuery}"</Text>
              )}
            </View>
          )}
        </View>

        {/* Trade form */}
        {selectedStock && (
          <View style={styles.section}>
            {/* Selected stock bar */}
            <View style={styles.selectedStockBar}>
              <View>
                <Text style={styles.selectedSymbol}>{selectedStock.symbol}</Text>
                <Text style={styles.selectedName}>{selectedStock.name}</Text>
              </View>
              <View style={styles.selectedRight}>
                {fetchingPrice ? (
                  <ActivityIndicator color={Colors.primary} size="small" />
                ) : (
                  <Text style={styles.selectedPrice}>
                    {displayPrice != null ? `$${displayPrice.toFixed(2)}` : "—"}
                  </Text>
                )}
                <TouchableOpacity onPress={() => setSelectedStock(null)}>
                  <Ionicons name="close-circle" size={24} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* BUY/SELL toggle */}
            <View style={styles.tradeToggle}>
              <TouchableOpacity
                style={[
                  styles.tradeToggleButton,
                  tradeType === "BUY" && styles.tradeToggleBuy,
                ]}
                onPress={() => setTradeType("BUY")}
              >
                <Text
                  style={[
                    styles.tradeToggleText,
                    tradeType === "BUY" && styles.tradeToggleTextActive,
                  ]}
                >
                  BUY
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tradeToggleButton,
                  tradeType === "SELL" && styles.tradeToggleSell,
                ]}
                onPress={() => setTradeType("SELL")}
              >
                <Text
                  style={[
                    styles.tradeToggleText,
                    tradeType === "SELL" && styles.tradeToggleTextActive,
                  ]}
                >
                  SELL
                </Text>
              </TouchableOpacity>
            </View>

            {/* Shares input */}
            <Text style={styles.label}>Shares</Text>
            <TextInput
              style={styles.input}
              value={sharesInput}
              onChangeText={setSharesInput}
              placeholder="Number of shares"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />

            {/* Estimated total */}
            {shares > 0 && (
              <View style={styles.estimateRow}>
                <Text style={styles.estimateLabel}>Estimated Total</Text>
                <Text style={styles.estimateValue}>${estimatedTotal.toFixed(2)}</Text>
              </View>
            )}

            {/* Preview button */}
            <TouchableOpacity
              style={[
                styles.previewButton,
                (validateTrade.isPending || executeTrade.isPending) && styles.buttonDisabled,
              ]}
              onPress={handlePreview}
              disabled={validateTrade.isPending || executeTrade.isPending || shares <= 0}
            >
              {validateTrade.isPending || executeTrade.isPending ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <Text style={styles.previewButtonText}>Preview Trade</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Recent trades */}
        {tradeHistory && tradeHistory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Trades</Text>
            {tradeHistory.slice(0, 10).map((trade) => (
              <React.Fragment key={trade.id}>
                {renderTradeHistoryItem({ item: trade })}
              </React.Fragment>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xxxl,
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
    fontFamily: FontFamily.medium,
  },
  seasonPillTextActive: {
    color: Colors.text,
  },
  section: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
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
  searchResults: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderTopWidth: 0,
    borderBottomLeftRadius: Radius.md,
    borderBottomRightRadius: Radius.md,
  },
  searchLoading: {
    padding: Spacing.lg,
  },
  noResults: {
    padding: Spacing.lg,
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: "center",
    fontFamily: FontFamily.regular,
  },
  searchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  searchResultInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  searchResultSymbol: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  searchResultName: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    fontFamily: FontFamily.regular,
  },
  searchResultPrice: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
  },
  selectedStockBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    marginBottom: Spacing.md,
  },
  selectedSymbol: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.primaryLight,
  },
  selectedName: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    fontFamily: FontFamily.regular,
  },
  selectedRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  selectedPrice: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  tradeToggle: {
    flexDirection: "row",
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: 4,
    marginBottom: Spacing.md,
  },
  tradeToggleButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    borderRadius: Radius.sm,
  },
  tradeToggleBuy: {
    backgroundColor: Colors.green,
  },
  tradeToggleSell: {
    backgroundColor: Colors.red,
  },
  tradeToggleText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.textMuted,
  },
  tradeToggleTextActive: {
    color: Colors.text,
  },
  label: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    fontSize: FontSize.md,
    color: Colors.text,
    fontFamily: FontFamily.regular,
    marginBottom: Spacing.md,
  },
  estimateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  estimateLabel: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontFamily: FontFamily.regular,
  },
  estimateValue: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  previewButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  previewButtonText: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    minWidth: 42,
    alignItems: "center",
  },
  typeBadgeText: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  historyInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  historySymbol: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
  },
  historyDetail: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    fontFamily: FontFamily.regular,
  },
  historyTotal: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  emptyText: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    fontFamily: FontFamily.semiBold,
  },
  emptySubtext: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: "center",
    fontFamily: FontFamily.regular,
  },
});
