import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Colors, Spacing, FontSize, Radius, FontFamily } from "../utils/theme";
import { useAllIrons, useBountyIrons } from "../hooks/useApi";

const RARITY_COLORS: Record<string, string> = {
  legendary: Colors.orange,
  rare: Colors.yellow,
  uncommon: "#B388FF",
  common: Colors.textSecondary,
};

const RARITY_ORDER: string[] = ["common", "uncommon", "rare", "legendary"];

const NUM_COLUMNS = 3;
const SCREEN_PADDING = Spacing.xl;
const CARD_GAP = Spacing.sm;
const CARD_WIDTH =
  (Dimensions.get("window").width - SCREEN_PADDING * 2 - CARD_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

export default function IronCollectionScreen() {
  const { data: allIrons, isLoading: ironsLoading } = useAllIrons();
  const { data: equipped, isLoading: equippedLoading } = useBountyIrons();

  const isLoading = ironsLoading || equippedLoading;

  const equippedIds = new Set(equipped?.map((e) => e.iron_id) ?? []);

  const grouped = RARITY_ORDER.map((rarity) => ({
    rarity,
    irons: (allIrons ?? []).filter((i) => i.rarity === rarity),
  })).filter((g) => g.irons.length > 0);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Irons</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.orange} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Irons</Text>
        <Text style={styles.subtitle}>
          {equippedIds.size}/{allIrons?.length ?? 0} collected
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {grouped.map((group) => {
          const color = RARITY_COLORS[group.rarity] ?? Colors.textMuted;
          const collected = group.irons.filter((i) => equippedIds.has(i.id)).length;
          return (
            <View key={group.rarity} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color }]}>
                  {group.rarity.charAt(0).toUpperCase() + group.rarity.slice(1)}
                </Text>
                <Text style={styles.sectionCount}>
                  {collected}/{group.irons.length}
                </Text>
              </View>
              <View style={styles.grid}>
                {group.irons.map((iron) => {
                  const isCollected = equippedIds.has(iron.id);
                  return (
                    <View
                      key={iron.id}
                      style={[styles.ironCard, { borderTopColor: color }]}
                    >
                      {isCollected && (
                        <View style={[styles.equippedDot, { backgroundColor: color }]} />
                      )}
                      <Text style={[styles.ironName, { color }]} numberOfLines={2}>
                        {iron.name}
                      </Text>
                      <Text style={styles.effectText}>
                        {iron.description}
                      </Text>
                      {iron.boost_description && (
                        <Text style={styles.boostText}>
                          {iron.boost_description}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
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
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: Spacing.statusBar,
    paddingBottom: Spacing.md,
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: Spacing.xxxl,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionCount: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: CARD_GAP,
  },
  ironCard: {
    width: CARD_WIDTH,
    minHeight: CARD_WIDTH * 1.1,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderTopWidth: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  equippedDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ironName: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.bold,
    marginBottom: 2,
  },
  effectText: {
    fontSize: 10,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
  },
  boostText: {
    fontSize: 10,
    fontFamily: FontFamily.regular,
    color: Colors.orange,
    marginTop: 2,
  },
  lockedCard: {
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.6,
    borderColor: Colors.border,
  },
  lockedIcon: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.textMuted,
  },
  lockedText: {
    fontSize: 10,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
