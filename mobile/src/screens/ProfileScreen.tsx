import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useProfile,
  usePortfolioAnalytics,
  useSeasonPlayers,
  useKnowledgeScore,
} from "../hooks/useApi";
import { Colors, Spacing, FontSize, Radius } from "../utils/theme";
import { signOut } from "../api/client";
import type { SeasonSummary, BenchmarkAnalytics } from "../api/client";
import { useMode, type AppMode } from "../contexts/ModeContext";

const MODE_META: Record<AppMode, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  classroom: { icon: "school-outline", color: Colors.primary, label: "Classroom" },
  league: { icon: "trophy-outline", color: Colors.yellow, label: "League" },
  arena: { icon: "flash-outline", color: Colors.accent, label: "Arena" },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function BetaColorDot({ beta }: { beta: number }) {
  const color =
    beta > 1.2 ? Colors.orange : beta < 0.8 ? Colors.primary : Colors.green;
  return <View style={[styles.betaDot, { backgroundColor: color }]} />;
}

function BenchmarkCard({ data }: { data: BenchmarkAnalytics }) {
  const hasSufficientData = data.data_points >= 20;

  return (
    <View style={styles.benchmarkCard}>
      <Text style={styles.benchmarkTitle}>vs {data.benchmark_name} ({data.benchmark})</Text>
      {hasSufficientData ? (
        <>
          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Beta</Text>
              <View style={styles.metricValueRow}>
                <BetaColorDot beta={data.beta} />
                <Text style={styles.metricValue}>{data.beta.toFixed(2)}</Text>
              </View>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Alpha</Text>
              <Text
                style={[
                  styles.metricValue,
                  { color: data.alpha >= 0 ? Colors.green : Colors.red },
                ]}
              >
                {data.alpha >= 0 ? "+" : ""}
                {data.alpha.toFixed(1)}%
              </Text>
            </View>
          </View>
          <Text style={styles.interpretationText}>{data.beta_interpretation}</Text>
          <Text style={styles.interpretationText}>{data.alpha_interpretation}</Text>
          <Text style={styles.dataPointsText}>Based on {data.data_points} trading days</Text>
        </>
      ) : (
        <Text style={styles.insufficientText}>
          {data.data_points} of 20 trading days collected
        </Text>
      )}
    </View>
  );
}

