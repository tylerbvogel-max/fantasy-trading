import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing, FontSize, Radius, FontFamily } from "../utils/theme";
import { useMode, type AppMode } from "../contexts/ModeContext";

const MODES: {
  key: AppMode;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  description: string;
}[] = [
  {
    key: "classroom",
    icon: "school-outline",
    color: Colors.primary,
    title: "Classroom",
    description:
      "Learn portfolio management. Educational tool for courses \u2014 pure trading and learning.",
  },
  {
    key: "league",
    icon: "trophy-outline",
    color: Colors.yellow,
    title: "League",
    description:
      "Compete with friends. Fantasy football-style rankings \u2014 skill-based, fair play.",
  },
  {
    key: "arena",
    icon: "flash-outline",
    color: Colors.accent,
    title: "Arena",
    description:
      "Chaos and sabotage. Player interactions, forced swaps, strategic disruption.",
  },
];

export default function ModeSelectScreen() {
  const { setMode } = useMode();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Choose Your Mode</Text>
      <View style={styles.cards}>
        {MODES.map((m) => (
          <TouchableOpacity
            key={m.key}
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => setMode(m.key)}
          >
            <View style={[styles.iconCircle, { backgroundColor: m.color + "20" }]}>
              <Ionicons name={m.icon} size={28} color={m.color} />
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: m.color }]}>{m.title}</Text>
              <Text style={styles.cardDesc}>{m.description}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  header: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    textAlign: "center",
    marginBottom: Spacing.xxxl,
  },
  cards: {
    gap: Spacing.lg,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  cardText: {
    flex: 1,
    marginLeft: Spacing.lg,
  },
  cardTitle: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    marginBottom: Spacing.xs,
  },
  cardDesc: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
