import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLeaderboard, useSeasons, useProfile, useJoinSeason } from "../hooks/useApi";
import { Colors, Spacing, FontSize, FontFamily, Radius } from "../utils/theme";
import { useMode } from "../contexts/ModeContext";

export default function LeaderboardScreen() {
  const { mode } = useMode();
  const { data: seasonsData } = useSeasons(mode ?? undefined);
  const { data: profile } = useProfile();

  // Default to first active season
  const activeSeasons = seasonsData?.filter((s) => s.is_active) || [];
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");

  const seasonId = selectedSeasonId || activeSeasons[0]?.id || "";

  const {
    data: leaderboard,
    isLoading,
    refetch,
    isRefetching,
  } = useLeaderboard(seasonId);

  const currentSeason = seasonsData?.find((s) => s.id === seasonId);
  const joinSeason = useJoinSeason();

  const hasJoined = profile?.active_seasons?.some((s) => s.id === seasonId) ?? false;

  const handleJoin = () => {
    if (!seasonId) return;
    joinSeason.mutate(seasonId, {
      onSuccess: (data) => {
        Alert.alert("You're in!", data.message);
      },
      onError: (err) => {
        Alert.alert("Couldn't join", err.message);
      },
    });
  };

  const renderSeasonPill = (season: { id: string; name: string; season_type: string }) => {
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

  const renderLeaderboardItem = ({
    item,
    index,
  }: {
    item: { rank: number; alias: string; total_value: number; percent_gain: number; holdings_count: number };
    index: number;
  }) => {
    const isCurrentUser = profile?.alias === item.alias;
    const isTop3 = item.rank <= 3;
    const rankEmoji = item.rank === 1 ? "🥇" : item.rank === 2 ? "🥈" : item.rank === 3 ? "🥉" : null;

    return (
      <View style={[styles.row, isCurrentUser && styles.rowHighlight]}>
        {/* Rank */}
        <View style={styles.rankContainer}>
          {rankEmoji ? (
            <Text style={styles.rankEmoji}>{rankEmoji}</Text>
          ) : (
            <Text style={styles.rankText}>{item.rank}</Text>
          )}
        </View>

        {/* Player info */}
        <View style={styles.playerInfo}>
          <Text style={[styles.alias, isCurrentUser && styles.aliasHighlight]}>
            {item.alias}
            {isCurrentUser ? " (you)" : ""}
          </Text>
          <Text style={styles.holdingsCount}>
            {item.holdings_count} {item.holdings_count === 1 ? "stock" : "stocks"}
          </Text>
        </View>

        {/* Value & gain */}
        <View style={styles.valueContainer}>
          <Text style={styles.totalValue}>${item.total_value.toLocaleString()}</Text>
          <Text
            style={[
              styles.percentGain,
              { color: item.percent_gain >= 0 ? Colors.green : Colors.red },
            ]}
          >
            {item.percent_gain >= 0 ? "▲" : "▼"} {Math.abs(item.percent_gain).toFixed(2)}%
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Leaderboard</Text>
        {currentSeason && (
          <View style={styles.seasonBadge}>
            <Text style={styles.seasonBadgeText}>{currentSeason.player_count} players</Text>
          </View>
        )}
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

      {/* Leaderboard */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading standings...</Text>
        </View>
      ) : (
        <FlatList
          data={leaderboard}
          renderItem={renderLeaderboardItem}
          keyExtractor={(item) => `${item.rank}-${item.alias}`}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            !hasJoined && !isLoading && seasonId ? (
              <TouchableOpacity
                style={styles.joinBanner}
                onPress={handleJoin}
                disabled={joinSeason.isPending}
              >
                <View style={styles.joinBannerContent}>
                  <Ionicons name="enter-outline" size={20} color={Colors.text} />
                  <Text style={styles.joinBannerText}>
                    {joinSeason.isPending ? "Joining..." : `Join ${currentSeason?.name ?? "this season"}`}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            !seasonId ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No seasons in this mode yet</Text>
                <Text style={styles.emptySubtext}>Check back soon or switch modes from Profile</Text>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="trophy-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No players yet</Text>
                <Text style={styles.emptySubtext}>Be the first to join!</Text>
              </View>
            )
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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
  seasonBadge: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  seasonBadgeText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontFamily: FontFamily.semiBold,
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.md,
  },
  rowHighlight: {
    backgroundColor: Colors.cardLight,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  rankContainer: {
    width: 36,
    alignItems: "center",
  },
  rankEmoji: {
    fontSize: 22,
    fontFamily: FontFamily.regular,
  },
  rankText: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.textMuted,
  },
  playerInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  alias: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
  },
  aliasHighlight: {
    color: Colors.primaryLight,
  },
  holdingsCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    fontFamily: FontFamily.regular,
  },
  valueContainer: {
    alignItems: "flex-end",
  },
  totalValue: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  percentGain: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    marginTop: 2,
  },
  separator: {
    height: Spacing.sm,
  },
  joinBanner: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  joinBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  joinBannerText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    fontFamily: FontFamily.semiBold,
  },
  emptySubtext: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontFamily: FontFamily.regular,
  },
});