export default function ProfileScreen() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { mode, clearMode } = useMode();
  const { data: knowledgeScore } = useKnowledgeScore();
  const activeSeasons = profile?.active_seasons ?? [];

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const [analyticsExpanded, setAnalyticsExpanded] = useState(false);
  const [comparePlayer, setComparePlayer] = useState<string | undefined>(undefined);
  const seasonId = selectedSeasonId || activeSeasons[0]?.id || "";

  const handleSwitchMode = () => {
    Alert.alert(
      "Switch Mode?",
      "You'll return to the mode selection screen. Your progress is saved.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Switch", onPress: () => clearMode() },
      ]
    );
  };

  const { data: analytics, isLoading: analyticsLoading } = usePortfolioAnalytics(
    analyticsExpanded ? seasonId : "",
    comparePlayer
  );
  const { data: seasonPlayers } = useSeasonPlayers(seasonId);

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => signOut() },
    ]);
  };

  if (profileLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  const renderSeasonPill = (season: SeasonSummary) => {
    const isSelected = season.id === seasonId;
    return (
      <TouchableOpacity
        key={season.id}
        style={[styles.seasonPill, isSelected && styles.seasonPillActive]}
        onPress={() => setSelectedSeasonId(season.id)}
      >
        <Text
          style={[
            styles.seasonPillText,
            isSelected && styles.seasonPillTextActive,
          ]}
        >
          {season.season_type === "open" ? "🌐" : "🎯"} {season.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const ListHeader = () => (
    <View>
      {/* User info card */}
      <View style={styles.userCard}>
        <View style={styles.userAvatar}>
          <Ionicons name="person" size={32} color={Colors.primary} />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{profile?.alias ?? "—"}</Text>
          <Text style={styles.userMeta}>
            {activeSeasons.length} active{" "}
            {activeSeasons.length === 1 ? "season" : "seasons"}
          </Text>
          {profile?.created_at && (
            <Text style={styles.userMeta}>
              Joined {formatDate(profile.created_at.split("T")[0])}
            </Text>
          )}
        </View>
      </View>

      {/* Mode indicator */}
      {mode && (
        <View style={styles.modeCard}>
          <View style={styles.modeCardLeft}>
            <View style={[styles.modeIconCircle, { backgroundColor: MODE_META[mode].color + "20" }]}>
              <Ionicons name={MODE_META[mode].icon} size={20} color={MODE_META[mode].color} />
            </View>
            <Text style={[styles.modeLabel, { color: MODE_META[mode].color }]}>
              {MODE_META[mode].label}
            </Text>
          </View>
          <TouchableOpacity onPress={handleSwitchMode}>
            <Text style={styles.modeSwitchText}>Switch Mode</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Knowledge Score (classroom mode only) */}
      {mode === "classroom" && (
        <View style={styles.knowledgeScoreCard}>
          <Ionicons name="school-outline" size={24} color={Colors.yellow} />
          <View style={styles.knowledgeScoreContent}>
            <Text style={styles.knowledgeScoreLabel}>Knowledge Score</Text>
            <Text style={styles.knowledgeScoreValue}>
              {knowledgeScore?.total_score ?? profile?.knowledge_score ?? 0}
            </Text>
          </View>
        </View>
      )}

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

      {activeSeasons.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="enter-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No active seasons</Text>
          <Text style={styles.emptySubtext}>
            Join a season from the Home tab to see your performance
          </Text>
        </View>
      ) : (
        <>
          {/* Analytics toggle */}
          <TouchableOpacity
            style={styles.analyticsToggle}
            onPress={() => setAnalyticsExpanded(!analyticsExpanded)}
          >
            <View style={styles.analyticsToggleLeft}>
              <Ionicons name="analytics" size={20} color={Colors.yellow} />
              <Text style={styles.analyticsToggleText}>Portfolio Analytics</Text>
            </View>
            <Ionicons
              name={analyticsExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={Colors.textMuted}
            />
          </TouchableOpacity>

          {/* Analytics expanded section */}
          {analyticsExpanded && (
            <View style={styles.analyticsSection}>
              {analyticsLoading ? (
                <View style={styles.analyticsLoading}>
                  <ActivityIndicator color={Colors.primary} />
                  <Text style={styles.analyticsLoadingText}>Calculating...</Text>
                </View>
              ) : analytics?.insufficient_data && analytics.days_available < 2 ? (
                <View style={styles.insufficientBanner}>
                  <Ionicons name="time-outline" size={24} color={Colors.yellow} />
                  <Text style={styles.insufficientBannerText}>
                    Need 20+ trading days for analysis.{"\n"}
                    You have {analytics.days_available} so far.
                  </Text>
                </View>
              ) : (
                <>
                  {analytics?.benchmarks.map((b) => (
                    <BenchmarkCard key={b.benchmark} data={b} />
                  ))}

                  {/* Player comparison */}
                  {seasonPlayers && seasonPlayers.length > 0 && (
                    <View style={styles.comparisonSection}>
                      <Text style={styles.comparisonTitle}>Compare vs Player</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.playerPills}
                        contentContainerStyle={styles.playerPillsContent}
                      >
                        {seasonPlayers.map((alias) => (
                          <TouchableOpacity
                            key={alias}
                            style={[
                              styles.playerPill,
                              comparePlayer === alias && styles.playerPillActive,
                            ]}
                            onPress={() =>
                              setComparePlayer(comparePlayer === alias ? undefined : alias)
                            }
                          >
                            <Text
                              style={[
                                styles.playerPillText,
                                comparePlayer === alias && styles.playerPillTextActive,
                              ]}
                            >
                              {alias}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>

                      {analytics?.player_comparison && (
                        <View style={styles.benchmarkCard}>
                          <Text style={styles.benchmarkTitle}>
                            vs {analytics.player_comparison.compare_alias}
                          </Text>
                          {analytics.player_comparison.data_points >= 20 ? (
                            <>
                              <View style={styles.metricsRow}>
                                <View style={styles.metricBox}>
                                  <Text style={styles.metricLabel}>Beta</Text>
                                  <View style={styles.metricValueRow}>
                                    <BetaColorDot beta={analytics.player_comparison.beta} />
                                    <Text style={styles.metricValue}>
                                      {analytics.player_comparison.beta.toFixed(2)}
                                    </Text>
                                  </View>
                                </View>
                                <View style={styles.metricBox}>
                                  <Text style={styles.metricLabel}>Alpha</Text>
                                  <Text
                                    style={[
                                      styles.metricValue,
                                      {
                                        color:
                                          analytics.player_comparison.alpha >= 0
                                            ? Colors.green
                                            : Colors.red,
                                      },
                                    ]}
                                  >
                                    {analytics.player_comparison.alpha >= 0 ? "+" : ""}
                                    {analytics.player_comparison.alpha.toFixed(1)}%
                                  </Text>
                                </View>
                              </View>
                              <Text style={styles.interpretationText}>
                                {analytics.player_comparison.beta_interpretation}
                              </Text>
                              <Text style={styles.interpretationText}>
                                {analytics.player_comparison.alpha_interpretation}
                              </Text>
                              <Text style={styles.dataPointsText}>
                                Based on {analytics.player_comparison.data_points} trading days
                              </Text>
                            </>
                          ) : (
                            <Text style={styles.insufficientText}>
                              {analytics.player_comparison.alpha_interpretation ||
                                `${analytics.player_comparison.data_points} of 20 trading days collected`}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </>
              )}
            </View>
          )}

        </>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        <ListHeader />

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={Colors.red} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
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
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: "700",
    color: Colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  userInfo: {
    marginLeft: Spacing.lg,
    flex: 1,
  },
  userName: {
    fontSize: FontSize.xl,
    fontWeight: "700",
    color: Colors.text,
  },
  userMeta: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 2,
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
    fontWeight: "500",
  },
  seasonPillTextActive: {
    color: Colors.text,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    paddingTop: Spacing.xxxl,
    paddingHorizontal: Spacing.xl,
  },
  emptyText: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: "center",
  },
  analyticsToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  analyticsToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  analyticsToggleText: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
  },
  analyticsSection: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  analyticsLoading: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  analyticsLoadingText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  insufficientBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
  },
  insufficientBannerText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  benchmarkCard: {
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
  },
  benchmarkTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  metricsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  metricBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: Radius.md,
    alignItems: "center",
  },
  metricLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  metricValue: {
    fontSize: FontSize.xl,
    fontWeight: "700",
    color: Colors.text,
  },
  metricValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  betaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  interpretationText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  dataPointsText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  insufficientText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  comparisonSection: {
    marginTop: Spacing.sm,
  },
  comparisonTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  playerPills: {
    maxHeight: 40,
    marginBottom: Spacing.md,
  },
  playerPillsContent: {
    gap: Spacing.sm,
  },
  playerPill: {
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  playerPillActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  playerPillText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  playerPillTextActive: {
    color: Colors.text,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    marginTop: Spacing.xxl,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logoutText: {
    fontSize: FontSize.md,
    fontWeight: "600",
    color: Colors.red,
  },
  modeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  modeIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  modeLabel: {
    fontSize: FontSize.md,
    fontWeight: "700",
  },
  modeSwitchText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  knowledgeScoreCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.yellow + "30",
  },
  knowledgeScoreContent: {
    flex: 1,
  },
  knowledgeScoreLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: "600",
  },
  knowledgeScoreValue: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.yellow,
  },
});
