import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Animated,
  PanResponder,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Polygon } from "react-native-svg";
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

const SCREEN_WIDTH = Dimensions.get("window").width;

// Hex slots on the ring — large enough for name + description
const HEX_R = 60;
const HEX_W = HEX_R * 2;
const HEX_H = HEX_R * Math.sqrt(3);
const RING_R = HEX_R * 1.15;
const GRID_SIZE = RING_R * 2 + HEX_W + 8;

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");
}

// Spin physics
const SPIN_FRICTION = 0.985;
const SPIN_MIN_VELOCITY = 0.3;
const SNAP_DURATION = 150;
const FLING_VELOCITY_MULT = 25;

function getSlotCenter(index: number, total: number, rotationDeg: number): { x: number; y: number } {
  const slotAngle = (360 / total) * index;
  const angle = (Math.PI / 180) * (slotAngle - 90 + rotationDeg);
  return {
    x: GRID_SIZE / 2 + RING_R * Math.cos(angle),
    y: GRID_SIZE / 2 + RING_R * Math.sin(angle),
  };
}

function getTopSlotIndex(spinDeg: number, total: number): number {
  const slotSpacing = 360 / total;
  const norm = ((spinDeg % 360) + 360) % 360;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < total; i++) {
    const slotAng = (((slotSpacing * i - 90 + norm) % 360) + 360) % 360;
    const dist = Math.min(Math.abs(slotAng - 270), 360 - Math.abs(slotAng - 270));
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function getSnapAngle(currentDeg: number, slotIdx: number, total: number): number {
  const slotSpacing = 360 / total;
  const targetBase = (360 - slotSpacing * slotIdx) % 360;
  const currentNorm = ((currentDeg % 360) + 360) % 360;
  let diff = targetBase - currentNorm;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return currentDeg + diff;
}

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
}: Props) {
  const total = irons.length || 3;
  const [spinDeg, setSpinDeg] = useState(0);
  const spinRef = useRef(0);
  const velocityRef = useRef(0);
  const momentumRaf = useRef<number | null>(null);
  const snapAnim = useRef(new Animated.Value(0)).current;
  const isSnapping = useRef(false);
  const isSwiping = useRef(false);

  const [highlightIdx, setHighlightIdx] = useState(0);

  useEffect(() => {
    if (visible) {
      spinRef.current = 0;
      setSpinDeg(0);
      setHighlightIdx(0);
      velocityRef.current = 0;
    }
  }, [visible]);

  const updateTopIron = useCallback((deg: number) => {
    setHighlightIdx(getTopSlotIndex(deg, total));
  }, [total]);

  const stopMomentum = () => {
    if (momentumRaf.current !== null) {
      cancelAnimationFrame(momentumRaf.current);
      momentumRaf.current = null;
    }
  };

  const snapToSlot = useCallback((fromDeg: number) => {
    const topIdx = getTopSlotIndex(fromDeg, total);
    const targetDeg = getSnapAngle(fromDeg, topIdx, total);
    if (Math.abs(targetDeg - fromDeg) < 0.5) {
      spinRef.current = targetDeg;
      setSpinDeg(targetDeg);
      updateTopIron(targetDeg);
      return;
    }
    isSnapping.current = true;
    const startDeg = fromDeg;
    snapAnim.setValue(0);
    const listenerId = snapAnim.addListener(({ value }) => {
      const current = startDeg + (targetDeg - startDeg) * value;
      spinRef.current = current;
      setSpinDeg(current);
    });
    Animated.timing(snapAnim, {
      toValue: 1,
      duration: SNAP_DURATION,
      useNativeDriver: false,
    }).start(() => {
      snapAnim.removeListener(listenerId);
      isSnapping.current = false;
      spinRef.current = targetDeg;
      setSpinDeg(targetDeg);
      updateTopIron(targetDeg);
    });
  }, [total, updateTopIron]);

  const startMomentumRef = useRef(() => {});
  startMomentumRef.current = () => {
    stopMomentum();
    const tick = () => {
      velocityRef.current *= SPIN_FRICTION;
      if (Math.abs(velocityRef.current) < SPIN_MIN_VELOCITY) {
        velocityRef.current = 0;
        snapToSlot(spinRef.current);
        return;
      }
      spinRef.current += velocityRef.current;
      setSpinDeg(spinRef.current);
      momentumRaf.current = requestAnimationFrame(tick);
    };
    momentumRaf.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => stopMomentum(), []);

  // Angular touch tracking using locationX/locationY (relative to the view — works in Modal)
  const touchStartAngle = useRef(0);
  const spinAtTouchStart = useRef(0);
  const lastMoveTime = useRef(0);
  const lastMoveDeg = useRef(0);
  const centerX = GRID_SIZE / 2;
  const centerY = GRID_SIZE / 2;

  const angleAt = (locX: number, locY: number) => {
    return Math.atan2(locY - centerY, locX - centerX) * (180 / Math.PI);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        stopMomentum();
        isSnapping.current = false;
        isSwiping.current = false;
        velocityRef.current = 0;
        lastMoveTime.current = Date.now();
        lastMoveDeg.current = spinRef.current;
        touchStartAngle.current = angleAt(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        spinAtTouchStart.current = spinRef.current;
      },
      onPanResponderMove: (evt) => {
        isSwiping.current = true;
        const currentAngle = angleAt(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        let delta = currentAngle - touchStartAngle.current;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        const newDeg = spinAtTouchStart.current + delta;

        const now = Date.now();
        const dt = now - lastMoveTime.current;
        if (dt > 0) {
          velocityRef.current = (newDeg - lastMoveDeg.current) / Math.max(dt, 8) * 16;
        }
        lastMoveTime.current = now;
        lastMoveDeg.current = newDeg;
        spinRef.current = newDeg;
        setSpinDeg(newDeg);
      },
      onPanResponderRelease: (_, g) => {
        if (isSwiping.current) {
          const gestureVel = g.vx * FLING_VELOCITY_MULT;
          if (Math.abs(gestureVel) > Math.abs(velocityRef.current)) {
            velocityRef.current = gestureVel;
          }
        }
        // Always snap on release — whether swiped or just tapped
        startMomentumRef.current();
        isSwiping.current = false;
      },
      onPanResponderTerminate: () => {
        isSwiping.current = false;
      },
    })
  ).current;

  const highlighted = irons[highlightIdx];

  const handleConfirm = () => {
    if (highlighted) {
      onPick(highlighted.id);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Iron Offering</Text>
          <Text style={styles.subtitle}>Spin to choose — equip your iron</Text>

          {/* Revolver ring */}
          <View
            style={[styles.revolverArea, { width: GRID_SIZE, height: GRID_SIZE }]}
            {...panResponder.panHandlers}
          >
            {/* Top marker */}
            <View style={styles.topMarker}>
              <Ionicons name="caret-down" size={18} color={Colors.orange} />
            </View>

            {irons.map((iron, index) => {
              const { x, y } = getSlotCenter(index, total, spinDeg);
              const isTop = index === highlightIdx;
              const rarityColor = RARITY_COLORS[iron.rarity] ?? Colors.textMuted;
              const fillColor = rarityColor + "18";

              return (
                <View
                  key={iron.id}
                  pointerEvents="none"
                  style={[
                    styles.hexSlot,
                    {
                      left: x - HEX_R,
                      top: y - HEX_H / 2,
                      width: HEX_W,
                      height: HEX_H,
                    },
                  ]}
                >
                  <Svg width={HEX_W} height={HEX_H} style={StyleSheet.absoluteFill}>
                    <Polygon
                      points={hexPoints(HEX_R, HEX_H / 2, HEX_R - 1)}
                      fill={fillColor}
                      stroke={rarityColor + (isTop ? "CC" : "60")}
                      strokeWidth={isTop ? 4 : 1.5}
                    />
                  </Svg>
                  <View style={[styles.rarityBadge, { backgroundColor: rarityColor + "30" }]}>
                    <Text style={[styles.rarityBadgeText, { color: rarityColor }]}>
                      {RARITY_LABELS[iron.rarity] ?? iron.rarity}
                    </Text>
                  </View>
                  <Text
                    style={[styles.slotName, { color: rarityColor }]}
                    numberOfLines={1}
                  >
                    {iron.name}
                  </Text>
                  <Text
                    style={[styles.slotDesc, { color: Colors.textSecondary }]}
                    numberOfLines={3}
                  >
                    {iron.description}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Equip button */}
          <TouchableOpacity
            style={styles.equipButton}
            onPress={handleConfirm}
            disabled={!highlighted || isPicking}
          >
            {isPicking ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <Text style={styles.equipButtonText}>
                Equip {highlighted?.name ?? "Iron"}
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
    padding: Spacing.lg,
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
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  revolverArea: {
    position: "relative",
    marginBottom: Spacing.lg,
  },
  topMarker: {
    position: "absolute",
    top: -6,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  hexSlot: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    gap: 2,
  },
  rarityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  rarityBadgeText: {
    fontSize: 9,
    fontFamily: FontFamily.bold,
    textTransform: "uppercase",
  },
  slotName: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    textAlign: "center",
    maxWidth: HEX_W - 30,
  },
  slotDesc: {
    fontSize: 8,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 11,
    maxWidth: HEX_W - 36,
  },
  equipButton: {
    backgroundColor: Colors.orange,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    width: "100%",
    alignItems: "center",
  },
  equipButtonText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
});
