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
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLeaderboard, useSeasons, useProfile, useJoinSeason } from "../hooks/useApi";
import { Colors, Spacing, FontSize, FontFamily, Radius } from "../utils/theme";
import { useMode } from "../contexts/ModeContext";
import PlayerPortfolioModal from "../components/PlayerPortfolioModal";

export default function LeaderboardScreen() {
  const { mode } = useMode();
  const { data: seasonsData } = useSeasons(mode ?? undefined);
  const { data: profile } = useProfile();

  // Default to first active season
  const activeSeasons = seasonsData?.filter((s) => s.is_active) || [];
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const [seasonDropdownOpen, setSeasonDropdownOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

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

  const handleSeasonSelect = (id: string) => {
    setSelectedSeasonId(id);
    setSeasonDropdownOpen(false);
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

    const row = (
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

    return (
      <TouchableOpacity activeOpacity={0.7} onPress={() => setSelectedPlayer(item.alias)}>
        {row}
      </TouchableOpacity>
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

      {/* Season dropdown — sticky */}
      {activeSeasons.length > 1 && (
        <TouchableOpacity
          style={styles.seasonDropdown}
          onPress={() => setSeasonDropdownOpen(true)}
        >
          <Text style={styles.seasonDropdownText} numberOfLines={2}>
            {currentSeason?.name ?? "Select Season"}
          </Text>
          <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
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

      {/* Player portfolio modal */}
      <PlayerPortfolioModal
        visible={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        seasonId={seasonId}
        alias={selectedPlayer ?? ""}
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
