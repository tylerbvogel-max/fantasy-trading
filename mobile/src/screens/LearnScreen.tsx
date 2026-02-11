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
  Lesson: { topicId: string; topicName: string; topicDescription: string };
};

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

function TopicTile({
  topic,
  onPress,
}: {
  topic: TopicSummary;
  onPress: () => void;
}) {
  const isComplete = topic.completed_count >= topic.fact_count && topic.fact_count > 0;

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
      <Text style={styles.tileName} numberOfLines={2}>{topic.name}</Text>
      <View style={styles.tileProgressRow}>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.min(topic.progress_pct, 100)}%` },
            ]}
          />
        </View>
        <Text style={styles.tileProgressText}>
          {topic.completed_count}/{topic.fact_count}
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

  // Build pairs for 2-column grid
  const topicList = topics ?? [];
  const rows: TopicSummary[][] = [];
  for (let i = 0; i < topicList.length; i += 2) {
    rows.push(topicList.slice(i, i + 2));
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
            {row.map((topic) => (
              <TopicTile
                key={topic.id}
                topic={topic}
                onPress={() =>
                  navigation.navigate("Lesson", {
                    topicId: topic.id,
                    topicName: topic.name,
                    topicDescription: topic.description,
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
