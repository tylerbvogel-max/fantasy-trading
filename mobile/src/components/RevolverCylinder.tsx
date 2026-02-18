import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, FontFamily, Spacing } from "../utils/theme";
import type { BountyEquippedIron } from "../api/client";

const CONTAINER_SIZE = 160;
const SLOT_SIZE = 44;
const RADIUS = 52;
const MAX_CHAMBERS = 6;

interface Props {
  chambers: number;
  irons: BountyEquippedIron[];
  maxChambers?: number;
}

const rarityColor = (rarity: string) =>
  rarity === "rare"
    ? Colors.yellow
    : rarity === "uncommon"
      ? Colors.primary
      : Colors.textMuted;

export default function RevolverCylinder({ chambers, irons, maxChambers = MAX_CHAMBERS }: Props) {
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);

  const slots = Array.from({ length: maxChambers }, (_, i) => {
    const slotNum = i + 1;
    const iron = irons.find((ir) => ir.slot_number === slotNum);
    const unlocked = i < chambers;
    return { index: i, slotNum, iron, unlocked };
  });

  const expandedIron = expandedSlot !== null
    ? slots[expandedSlot]?.iron ?? null
    : null;

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        {slots.map(({ index, iron, unlocked }) => {
          const angle = (index * 360) / maxChambers - 90; // start from top
          const rad = (angle * Math.PI) / 180;
          const x = CONTAINER_SIZE / 2 + RADIUS * Math.cos(rad) - SLOT_SIZE / 2;
          const y = CONTAINER_SIZE / 2 + RADIUS * Math.sin(rad) - SLOT_SIZE / 2;

          if (!unlocked) {
            return (
              <View key={index} style={[styles.slot, styles.lockedSlot, { left: x, top: y }]}>
                <Ionicons name="lock-closed" size={16} color={Colors.textMuted + "60"} />
              </View>
            );
          }

          if (!iron) {
            return (
              <View key={index} style={[styles.slot, styles.emptySlot, { left: x, top: y }]}>
                <Ionicons name="ellipse-outline" size={14} color={Colors.textMuted + "80"} />
              </View>
            );
          }

          const color = rarityColor(iron.rarity);
          const isExpanded = expandedSlot === index;
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.slot,
                styles.filledSlot,
                { left: x, top: y, borderColor: color + "80", backgroundColor: color + "18" },
              ]}
              onPress={() => setExpandedSlot(isExpanded ? null : index)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={iron.rarity === "rare" ? "star" : iron.rarity === "uncommon" ? "diamond" : "ellipse"}
                size={16}
                color={color}
              />
              <Text style={[styles.slotLabel, { color }]} numberOfLines={1}>
                {iron.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {expandedIron && (
        <View style={[styles.descriptionBox, { borderColor: rarityColor(expandedIron.rarity) + "40" }]}>
          <Text style={[styles.descriptionName, { color: rarityColor(expandedIron.rarity) }]}>
            {expandedIron.name}
          </Text>
          <Text style={[styles.descriptionText, { color: rarityColor(expandedIron.rarity) + "CC" }]}>
            {expandedIron.description}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    paddingBottom: Spacing.sm,
  },
  container: {
    width: CONTAINER_SIZE,
    height: CONTAINER_SIZE,
    position: "relative",
  },
  slot: {
    position: "absolute",
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    borderRadius: SLOT_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  lockedSlot: {
    borderColor: Colors.textMuted + "30",
    backgroundColor: Colors.card + "40",
  },
  emptySlot: {
    borderStyle: "dashed",
    borderColor: Colors.textMuted + "50",
  },
  filledSlot: {
    borderWidth: 1.5,
  },
  slotLabel: {
    fontSize: 7,
    fontFamily: FontFamily.bold,
    marginTop: 1,
    textAlign: "center",
    maxWidth: SLOT_SIZE - 4,
  },
  descriptionBox: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
    maxWidth: 240,
  },
  descriptionName: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.bold,
    textAlign: "center",
    marginBottom: 2,
  },
  descriptionText: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    textAlign: "center",
  },
});
