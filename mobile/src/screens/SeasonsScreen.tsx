import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSeasons, useProfile } from "../hooks/useApi";
import { useMode } from "../contexts/ModeContext";
import { useSeason } from "../contexts/SeasonContext";
import { Colors, Spacing, FontSize, FontFamily, Radius } from "../utils/theme";
import type { SeasonSummary } from "../api/client";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";

export type SeasonsStackParamList = {
  SeasonsHome: undefined;
  SeasonDetail: { seasonId: string; seasonName: string };
  CreateSeason: undefined;
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TILE_GAP = Spacing.sm;
const TILE_WIDTH = (SCREEN_WIDTH - Spacing.lg * 2 - TILE_GAP) / 2;

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isUpcoming(season: SeasonSummary): boolean {
  return new Date(season.start_date) > new Date();
}

function isExpired(season: SeasonSummary): boolean {
  return !!season.end_date && new Date(season.end_date) < new Date();
}

function SeasonTile({
  season,
  isJoined,
  isSelected,
  onPress,
}: {
  season: SeasonSummary;
  isJoined: boolean;
  isSelected: boolean;
  onPress: () => void;
}) {
  const upcoming = isUpcoming(season);

  return (
    <TouchableOpacity
      style={[
        styles.tile,
        isSelected && styles.tileSelected,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.tileTop}>
        <View style={styles.tileIconCircle}>
          <Ionicons
            name="trophy-outline"
            size={20}
            color={Colors.primary}
          />
        </View>
        {upcoming ? (
          <View style={styles.upcomingBadge}>
            <Text style={styles.upcomingBadgeText}>Upcoming</Text>
          </View>
        ) : isJoined ? (
          <View style={styles.joinedBadge}>
            <Text style={styles.joinedBadgeText}>Joined</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.tileName} numberOfLines={2}>
        {season.name}
      </Text>
      <View style={styles.tileDetails}>
        <View style={styles.tileDetailRow}>
          <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
          <Text style={styles.tileDetailText}>
            {formatShortDate(season.start_date)}
            {season.end_date ? ` - ${formatShortDate(season.end_date)}` : ""}
          </Text>
        </View>
        <View style={styles.tileDetailRow}>
          <Ionicons name="people-outline" size={12} color={Colors.textMuted} />
          <Text style={styles.tileDetailText}>
            {season.player_count} players
          </Text>
        </View>
        <View style={styles.tileDetailRow}>
          <Ionicons name="cash-outline" size={12} color={Colors.textMuted} />
          <Text style={styles.tileDetailText}>
            ${season.starting_cash.toLocaleString()}
          </Text>
        </View>
      </View>
      {season.season_type && (
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{season.season_type}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function SeasonsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<SeasonsStackParamList>>();
  const { mode } = useMode();
  const { selectedSeasonId, setSelectedSeasonId } = useSeason();
  const {
    data: seasonsData,
    isLoading,
    refetch,
    isRefetching,
  } = useSeasons(mode === "classroom" ? "classroom" : "league");
  const { data: profile } = useProfile();

  const activeSeasons = seasonsData?.filter((s) => s.is_active && !isExpired(s)) ?? [];
  const joinedIds = new Set(
    (profile?.active_seasons ?? []).map((s) => s.id)
  );

  const handleTileTap = (season: SeasonSummary) => {
    if (joinedIds.has(season.id)) {
      setSelectedSeasonId(season.id);
    }
    navigation.navigate("SeasonDetail", {
      seasonId: season.id,
      seasonName: season.name,
    });
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Seasons</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  // Build grid items: create tile first, then season tiles
  type GridItem = SeasonSummary | "create";
  const gridItems: GridItem[] = [...activeSeasons, "create"];
  const rows: GridItem[][] = [];
  for (let i = 0; i < gridItems.length; i += 2) {
    rows.push(gridItems.slice(i, i + 2));
  }

  const renderGridItem = (item: GridItem) => {
    if (item === "create") {
      return (
        <TouchableOpacity
          key="create"
          style={styles.createTile}
          onPress={() => navigation.navigate("CreateSeason")}
          activeOpacity={0.7}
        >
          <View style={styles.createIconCircle}>
            <Ionicons name="add" size={28} color={Colors.accent} />
          </View>
          <Text style={styles.createTileTitle}>Create a Season</Text>
          <Text style={styles.createTileSubtext}>
            Set the rules, invite friends
          </Text>
        </TouchableOpacity>
      );
    }
    return (
      <SeasonTile
        key={item.id}
        season={item}
        isJoined={joinedIds.has(item.id)}
        isSelected={selectedSeasonId === item.id}
        onPress={() => handleTileTap(item)}
      />
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Seasons</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(_, i) => `row-${i}`}
        renderItem={({ item: row }) => (
          <View style={styles.tileRow}>
            {row.map(renderGridItem)}
            {row.length === 1 && <View style={styles.tilePlaceholder} />}
          </View>
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Colors.primary}
          />
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
    paddingTop: Spacing.statusBar,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  tileRow: {
    flexDirection: "row",
    gap: TILE_GAP,
    marginBottom: TILE_GAP,
  },
  tile: {
    width: TILE_WIDTH,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    justifyContent: "space-between",
    minHeight: 140,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tileSelected: {
    borderColor: Colors.primary,
  },
  tilePlaceholder: {
    width: TILE_WIDTH,
  },
  createTile: {
    width: TILE_WIDTH,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 140,
    borderWidth: 1,
    borderColor: Colors.accent + "40",
    borderStyle: "dashed",
  },
  createIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent + "20",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  createTileTitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginBottom: 2,
  },
  createTileSubtext: {
    fontSize: 10,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    textAlign: "center",
  },
  tileTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  tileIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  joinedBadge: {
    backgroundColor: Colors.green + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  joinedBadgeText: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.semiBold,
    color: Colors.green,
  },
  upcomingBadge: {
    backgroundColor: Colors.yellow + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  upcomingBadgeText: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.semiBold,
    color: Colors.yellow,
  },
  tileName: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  tileDetails: {
    gap: 4,
  },
  tileDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tileDetailText: {
    fontSize: 10,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
  },
  typeBadge: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    alignSelf: "flex-start",
    marginTop: Spacing.sm,
  },
  typeBadgeText: {
    fontSize: 10,
    fontFamily: FontFamily.semiBold,
    color: Colors.textSecondary,
  },
});
