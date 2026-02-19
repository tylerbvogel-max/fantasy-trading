import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Polygon } from "react-native-svg";
import { Colors, FontSize, FontFamily, Spacing, Radius } from "../utils/theme";
import type { BountyEquippedIron } from "../api/client";

// Hexagon size (flat-top orientation)
const HEX_R = 32; // circumradius (center to vertex)
const HEX_W = HEX_R * 2; // bounding width
const HEX_H = HEX_R * Math.sqrt(3); // bounding height
const RING_R = HEX_R * 1.85; // distance from center of cylinder to center of each hex
const GRID_SIZE = (RING_R + HEX_R) * 2 + 4; // total container size

// Heartbeat durations per confidence level (ms for one full beat cycle)
const HEARTBEAT_SPEED: Record<number, number> = {
  1: 1800, // Draw — slow
  2: 1200, // Quick Draw — medium
  3: 700,  // Dead Eye — fast
};

interface ConfidenceOption {
  value: number;
  label: string;
  description: string;
  color: string;
  bgColor: string;
}

interface Props {
  chambers: number;
  irons: BountyEquippedIron[];
  maxChambers: number;
  confidenceOptions: ConfidenceOption[];
  selectedConfidence: number;
  onSelectConfidence: (value: number) => void;
}

const rarityColor = (rarity: string) =>
  rarity === "rare"
    ? Colors.yellow
    : rarity === "uncommon"
      ? Colors.primary
      : Colors.textMuted;

/** Flat-top hexagon SVG points centered at (cx, cy) with circumradius r */
function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");
}

/** 6 slots arranged in a circle (revolver cylinder pattern) */
function getSlotCenter(index: number): { x: number; y: number } {
  const angle = (Math.PI / 180) * (60 * index - 90); // start from top
  return {
    x: GRID_SIZE / 2 + RING_R * Math.cos(angle),
    y: GRID_SIZE / 2 + RING_R * Math.sin(angle),
  };
}

interface HexSlotProps {
  cx: number;
  cy: number;
  iron: BountyEquippedIron | undefined;
  unlocked: boolean;
  onPress: () => void;
}

