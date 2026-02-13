import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useProfile, useKnowledgeScore } from "../hooks/useApi";
import { Colors, Spacing, FontSize, Radius, FontFamily } from "../utils/theme";
import { signOut } from "../api/client";
import { useMode, type AppMode } from "../contexts/ModeContext";
import { useSeason } from "../contexts/SeasonContext";
import { useWalkthrough } from "../contexts/WalkthroughContext";
import ModeGuideScreen from "./ModeGuideScreen";

const MODE_META: Record<AppMode, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  classroom: { icon: "school-outline", color: Colors.primary, label: "Classroom" },
  league: { icon: "trophy-outline", color: Colors.yellow, label: "League" },
  arena: { icon: "flash-outline", color: Colors.accent, label: "Arena" },
  bountyHunter: { icon: "skull-outline", color: Colors.orange, label: "Bounty Hunter" },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ProfileScreen() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { mode, clearMode } = useMode();
  const { selectedSeasonId } = useSeason();
  const { resetWalkthrough } = useWalkthrough();
  const { data: knowledgeScore } = useKnowledgeScore();
  const [showModeGuide, setShowModeGuide] = useState(false);
  const activeSeasons = profile?.active_seasons ?? [];
  const modeSeasons = activeSeasons.filter((s) => s.mode === mode);
  const selectedSeason = modeSeasons.find((s) => s.id === (selectedSeasonId || modeSeasons[0]?.id));

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

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => signOut() },
    ]);
  };

  if (showModeGuide) {
    return <ModeGuideScreen onClose={() => setShowModeGuide(false)} />;
  }

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

      {/* Knowledge Score (classroom mode only) */}
      {mode === "classroom" && (
        <View style={styles.knowledgeScoreCard}>
          <Ionicons name="school-outline" size={24} color={Colors.yellow} />
          <View style={styles.knowledgeScoreContent}>
            <Text style={styles.knowledgeScoreLabel}>Knowledge Score</Text>
            <Text style={styles.knowledgeScoreValue}>
              ${((knowledgeScore?.total_score ?? profile?.knowledge_score ?? 0) * 25).toLocaleString()}
            </Text>
          </View>
        </View>
      )}

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
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      {/* Season banner */}
      {mode !== "classroom" && selectedSeason && (
        <View style={styles.seasonBanner}>
          <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
          <Text style={styles.seasonBannerText} numberOfLines={1}>
            {selectedSeason.name}
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.listContent}>
        <ListHeader />

        <TouchableOpacity style={styles.replayButton} onPress={() => setShowModeGuide(true)}>
          <Ionicons name="game-controller-outline" size={20} color={Colors.primary} />
          <Text style={styles.replayText}>Game Modes Explained</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.replayButton} onPress={resetWalkthrough}>
          <Ionicons name="book-outline" size={20} color={Colors.primary} />
          <Text style={styles.replayText}>Replay Walkthrough</Text>
        </TouchableOpacity>

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
    paddingTop: Spacing.statusBar,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  seasonBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary + "15",
    borderRadius: Radius.lg,
    marginBottom: Spacing.sm,
  },
  seasonBannerText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.primaryLight,
    flex: 1,
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
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
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
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  userMeta: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  replayButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    marginTop: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  replayText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.primary,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    marginTop: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logoutText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.red,
  },
  modeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
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
    fontFamily: FontFamily.bold,
  },
  modeSwitchText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.textSecondary,
  },
  knowledgeScoreCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
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
    fontFamily: FontFamily.semiBold,
  },
  knowledgeScoreValue: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.yellow,
  },
});
