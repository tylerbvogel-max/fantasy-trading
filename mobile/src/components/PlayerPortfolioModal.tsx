import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePlayerPortfolio } from "../hooks/useApi";
import { Colors, Spacing, FontSize, FontFamily, Radius } from "../utils/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  seasonId: string;
  alias: string;
}

export default function PlayerPortfolioModal({ visible, onClose, seasonId, alias }: Props) {
  const { data: portfolio, isLoading } = usePlayerPortfolio(
    visible ? seasonId : "",
    visible ? alias : "",
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{alias}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading portfolio...</Text>
            </View>
          ) : portfolio ? (
            <>
              {/* Summary row */}
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Total Value</Text>
                  <Text style={styles.summaryValue}>
                    ${portfolio.total_value.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Cash</Text>
                  <Text style={styles.summaryValue}>
                    ${portfolio.cash_balance.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Gain</Text>
                  <Text
                    style={[
                      styles.summaryValue,
                      { color: portfolio.percent_gain >= 0 ? Colors.green : Colors.red },
                    ]}
                  >
                    {portfolio.percent_gain >= 0 ? "+" : ""}
                    {portfolio.percent_gain.toFixed(2)}%
                  </Text>
                </View>
              </View>

              {/* Holdings */}
              {portfolio.holdings.length > 0 ? (
                <FlatList
                  data={portfolio.holdings}
                  keyExtractor={(item) => item.stock_symbol}
                  style={styles.holdingsList}
                  renderItem={({ item }) => (
                    <View style={styles.holdingRow}>
                      <View style={styles.holdingLeft}>
                        <Text style={styles.holdingSymbol}>{item.stock_symbol}</Text>
                        <Text style={styles.holdingName} numberOfLines={1}>
                          {item.stock_name}
                        </Text>
                      </View>
                      <View style={styles.holdingMiddle}>
                        <Text style={styles.holdingShares}>
                          {item.shares_owned} {item.shares_owned === 1 ? "share" : "shares"}
                        </Text>
                      </View>
                      <View style={styles.holdingRight}>
                        <Text style={styles.holdingValue}>
                          ${item.current_value.toLocaleString()}
                        </Text>
                        <Text
                          style={[
                            styles.holdingGain,
                            { color: item.gain_loss_pct >= 0 ? Colors.green : Colors.red },
                          ]}
                        >
                          {item.gain_loss_pct >= 0 ? "+" : ""}
                          {item.gain_loss_pct.toFixed(2)}%
                        </Text>
                      </View>
                    </View>
                  )}
                  ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="briefcase-outline" size={36} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>No holdings yet</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="alert-circle-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Portfolio not found</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: "80%",
    paddingBottom: Spacing.xxxl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontFamily: FontFamily.regular,
  },
  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: FontFamily.semiBold,
  },
  summaryValue: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  holdingsList: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
  },
  holdingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  holdingLeft: {
    flex: 1,
  },
  holdingSymbol: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  holdingName: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: FontFamily.regular,
    marginTop: 2,
  },
  holdingMiddle: {
    paddingHorizontal: Spacing.md,
  },
  holdingShares: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontFamily: FontFamily.medium,
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
    fontSize: FontSize.xs,
    fontFamily: FontFamily.semiBold,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontFamily: FontFamily.regular,
  },
});
