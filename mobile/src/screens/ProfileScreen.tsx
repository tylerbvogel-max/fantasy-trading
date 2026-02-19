import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useProfile } from "../hooks/useApi";
import { Colors, Spacing, FontSize, Radius, FontFamily } from "../utils/theme";
import { signOut } from "../api/client";
import { useWalkthrough } from "../contexts/WalkthroughContext";
import { useAudio } from "../contexts/AudioContext";
import { useCardTheme } from "../contexts/CardThemeContext";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ProfileScreen() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { resetWalkthrough } = useWalkthrough();
  const { musicEnabled, toggleMusic } = useAudio();
  const { lightCards, toggleLightCards, candleChart, toggleCandleChart } = useCardTheme();

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {/* User info card */}
        <View style={styles.userCard}>
          <View style={styles.userAvatar}>
            <Ionicons name="person" size={32} color={Colors.primary} />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{profile?.alias ?? "—"}</Text>
            {profile?.created_at && (
              <Text style={styles.userMeta}>
                Joined {formatDate(profile.created_at.split("T")[0])}
              </Text>
            )}
          </View>
        </View>

        {/* Music toggle */}
        <View style={styles.musicCard}>
          <View style={styles.cardLeft}>
            <View style={[styles.iconCircle, { backgroundColor: Colors.accent + "20" }]}>
              <Ionicons name="musical-notes-outline" size={20} color={Colors.accent} />
            </View>
            <Text style={styles.musicLabel}>Theme Music</Text>
          </View>
          <Switch
            value={musicEnabled}
            onValueChange={toggleMusic}
            trackColor={{ false: Colors.surface, true: Colors.accent + "60" }}
            thumbColor={musicEnabled ? Colors.accent : Colors.textMuted}
          />
        </View>

        {/* Light Cards toggle */}
        <View style={styles.lightCardsCard}>
          <View style={styles.cardLeft}>
            <View style={[styles.iconCircle, { backgroundColor: Colors.yellow + "20" }]}>
              <Ionicons name="sunny-outline" size={20} color={Colors.yellow} />
            </View>
            <Text style={styles.lightCardsLabel}>Light Cards</Text>
          </View>
          <Switch
            value={lightCards}
            onValueChange={toggleLightCards}
            trackColor={{ false: Colors.surface, true: Colors.yellow + "60" }}
            thumbColor={lightCards ? Colors.yellow : Colors.textMuted}
          />
        </View>

        {/* Candle Charts toggle */}
        <View style={styles.candleChartCard}>
          <View style={styles.cardLeft}>
            <View style={[styles.iconCircle, { backgroundColor: Colors.green + "20" }]}>
              <Ionicons name="bar-chart-outline" size={20} color={Colors.green} />
            </View>
            <Text style={styles.candleChartLabel}>Candle Charts</Text>
          </View>
          <Switch
            value={candleChart}
            onValueChange={toggleCandleChart}
            trackColor={{ false: Colors.surface, true: Colors.green + "60" }}
            thumbColor={candleChart ? Colors.green : Colors.textMuted}
          />
        </View>

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
  musicCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  musicLabel: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.accent,
  },
  lightCardsCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.md,
  },
  lightCardsLabel: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.yellow,
  },
  candleChartCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.md,
  },
  candleChartLabel: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.green,
  },
});
