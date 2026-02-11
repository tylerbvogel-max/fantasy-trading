import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
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
  usePortfolio,
  useStockSearch,
  useValidateTrade,
  useTrade,
  useTradeHistory,
} from "../hooks/useApi";
import { useRoute } from "@react-navigation/native";
import { Colors, Spacing, FontSize, FontFamily, Radius } from "../utils/theme";
import { useMode } from "../contexts/ModeContext";
import { useSeason } from "../contexts/SeasonContext";
import { trading } from "../api/client";
import type { StockQuote, TransactionHistory } from "../api/client";

export default function TradeScreen() {
  const route = useRoute<any>();
  const { data: profile } = useProfile();
  const { mode } = useMode();
  const { selectedSeasonId } = useSeason();
  const activeSeasons = (profile?.active_seasons ?? []).filter((s) =>
    mode === "classroom" ? s.mode === "classroom" : s.mode !== "classroom"
  );

  const seasonId = selectedSeasonId || activeSeasons[0]?.id || "";
  const selectedSeason = activeSeasons.find((s) => s.id === seasonId);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState<StockQuote | null>(null);
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");
  const [sharesInput, setSharesInput] = useState("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);

  // Handle incoming stock from Stocks screen navigation
  const lastHandledRef = useRef<string | null>(null);
  useEffect(() => {
    const params = route.params as
      | { stockSymbol?: string; stockName?: string; stockPrice?: number }
      | undefined;
    if (params?.stockSymbol && params.stockSymbol !== lastHandledRef.current) {
      lastHandledRef.current = params.stockSymbol;
      const incomingStock: StockQuote = {
        symbol: params.stockSymbol,
        name: params.stockName ?? params.stockSymbol,
        price: params.stockPrice ?? null,
        change_pct: null,
        high: null,
        low: null,
        volume: null,
        market_cap: null,
        pe_ratio: null,
        beta: null,
      };
      setSelectedStock(incomingStock);
      setSearchQuery("");
      setSharesInput("");
      setTradeType("BUY");
      setLivePrice(null);
      // Fetch live price
      if (seasonId) {
        setFetchingPrice(true);
        trading
          .validate({
            season_id: seasonId,
            stock_symbol: params.stockSymbol,
            transaction_type: "BUY",
            shares: 1,
          })
          .then((v) => setLivePrice(v.current_price))
          .catch(() => {})
          .finally(() => setFetchingPrice(false));
      }
    }
  }, [route.params, seasonId]);

  const { data: searchResults, isLoading: isSearching } = useStockSearch(searchQuery);
  const { data: portfolioData } = usePortfolio(seasonId);
  const validateTrade = useValidateTrade();
  const executeTrade = useTrade();
  const { data: tradeHistory } = useTradeHistory(seasonId);

  const buyingPower = portfolioData?.cash_balance ?? null;

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
          const tradeCount = tradeHistory?.length ?? 0;
          const maxTrades = selectedSeason?.max_trades_per_player;
          const details = [
            `${tradeType} ${shares} shares of ${validation.stock_symbol}`,
            `Price: $${validation.current_price.toFixed(2)}`,
            `Total: $${validation.estimated_total.toFixed(2)}`,
            ...(maxTrades != null ? [`Trades: ${tradeCount}/${maxTrades} used`] : []),
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
          const tradeCount = (tradeHistory?.length ?? 0) + 1;
          const maxTrades = selectedSeason?.max_trades_per_player;
          const tradeCountLine = maxTrades != null ? `\nTrades: ${tradeCount}/${maxTrades} used` : "";
          Alert.alert(
            "Trade Executed!",
            `${result.transaction_type} ${result.shares} shares of ${result.stock_symbol} at $${result.price_per_share.toFixed(2)}\n\nTotal: $${result.total_amount.toFixed(2)}\nCash remaining: $${result.new_cash_balance.toFixed(2)}${tradeCountLine}`
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
      {/* Header — sticky */}
      <View style={styles.header}>
        <Text style={styles.title}>Trade</Text>
      </View>

      {/* Season banner */}
      {selectedSeason && (
        <View style={styles.seasonBanner}>
          <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
          <Text style={styles.seasonBannerText} numberOfLines={1}>
            {selectedSeason.name}
          </Text>
        </View>
      )}

      {/* Trade count badge */}
      {selectedSeason?.max_trades_per_player != null && (
        <View style={styles.tradeCountBanner}>
          <Ionicons name="swap-horizontal-outline" size={16} color={Colors.orange} />
          <Text style={styles.tradeCountText}>
            {tradeHistory?.length ?? 0} / {selectedSeason.max_trades_per_player} trades used
          </Text>
        </View>
      )}

      {selectedSeason && new Date(selectedSeason.start_date) > new Date() && (
        <View style={styles.inactiveBanner}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.yellow} />
          <Text style={styles.inactiveBannerText}>
            Inactive season — trading opens {new Date(selectedSeason.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Stock search — hidden when a stock is selected */}
        {!selectedStock && (
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
        )}

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

            {/* Buying power */}
            {buyingPower !== null && (
              <View style={styles.buyingPowerRow}>
                <Text style={styles.buyingPowerLabel}>Buying Power</Text>
                <Text style={styles.buyingPowerValue}>
                  ${buyingPower.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            )}

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
    paddingBottom: 200,
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
  tradeCountBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.orange + "15",
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  tradeCountText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.orange,
    flex: 1,
  },
  inactiveBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.xl,
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
  section: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    marginBottom: Spacing.sm,
  },
  selectedSymbol: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.primaryLight,
  },
  selectedName: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: FontFamily.regular,
  },
  selectedRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  selectedPrice: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  tradeToggle: {
    flexDirection: "row",
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: 3,
    marginBottom: Spacing.sm,
  },
  tradeToggleButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
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
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: Colors.textMuted,
  },
  tradeToggleTextActive: {
    color: Colors.text,
  },
  buyingPowerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  buyingPowerLabel: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.semiBold,
    color: Colors.textMuted,
  },
  buyingPowerValue: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: Colors.green,
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    fontFamily: FontFamily.regular,
    marginBottom: Spacing.sm,
  },
  estimateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  estimateLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontFamily: FontFamily.regular,
  },
  estimateValue: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  previewButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  previewButtonText: {
    fontSize: FontSize.md,
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
