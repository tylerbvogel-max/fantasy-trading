import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, FontSize, Radius, FontFamily } from "../utils/theme";
import { useBountyBoard, useProfile } from "../hooks/useApi";
import type { BountyBoardEntry } from "../api/client";

type Period = "weekly" | "alltime";

export default function BountyBoardScreen() {
  const [period, setPeriod] = useState<Period>("weekly");
  const { data: board, isLoading, refetch, isRefetching } = useBountyBoard(period);
  const { data: profile } = useProfile();

  const currentAlias = profile?.alias;

  const renderItem = ({ item }: { item: BountyBoardEntry }) => {
    const isMe = item.alias === currentAlias;

    return (
      <View style={[styles.row, isMe && styles.rowHighlight]}>
        <View style={styles.rankCol}>
          <Text style={[styles.rank, isMe && styles.rankMe]}>
            {item.rank <= 3 ? ["", "1st", "2nd", "3rd"][item.rank] : `#${item.rank}`}
          </Text>
        </View>
        <View style={styles.nameCol}>
          <Text style={[styles.alias, isMe && styles.aliasMe]} numberOfLines={1}>
            {item.alias}
          </Text>
          <Text style={styles.accuracy}>
            {item.accuracy_pct}% ({item.total_predictions} picks)
          </Text>
        </View>
        <View style={styles.rightCol}>
          <Text style={styles.dollars}>
            $${item.double_dollars.toLocaleString()}
          </Text>
          {item.wanted_level > 0 && (
            <View style={styles.wantedBadge}>
              <Ionicons name="flame" size={12} color={Colors.orange} />
              <Text style={styles.wantedText}>Lv.{item.wanted_level}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Bounty Board</Text>
      </View>

      {/* Period toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleButton, period === "weekly" && styles.toggleActive]}
          onPress={() => setPeriod("weekly")}
        >
          <Text style={[styles.toggleText, period === "weekly" && styles.toggleTextActive]}>
            Weekly
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, period === "alltime" && styles.toggleActive]}
          onPress={() => setPeriod("alltime")}
        >
          <Text style={[styles.toggleText, period === "alltime" && styles.toggleTextActive]}>
            All-Time
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.orange} />
        </View>
      ) : !board || board.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="trophy-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No bounty hunters yet</Text>
          <Text style={styles.emptySubtext}>
            Make your first prediction to appear on the board
          </Text>
        </View>
      ) : (
        <FlatList
          data={board}
          keyExtractor={(item) => `${item.rank}-${item.alias}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.orange}
            />
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
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.statusBar,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  toggleRow: {
    flexDirection: "row",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: 3,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    borderRadius: Radius.sm,
  },
  toggleActive: {
    backgroundColor: Colors.orange + "30",
  },
  toggleText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.textMuted,
  },
  toggleTextActive: {
    color: Colors.orange,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    textAlign: "center",
    paddingHorizontal: Spacing.xxxl,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowHighlight: {
    borderColor: Colors.orange + "50",
    backgroundColor: Colors.orange + "08",
  },
  rankCol: {
    width: 44,
  },
  rank: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.textMuted,
  },
  rankMe: {
    color: Colors.orange,
  },
  nameCol: {
    flex: 1,
  },
  alias: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  aliasMe: {
    color: Colors.orange,
  },
  accuracy: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  rightCol: {
    alignItems: "flex-end",
  },
  dollars: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.yellow,
  },
  wantedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 2,
  },
  wantedText: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.semiBold,
    color: Colors.orange,
  },
});
