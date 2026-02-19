import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Colors, Spacing, FontSize, Radius, FontFamily } from "../utils/theme";
import { useAllIrons, useBountyIrons } from "../hooks/useApi";

const RARITY_COLORS: Record<string, string> = {
  legendary: Colors.orange,
  rare: Colors.yellow,
  uncommon: "#B388FF",
  common: Colors.textSecondary,
};

const RARITY_ORDER: string[] = ["legendary", "rare", "uncommon", "common"];

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
          {allIrons?.length ?? 0} total
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {grouped.map((group) => {
          const color = RARITY_COLORS[group.rarity] ?? Colors.textMuted;
          return (
            <View key={group.rarity} style={styles.section}>
              <Text style={[styles.sectionTitle, { color }]}>
                {group.rarity.charAt(0).toUpperCase() + group.rarity.slice(1)}
              </Text>
              {group.irons.map((iron) => {
                const isEquipped = equippedIds.has(iron.id);
                return (
                  <View
                    key={iron.id}
                    style={[styles.ironCard, { borderLeftColor: color }]}
                  >
                    <View style={styles.ironHeader}>
                      <Text style={[styles.ironName, { color }]}>
                        {iron.name}
                      </Text>
                      {isEquipped && (
                        <View style={styles.equippedBadge}>
                          <Text style={styles.equippedText}>EQUIPPED</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.effectText}>{iron.description}</Text>
                    {iron.boost_description && (
                      <Text style={styles.boostText}>
                        Boosted: {iron.boost_description}
                      </Text>
                    )}
                  </View>
                );
              })}
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
    paddingHorizontal: Spacing.xl,
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
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  ironCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ironHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  ironName: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
  },
  equippedBadge: {
    backgroundColor: Colors.orange + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  equippedText: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.bold,
    color: Colors.orange,
    letterSpacing: 0.5,
  },
  effectText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
  },
  boostText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.orange,
    marginTop: Spacing.xs,
  },
});
