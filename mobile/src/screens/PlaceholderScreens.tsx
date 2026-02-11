import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Spacing, FontFamily } from "../utils/theme";

interface PlaceholderProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}

function PlaceholderScreen({ icon, title, subtitle }: PlaceholderProps) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={64} color={Colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

export function TradeScreen() {
  return (
    <PlaceholderScreen
      icon="swap-horizontal-outline"
      title="Trade"
      subtitle="Buy and sell stocks here. Coming next!"
    />
  );
}

export function PortfolioScreen() {
  return (
    <PlaceholderScreen
      icon="briefcase-outline"
      title="Portfolio"
      subtitle="View your holdings and performance. Coming next!"
    />
  );
}

export function StocksScreen() {
  return (
    <PlaceholderScreen
      icon="search-outline"
      title="Stocks"
      subtitle="Browse and search the stock universe. Coming next!"
    />
  );
}

export function ProfileScreen() {
  return (
    <PlaceholderScreen
      icon="person-outline"
      title="Profile"
      subtitle="Your account, seasons, and settings. Coming next!"
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  title: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginTop: Spacing.lg,
  },
  subtitle: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    textAlign: "center",
  },
});
