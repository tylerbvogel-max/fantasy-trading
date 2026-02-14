import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, FontSize, Radius, FontFamily } from "../utils/theme";
import type { BountyIronDef } from "../api/client";

const RARITY_COLORS: Record<string, string> = {
  common: Colors.textMuted,
  uncommon: Colors.primary,
  rare: Colors.yellow,
};

const RARITY_LABELS: Record<string, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
};

interface Props {
  visible: boolean;
  irons: BountyIronDef[];
  onPick: (ironId: string) => void;
  isPicking: boolean;
  chambersUsed: number;
  maxChambers: number;
}

export default function IronOfferingModal({
  visible,
  irons,
  onPick,
  isPicking,
  chambersUsed,
  maxChambers,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleConfirm = () => {
    if (selected) {
      onPick(selected);
      setSelected(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Iron Offering</Text>
          <Text style={styles.subtitle}>
            Choose a new iron to equip
            {chambersUsed >= maxChambers && " (replaces oldest)"}
          </Text>

          <View style={styles.cardsRow}>
            {irons.map((iron) => {
              const isSelected = selected === iron.id;
              const rarityColor = RARITY_COLORS[iron.rarity] ?? Colors.textMuted;
              return (
                <TouchableOpacity
                  key={iron.id}
                  style={[
                    styles.ironCard,
                    isSelected && { borderColor: rarityColor, borderWidth: 2 },
                  ]}
                  onPress={() => setSelected(iron.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.rarityBadge, { backgroundColor: rarityColor + "30" }]}>
                    <Text style={[styles.rarityText, { color: rarityColor }]}>
                      {RARITY_LABELS[iron.rarity] ?? iron.rarity}
                    </Text>
                  </View>
                  <Text style={styles.ironName}>{iron.name}</Text>
                  <Text style={styles.ironDesc}>{iron.description}</Text>
                  {isSelected && (
                    <Ionicons
                      name="checkmark-circle"
                      size={24}
                      color={rarityColor}
                      style={styles.checkmark}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.equipButton, !selected && styles.equipButtonDisabled]}
            onPress={handleConfirm}
            disabled={!selected || isPicking}
          >
            {isPicking ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <Text style={styles.equipButtonText}>
                {selected ? "Equip" : "Select an Iron"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  container: {
    width: "100%",
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: "center",
  },
  title: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.yellow,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  cardsRow: {
    width: "100%",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  ironCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    position: "relative",
  },
  rarityBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    marginBottom: Spacing.xs,
  },
  rarityText: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.bold,
    textTransform: "uppercase",
  },
  ironName: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginBottom: 4,
  },
  ironDesc: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
  },
  checkmark: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
  },
  equipButton: {
    backgroundColor: Colors.orange,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    width: "100%",
    alignItems: "center",
  },
  equipButtonDisabled: {
    backgroundColor: Colors.surface,
  },
  equipButtonText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
});
