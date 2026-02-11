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
import { useMode } from "../contexts/ModeContext";
import { useSeason } from "../contexts/SeasonContext";
import { Colors, Spacing, FontSize, FontFamily, Radius } from "../utils/theme";
import PlayerPortfolioModal from "../components/PlayerPortfolioModal";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SeasonsStackParamList } from "./SeasonsScreen";

type Props = NativeStackScreenProps<SeasonsStackParamList, "SeasonDetail">;

export default function SeasonDetailScreen({ route, navigation }: Props) {
  const { seasonId, seasonName } = route.params;
  const { mode } = useMode();
  const { selectedSeasonId, setSelectedSeasonId } = useSeason();

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const { data: seasonsData } = useSeasons(mode ?? undefined);
  const { data: profile } = useProfile();
  const {
    data: leaderboard,
    isLoading,
    refetch,
    isRefetching,
  } = useLeaderboard(seasonId);
  const joinSeason = useJoinSeason();

  const currentSeason = seasonsData?.find((s) => s.id === seasonId);
  const hasJoined =
    profile?.active_seasons?.some((s) => s.id === seasonId) ?? false;
  const isActive = selectedSeasonId === seasonId;
  const upcoming = currentSeason
    ? new Date(currentSeason.start_date) > new Date()
    : false;

  const handleJoin = () => {
    joinSeason.mutate(seasonId, {
      onSuccess: (data) => {
        Alert.alert("You're in!", data.message);
        setSelectedSeasonId(seasonId);
      },
      onError: (err) => {
        Alert.alert("Couldn't join", err.message);
      },
    });
  };

  const handleSetActive = () => {
    setSelectedSeasonId(seasonId);
  };

  const renderLeaderboardItem = ({
    item,
  }: {
    item: {
      rank: number;
      alias: string;
      total_value: number;
      percent_gain: number;
      holdings_count: number;
    };
  }) => {
    const isCurrentUser = profile?.alias === item.alias;
    const rankEmoji =
      item.rank === 1
        ? "\u{1F947}"
        : item.rank === 2
          ? "\u{1F948}"
          : item.rank === 3
            ? "\u{1F949}"
            : null;

    const row = (
      <View style={[styles.row, isCurrentUser && styles.rowHighlight]}>
        <View style={styles.rankContainer}>
          {rankEmoji ? (
            <Text style={styles.rankEmoji}>{rankEmoji}</Text>
          ) : (
            <Text style={styles.rankText}>{item.rank}</Text>
          )}
        </View>
        <View style={styles.playerInfo}>
          <Text
            style={[styles.alias, isCurrentUser && styles.aliasHighlight]}
          >
            {item.alias}
            {isCurrentUser ? " (you)" : ""}
          </Text>
          <Text style={styles.holdingsCount}>
            {item.holdings_count}{" "}
            {item.holdings_count === 1 ? "stock" : "stocks"}
          </Text>
        </View>
        <View style={styles.valueContainer}>
          <Text style={styles.totalValue}>
            ${item.total_value.toLocaleString()}
          </Text>
          <Text
            style={[
              styles.percentGain,
              {
                color:
                  item.percent_gain >= 0 ? Colors.green : Colors.red,
              },
            ]}
          >
            {item.percent_gain >= 0 ? "\u25B2" : "\u25BC"}{" "}
            {Math.abs(item.percent_gain).toFixed(2)}%
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
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {seasonName}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Season info card */}
      {currentSeason && (
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Type</Text>
              <Text style={styles.infoValue}>
                {currentSeason.season_type}
              </Text>
            </View>
            <View style={[styles.infoCol, styles.infoColCenter]}>
              <Text style={styles.infoLabel}>Players</Text>
              <Text style={styles.infoValue}>
                {currentSeason.player_count}
              </Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Starting Cash</Text>
              <Text style={styles.infoValue}>
                ${currentSeason.starting_cash.toLocaleString()}
              </Text>
            </View>
          </View>
          {/* Dates row */}
          <View style={styles.datesRow}>
            <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.datesText}>
              {new Date(currentSeason.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {currentSeason.end_date
                ? ` - ${new Date(currentSeason.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                : " - No end date"}
            </Text>
          </View>
        </View>
      )}

      {/* Action buttons — upcoming takes priority over all other states */}
      {upcoming && currentSeason && (
        <View style={styles.upcomingButton}>
          <Ionicons name="time-outline" size={20} color={Colors.yellow} />
          <Text style={styles.upcomingButtonText}>
            Opens {new Date(currentSeason.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Text>
        </View>
      )}

      {!upcoming && !hasJoined && (
        <TouchableOpacity
          style={styles.joinButton}
          onPress={handleJoin}
          disabled={joinSeason.isPending}
        >
          {joinSeason.isPending ? (
            <ActivityIndicator color={Colors.text} />
          ) : (
            <View style={styles.joinButtonContent}>
              <Ionicons name="enter-outline" size={20} color={Colors.text} />
              <Text style={styles.joinButtonText}>Join Season</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {!upcoming && hasJoined && !isActive && (
        <TouchableOpacity
          style={styles.setActiveButton}
          onPress={handleSetActive}
        >
          <Ionicons name="checkmark-circle-outline" size={20} color={Colors.primary} />
          <Text style={styles.setActiveText}>Set as Active Season</Text>
        </TouchableOpacity>
      )}

      {!upcoming && hasJoined && isActive && (
        <View style={styles.activeBanner}>
          <Ionicons name="checkmark-circle" size={18} color={Colors.green} />
          <Text style={styles.activeBannerText}>Active Season</Text>
        </View>
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
            leaderboard && leaderboard.length > 0 ? (
              <Text style={styles.sectionTitle}>Leaderboard</Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="trophy-outline"
                size={48}
                color={Colors.textMuted}
              />
              <Text style={styles.emptyText}>No players yet</Text>
              <Text style={styles.emptySubtext}>
                Be the first to join!
              </Text>
            </View>
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
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.statusBar,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.card,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    flex: 1,
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  headerSpacer: {
    width: 36,
  },
  infoCard: {
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: "row",
  },
  infoCol: {
    flex: 1,
    alignItems: "center",
  },
  infoColCenter: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.border,
  },
  infoLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: FontFamily.semiBold,
  },
  infoValue: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  datesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  datesText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
  },
  upcomingButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.yellow + "40",
    backgroundColor: Colors.yellow + "10",
    marginBottom: Spacing.md,
  },
  upcomingButtonText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.yellow,
  },
  joinButton: {
    backgroundColor: Colors.primary,
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  joinButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  joinButtonText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  setActiveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    marginBottom: Spacing.md,
  },
  setActiveText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.primary,
  },
  activeBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  activeBannerText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.green,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
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
  emptyContainer: {
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