function HexSlot({ cx, cy, iron, unlocked, onPress }: HexSlotProps) {
  const left = cx - HEX_R;
  const top = cy - HEX_H / 2;

  const strokeColor = !unlocked
    ? Colors.textMuted + "30"
    : !iron
      ? Colors.textMuted + "50"
      : rarityColor(iron.rarity) + "80";
  const fillColor = !unlocked
    ? Colors.card + "40"
    : !iron
      ? "transparent"
      : rarityColor(iron.rarity) + "18";
  const dashArray = !unlocked || iron ? undefined : "3,3";

  return (
    <TouchableOpacity
      style={[styles.hexSlot, { left, top, width: HEX_W, height: HEX_H }]}
      onPress={iron ? onPress : undefined}
      activeOpacity={iron ? 0.7 : 1}
      disabled={!iron}
    >
      <Svg width={HEX_W} height={HEX_H} style={StyleSheet.absoluteFill}>
        <Polygon
          points={hexPoints(HEX_R, HEX_H / 2, HEX_R - 1)}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={iron ? 1.5 : 1}
          strokeDasharray={dashArray}
        />
      </Svg>
      {!unlocked && (
        <Ionicons name="lock-closed" size={16} color={Colors.textMuted + "60"} />
      )}
      {unlocked && !iron && (
        <Ionicons name="ellipse-outline" size={14} color={Colors.textMuted + "80"} />
      )}
      {unlocked && iron && (
        <>
          <Ionicons
            name={iron.rarity === "rare" ? "star" : iron.rarity === "uncommon" ? "diamond" : "ellipse"}
            size={16}
            color={rarityColor(iron.rarity)}
          />
          <Text style={[styles.hexLabel, { color: rarityColor(iron.rarity) }]} numberOfLines={1}>
            {iron.name}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/** Confidence button with heartbeat pulse when selected */
function ConfButton({
  opt,
  selected,
  onPress,
}: {
  opt: ConfidenceOption;
  selected: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
    }
    scale.setValue(1);

    if (!selected) return;

    const duration = HEARTBEAT_SPEED[opt.value] ?? 1800;
    // Two quick bumps then a pause — like a heartbeat
    const beat = Animated.sequence([
      Animated.timing(scale, { toValue: 1.05, duration: duration * 0.08, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: duration * 0.08, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1.04, duration: duration * 0.07, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: duration * 0.12, useNativeDriver: true }),
      Animated.delay(duration * 0.65),
    ]);

    const loop = Animated.loop(beat);
    animRef.current = loop;
    loop.start();

    return () => {
      loop.stop();
      scale.setValue(1);
    };
  }, [selected, opt.value]);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Animated.View
        style={[
          styles.confButton,
          {
            backgroundColor: selected ? opt.bgColor : Colors.card,
            borderColor: selected ? opt.color : Colors.border,
            transform: [{ scale }],
          },
        ]}
      >
        <Text
          style={[styles.confLabel, { color: selected ? opt.color : Colors.textMuted }]}
          numberOfLines={1}
        >
          {opt.label}
        </Text>
        <Text style={[styles.confScore, { color: selected ? opt.color : Colors.textMuted }]}>
          {opt.description}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function HexIronBar({
  chambers,
  irons,
  maxChambers,
  confidenceOptions,
  selectedConfidence,
  onSelectConfidence,
}: Props) {
  const [modalIron, setModalIron] = useState<BountyEquippedIron | null>(null);

  const slots = Array.from({ length: maxChambers }, (_, i) => {
    const slotNum = i + 1;
    const iron = irons.find((ir) => ir.slot_number === slotNum);
    const unlocked = i < chambers;
    return { index: i, iron, unlocked };
  });

  return (
    <View style={styles.bar}>
      {/* Left: Hex cylinder */}
      <View style={[styles.hexGrid, { width: GRID_SIZE, height: GRID_SIZE }]}>
        {slots.map(({ index, iron, unlocked }) => {
          const { x, y } = getSlotCenter(index);
          return (
            <HexSlot
              key={index}
              cx={x}
              cy={y}
              iron={iron}
              unlocked={unlocked}
              onPress={() => iron && setModalIron(iron)}
            />
          );
        })}
      </View>

      {/* Right: Vertical confidence buttons */}
      <View style={styles.confColumn}>
        {confidenceOptions.map((opt) => (
          <ConfButton
            key={opt.value}
            opt={opt}
            selected={selectedConfidence === opt.value}
            onPress={() => onSelectConfidence(opt.value)}
          />
        ))}
      </View>

      {/* Iron detail modal */}
      <Modal
        visible={!!modalIron}
        transparent
        animationType="fade"
        onRequestClose={() => setModalIron(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalIron(null)}
        >
          {modalIron && (
            <View style={[styles.modalCard, { borderColor: rarityColor(modalIron.rarity) + "60" }]}>
              <Ionicons
                name={modalIron.rarity === "rare" ? "star" : modalIron.rarity === "uncommon" ? "diamond" : "ellipse"}
                size={28}
                color={rarityColor(modalIron.rarity)}
              />
              <Text style={[styles.modalName, { color: rarityColor(modalIron.rarity) }]}>
                {modalIron.name}
              </Text>
              <Text style={styles.modalRarity}>
                {modalIron.rarity.charAt(0).toUpperCase() + modalIron.rarity.slice(1)}
              </Text>
              <Text style={styles.modalDesc}>{modalIron.description}</Text>
            </View>
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    paddingTop: Spacing.sm,
  },

  // Hex grid
  hexGrid: {
    position: "relative",
  },
  hexSlot: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  hexLabel: {
    fontSize: 7,
    fontFamily: FontFamily.bold,
    marginTop: 1,
    textAlign: "center",
    maxWidth: HEX_W - 10,
  },

  // Confidence column
  confColumn: {
    width: 100,
    gap: Spacing.xs,
  },
  confButton: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  confLabel: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.sm,
  },
  confScore: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.xs,
    marginTop: 1,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
    maxWidth: 260,
    width: "80%",
  },
  modalName: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.lg,
    textAlign: "center",
  },
  modalRarity: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textTransform: "capitalize",
  },
  modalDesc: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
