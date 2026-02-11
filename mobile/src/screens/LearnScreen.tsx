import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTopics, useKnowledgeScore } from "../hooks/useApi";
import { Colors, Spacing, FontSize, FontFamily, Radius } from "../utils/theme";
import type { TopicSummary } from "../api/client";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";

export type LearnStackParamList = {
  LearnHome: undefined;
  Lesson: { topicId: string; topicName: string };
};

const TOPIC_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  "trending-up-outline": "trending-up-outline",
  "swap-horizontal-outline": "swap-horizontal-outline",
  "briefcase-outline": "briefcase-outline",
  "shield-outline": "shield-outline",
  "document-text-outline": "document-text-outline",
  "calculator-outline": "calculator-outline",
  "layers-outline": "layers-outline",
  "brain-outline": "bulb-outline", // brain-outline may not exist in all Ionicon sets
  "stats-chart-outline": "stats-chart-outline",
  "book-outline": "book-outline",
};

function getIcon(iconName: string): keyof typeof Ionicons.glyphMap {
  return TOPIC_ICONS[iconName] || "book-outline";
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View style={styles.progressBarBg}>
      <View
        style={[
          styles.progressBarFill,
          { width: `${Math.min(progress, 100)}%` },
        ]}
      />
    </View>
  );
}

function TopicCard({
  topic,
  onPress,
}: {
  topic: TopicSummary;
  onPress: () => void;
}) {
  const isComplete = topic.completed_count >= topic.fact_count && topic.fact_count > 0;

  return (
    <TouchableOpacity style={styles.topicCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.topicCardLeft}>
        <View style={[styles.topicIconCircle, isComplete && styles.topicIconCircleComplete]}>
          <Ionicons
            name={isComplete ? "checkmark" : getIcon(topic.icon)}
            size={22}
            color={isComplete ? Colors.green : Colors.primary}
          />
        </View>
        <View style={styles.topicCardContent}>
          <Text style={styles.topicName}>{topic.name}</Text>
          <Text style={styles.topicDescription} numberOfLines={2}>
            {topic.description}
          </Text>
          <View style={styles.topicProgressRow}>
            <ProgressBar progress={topic.progress_pct} />
            <Text style={styles.topicProgressText}>
              {topic.completed_count}/{topic.fact_count}
            </Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
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
        data={topics ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TopicCard
            topic={item}
            onPress={() =>
              navigation.navigate("Lesson", {
                topicId: item.id,
                topicName: item.name,
              })
            }
          />
        )}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
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
  topicCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
  },
  topicCardLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  topicIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  topicIconCircleComplete: {
    backgroundColor: Colors.green + "20",
  },
  topicCardContent: {
    flex: 1,
  },
  topicName: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  topicDescription: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: FontFamily.regular,
    marginTop: 2,
    lineHeight: 16,
  },
  topicProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surface,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  topicProgressText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: FontFamily.semiBold,
    minWidth: 30,
    textAlign: "right",
  },
  separator: {
    height: Spacing.sm,
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
