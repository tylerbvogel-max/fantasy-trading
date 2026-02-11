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
import { useTopics, useKnowledgeScore } from "../hooks/useApi";
import { Colors, Spacing, FontSize, FontFamily, Radius } from "../utils/theme";
import type { TopicSummary } from "../api/client";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";

export type LearnStackParamList = {
  LearnHome: undefined;
  Lesson: {
    topicId: string;
    topicName: string;
    topicDescription: string;
    chunkIndex: number;
    totalChunks: number;
  };
};

const CHUNK_SIZE = 3;

const TOPIC_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  "trending-up-outline": "trending-up-outline",
  "swap-horizontal-outline": "swap-horizontal-outline",
  "briefcase-outline": "briefcase-outline",
  "shield-outline": "shield-outline",
  "document-text-outline": "document-text-outline",
  "calculator-outline": "calculator-outline",
  "layers-outline": "layers-outline",
  "brain-outline": "bulb-outline",
  "stats-chart-outline": "stats-chart-outline",
  "book-outline": "book-outline",
};

function getIcon(iconName: string): keyof typeof Ionicons.glyphMap {
  return TOPIC_ICONS[iconName] || "book-outline";
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TILE_GAP = Spacing.sm;
const TILE_WIDTH = (SCREEN_WIDTH - Spacing.lg * 2 - TILE_GAP) / 2;

interface ChunkTile {
  key: string;
  topic: TopicSummary;
  chunkIndex: number;
  totalChunks: number;
  label: string;
}

function buildChunkTiles(topics: TopicSummary[]): ChunkTile[] {
  const tiles: ChunkTile[] = [];
  for (const topic of topics) {
    const totalChunks = Math.max(1, Math.ceil(topic.fact_count / CHUNK_SIZE));
    for (let i = 0; i < totalChunks; i++) {
      tiles.push({
        key: `${topic.id}-${i}`,
        topic,
        chunkIndex: i,
        totalChunks,
        label: totalChunks > 1 ? `${topic.name} ${i + 1}` : topic.name,
      });
    }
  }
  return tiles;
}

function ChunkTileCard({
  tile,
  onPress,
}: {
  tile: ChunkTile;
  onPress: () => void;
}) {
  const { topic, chunkIndex } = tile;
  // Estimate chunk mastery from aggregate progress
  const factsInChunk = Math.min(
    CHUNK_SIZE,
    topic.fact_count - chunkIndex * CHUNK_SIZE
  );
  const chunkStart = chunkIndex * CHUNK_SIZE;
  // We can't know exact per-chunk mastery from aggregate, so estimate
  const completedUpToChunkEnd = Math.min(topic.completed_count, chunkStart + factsInChunk);
  const chunkCompleted = Math.max(0, completedUpToChunkEnd - chunkStart);
  const isComplete = chunkCompleted >= factsInChunk && factsInChunk > 0;
  const progressPct = factsInChunk > 0 ? (chunkCompleted / factsInChunk) * 100 : 0;

  return (
    <TouchableOpacity style={styles.topicTile} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.tileTop}>
        <View style={[styles.tileIconCircle, isComplete && styles.tileIconCircleComplete]}>
          <Ionicons
            name={isComplete ? "checkmark" : getIcon(topic.icon)}
            size={20}
            color={isComplete ? Colors.green : Colors.primary}
          />
        </View>
        <View style={styles.tileDifficultyBadge}>
          <Text style={styles.tileDifficultyIcon}>{"\u25CF"}</Text>
        </View>
      </View>
      <Text style={styles.tileName} numberOfLines={2}>{tile.label}</Text>
      <View style={styles.tileProgressRow}>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.min(progressPct, 100)}%` },
            ]}
          />
        </View>
        <Text style={styles.tileProgressText}>
          {chunkCompleted}/{factsInChunk}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function LearnScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LearnStackParamList>>();
  const { data: topics, isLoading, refetch, isRefetching } = useTopics();
  const { data: scoreData } = useKnowledgeScore();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Learn</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  const tiles = buildChunkTiles(topics ?? []);

  // Build pairs for 2-column grid
  const rows: ChunkTile[][] = [];
  for (let i = 0; i < tiles.length; i += 2) {
    rows.push(tiles.slice(i, i + 2));
  }

  const ListHeader = () => (
    <View style={styles.scoreCard}>
      <Ionicons name="school-outline" size={24} color={Colors.yellow} />
      <View style={styles.scoreContent}>
        <Text style={styles.scoreLabel}>Knowledge Score</Text>
        <Text style={styles.scoreValue}>{scoreData?.total_score ?? 0}</Text>
      </View>
      <View style={styles.scoreStats}>
        <Text style={styles.scoreStatText}>
          {scoreData?.questions_correct ?? 0}/{scoreData?.questions_answered ?? 0} correct
        </Text>
        <Text style={styles.scoreStatText}>
          {scoreData?.topics_mastered ?? 0} topics mastered
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Learn</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(_, i) => `row-${i}`}
        renderItem={({ item: row }) => (
          <View style={styles.tileRow}>
            {row.map((tile) => (
              <ChunkTileCard
                key={tile.key}
                tile={tile}
                onPress={() =>
                  navigation.navigate("Lesson", {
                    topicId: tile.topic.id,
                    topicName: tile.label,
                    topicDescription: tile.topic.description,
                    chunkIndex: tile.chunkIndex,
                    totalChunks: tile.totalChunks,
                  })
                }
              />
            ))}
            {row.length === 1 && <View style={styles.tilePlaceholder} />}
          </View>
        )}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="book-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No topics available yet</Text>
          </View>
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
  scoreCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  scoreContent: {
    flex: 1,
  },
  scoreLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontFamily: FontFamily.semiBold,
  },
  scoreValue: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.yellow,
  },
  scoreStats: {
    alignItems: "flex-end",
  },
  scoreStatText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: FontFamily.regular,
    marginTop: 2,
  },
  tileRow: {
    flexDirection: "row",
    gap: TILE_GAP,
    marginBottom: TILE_GAP,
  },
  topicTile: {
    width: TILE_WIDTH,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    justifyContent: "space-between",
    minHeight: 120,
  },
  tilePlaceholder: {
    width: TILE_WIDTH,
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
  tileIconCircleComplete: {
    backgroundColor: Colors.green + "20",
  },
  tileDifficultyBadge: {
    backgroundColor: "#4CAF50" + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  tileDifficultyIcon: {
    fontSize: FontSize.xs,
    color: "#4CAF50",
  },
  tileName: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  tileProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.surface,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  tileProgressText: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: FontFamily.semiBold,
    minWidth: 24,
    textAlign: "right",
  },
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    paddingTop: Spacing.xxxl,
  },
  emptyText: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    fontFamily: FontFamily.semiBold,
  },
});
