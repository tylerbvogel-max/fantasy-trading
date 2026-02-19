import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, Animated, PanResponder } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Polygon, Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { Colors, FontSize, FontFamily, Spacing, Radius } from "../utils/theme";
import type { BountyEquippedIron } from "../api/client";

// Hexagon size (flat-top orientation)
const HEX_R = 32;
const HEX_W = HEX_R * 2;
const HEX_H = HEX_R * Math.sqrt(3);
const RING_R = HEX_R * 1.85;
const GRID_SIZE = (RING_R + HEX_R) * 2 + 4;

// Spin physics — near-frictionless, responsive to touch
const SPIN_DRAG_SENSITIVITY = 1.2;   // degrees per pixel of drag — 1:1 feel
const SPIN_FRICTION = 0.985;         // very low friction — spins a long time
const SPIN_MIN_VELOCITY = 0.3;       // stop threshold
const SWIPE_THRESHOLD = 4;           // px before recognizing swipe (low = responsive)
const SNAP_DURATION = 150;           // ms for snap-to-slot animation
const FLING_VELOCITY_MULT = 25;      // velocity multiplier for flick gestures

const BOOST_HEARTBEAT_MS = 700;

const BET_SLIDER_HEIGHT = 150;
const BET_SLIDER_WIDTH = 44;
const THUMB_HEIGHT = 28;

interface Props {
  chambers: number;
  irons: BountyEquippedIron[];
  maxChambers: number;
  betAmount: number;
  onBetAmountChange: (value: number) => void;
  boostedIronId: string | null;
  onBoostSelected: (ironId: string | null) => void;
}

const rarityColor = (rarity: string) =>
  rarity === "rare"
    ? Colors.yellow
    : rarity === "uncommon"
      ? Colors.primary
      : Colors.textMuted;

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");
}

function getSlotCenter(index: number, rotationDeg: number): { x: number; y: number } {
  const angle = (Math.PI / 180) * (60 * index - 90 + rotationDeg);
  return {
    x: GRID_SIZE / 2 + RING_R * Math.cos(angle),
    y: GRID_SIZE / 2 + RING_R * Math.sin(angle),
  };
}

/** Find which slot index is closest to the top (12 o'clock) */
function getTopSlotIndex(spinDeg: number, maxSlots: number): number {
  const norm = ((spinDeg % 360) + 360) % 360;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < maxSlots; i++) {
    const slotAng = ((60 * i - 90 + norm) % 360 + 360) % 360;
    const dist = Math.min(Math.abs(slotAng - 270), 360 - Math.abs(slotAng - 270));
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Return the rotation angle that perfectly centers a given slot at top */
function getSnapAngle(currentDeg: number, slotIdx: number, maxSlots: number): number {
  // Slot i is at top when rotation = -(60*i - 90) + 270 = -60i + 360 → simplify: -60*i (mod 360)
  // Target: (60*slotIdx) should align so slot is at 270°
  // slot angle = 60*i - 90 + rotation → set to 270 → rotation = 360 - 60*i
  const targetBase = (360 - 60 * slotIdx) % 360;
  // Find the closest equivalent to currentDeg
  const currentNorm = ((currentDeg % 360) + 360) % 360;
  let diff = targetBase - currentNorm;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return currentDeg + diff;
}

interface HexSlotProps {
  cx: number;
  cy: number;
  iron: BountyEquippedIron | undefined;
  unlocked: boolean;
  onPress: () => void;
  isBoosted: boolean;
  boostScale: Animated.Value;
}

function HexSlot({ cx, cy, iron, unlocked, onPress, isBoosted, boostScale }: HexSlotProps) {
  const left = cx - HEX_R;
  const top = cy - HEX_H / 2;

  const strokeColor = !unlocked
    ? Colors.textMuted + "60"
    : !iron
      ? Colors.textMuted + "90"
      : isBoosted
        ? Colors.orange
        : rarityColor(iron.rarity) + "CC";
  const fillColor = !unlocked
    ? Colors.card + "80"
    : !iron
      ? Colors.surface + "30"
      : isBoosted
        ? Colors.orange + "50"
        : rarityColor(iron.rarity) + "35";
  const dashArray = !unlocked || iron ? undefined : "3,3";

  if (isBoosted && iron) {
    return (
      <Animated.View style={{ position: "absolute", left, top, width: HEX_W, height: HEX_H, transform: [{ scale: boostScale }] }}>
        <TouchableOpacity
          style={[styles.hexSlot, { left: 0, top: 0, width: HEX_W, height: HEX_H }]}
          onPress={onPress}
          activeOpacity={0.7}
        >
          <Svg width={HEX_W} height={HEX_H} style={StyleSheet.absoluteFill}>
            <Polygon
              points={hexPoints(HEX_R, HEX_H / 2, HEX_R - 1)}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={2}
            />
          </Svg>
          <Ionicons
            name={iron.rarity === "rare" ? "star" : iron.rarity === "uncommon" ? "diamond" : "ellipse"}
            size={16}
            color={Colors.orange}
          />
          <Text style={[styles.hexLabel, { color: Colors.orange }]} numberOfLines={1}>
            {iron.name}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

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
        <Ionicons name="lock-closed" size={16} color={Colors.textMuted + "90"} />
      )}
      {unlocked && !iron && (
        <Ionicons name="ellipse-outline" size={14} color={Colors.textMuted + "BB"} />
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

function BetSlider({
  betAmount,
  onBetAmountChange,
}: {
  betAmount: number;
  onBetAmountChange: (v: number) => void;
}) {
  const trackRef = useRef<View>(null);
  const dragStartVal = useRef(betAmount);

  const sliderPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        dragStartVal.current = betAmount;
        // Tap to set — measure position
        trackRef.current?.measure((_x, _y, _w, h, _px, py) => {
          const touchY = evt.nativeEvent.pageY - py;
          const pct = 1 - Math.max(0, Math.min(1, touchY / h));
          onBetAmountChange(Math.round(pct * 100));
        });
      },
      onPanResponderMove: (evt) => {
        trackRef.current?.measure((_x, _y, _w, h, _px, py) => {
          const touchY = evt.nativeEvent.pageY - py;
          const pct = 1 - Math.max(0, Math.min(1, touchY / h));
          onBetAmountChange(Math.round(pct * 100));
        });
      },
    })
  ).current;

  const thumbBottom = (betAmount / 100) * (BET_SLIDER_HEIGHT - THUMB_HEIGHT);
  const tierColor =
    betAmount <= 33 ? Colors.text : betAmount <= 66 ? Colors.yellow : Colors.orange;

  return (
    <View style={styles.sliderColumn}>
      <Text style={styles.sliderTopLabel}>$$100</Text>
      <View
        ref={trackRef}
        style={styles.sliderTrack}
        {...sliderPan.panHandlers}
      >
        {/* Gradient background */}
        <Svg width={BET_SLIDER_WIDTH} height={BET_SLIDER_HEIGHT} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="betGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={Colors.orange} stopOpacity="0.9" />
              <Stop offset="0.5" stopColor={Colors.yellow} stopOpacity="0.5" />
              <Stop offset="1" stopColor={Colors.surface} stopOpacity="0.3" />
            </LinearGradient>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={BET_SLIDER_WIDTH}
            height={BET_SLIDER_HEIGHT}
            rx={Radius.md}
            fill="url(#betGrad)"
          />
        </Svg>

        {/* Thumb */}
        <View
          style={[
            styles.sliderThumb,
            {
              bottom: thumbBottom,
              backgroundColor: tierColor,
            },
          ]}
        >
          <Text style={styles.sliderThumbText}>$${ betAmount }</Text>
        </View>
      </View>
      <Text style={styles.sliderBottomLabel}>$$0</Text>
    </View>
  );
}

export default function HexIronBar({
  chambers,
  irons,
  maxChambers,
  betAmount,
  onBetAmountChange,
  boostedIronId,
  onBoostSelected,
}: Props) {
  const [modalIron, setModalIron] = useState<BountyEquippedIron | null>(null);
  const [spinDeg, setSpinDeg] = useState(0);
  const spinRef = useRef(0);
  const velocityRef = useRef(0);
  const isSwiping = useRef(false);
  const momentumRaf = useRef<number | null>(null);
  const snapAnim = useRef(new Animated.Value(0)).current;
  const isSnapping = useRef(false);

  // Keep refs to latest props for use in callbacks
  const ironsRef = useRef(irons);
  ironsRef.current = irons;
  const onBoostSelectedRef = useRef(onBoostSelected);
  onBoostSelectedRef.current = onBoostSelected;

  // Boost heartbeat animation
  const boostScale = useRef(new Animated.Value(1)).current;
  const boostAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const boostDelayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (boostAnimRef.current) {
      boostAnimRef.current.stop();
      boostAnimRef.current = null;
    }
    if (boostDelayTimer.current) {
      clearTimeout(boostDelayTimer.current);
      boostDelayTimer.current = null;
    }
    boostScale.setValue(1);

    if (!boostedIronId) return;

    // Delay heartbeat so it doesn't fight with snap animation
    boostDelayTimer.current = setTimeout(() => {
      const duration = BOOST_HEARTBEAT_MS;
      const beat = Animated.sequence([
        Animated.timing(boostScale, { toValue: 1.08, duration: duration * 0.08, useNativeDriver: true }),
        Animated.timing(boostScale, { toValue: 1, duration: duration * 0.08, useNativeDriver: true }),
        Animated.timing(boostScale, { toValue: 1.06, duration: duration * 0.07, useNativeDriver: true }),
        Animated.timing(boostScale, { toValue: 1, duration: duration * 0.12, useNativeDriver: true }),
        Animated.delay(duration * 0.65),
      ]);

      const loop = Animated.loop(beat);
      boostAnimRef.current = loop;
      loop.start();
    }, 1500);

    return () => {
      if (boostDelayTimer.current) clearTimeout(boostDelayTimer.current);
      if (boostAnimRef.current) {
        boostAnimRef.current.stop();
        boostScale.setValue(1);
      }
    };
  }, [boostedIronId]);

  const updateTopIron = (deg: number) => {
    const topIdx = getTopSlotIndex(deg, maxChambers);
    const slotNum = topIdx + 1;
    const topIron = ironsRef.current.find((ir) => ir.slot_number === slotNum);
    onBoostSelectedRef.current(topIron ? topIron.iron_id : null);
  };

  const stopMomentum = () => {
    if (momentumRaf.current !== null) {
      cancelAnimationFrame(momentumRaf.current);
      momentumRaf.current = null;
    }
  };

  const snapToSlot = (fromDeg: number) => {
    const topIdx = getTopSlotIndex(fromDeg, maxChambers);
    const targetDeg = getSnapAngle(fromDeg, topIdx, maxChambers);
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
  };

  // Use ref so PanResponder (created once) always calls the latest version
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

  const dragStartDeg = useRef(0);
  const lastMoveTime = useRef(0);
  const lastMoveDeg = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > SWIPE_THRESHOLD || Math.abs(g.dy) > SWIPE_THRESHOLD,
      onPanResponderGrant: () => {
        stopMomentum();
        isSnapping.current = false;
        isSwiping.current = true;
        dragStartDeg.current = spinRef.current;
        velocityRef.current = 0;
        lastMoveTime.current = Date.now();
        lastMoveDeg.current = spinRef.current;
      },
      onPanResponderMove: (_, g) => {
        const newDeg = dragStartDeg.current + g.dx * SPIN_DRAG_SENSITIVITY;
        // Track velocity manually for more accurate flick detection
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
        isSwiping.current = false;
        // Also factor in gesture velocity for flicks
        const gestureVel = g.vx * FLING_VELOCITY_MULT;
        if (Math.abs(gestureVel) > Math.abs(velocityRef.current)) {
          velocityRef.current = gestureVel;
        }
        startMomentumRef.current();
      },
      onPanResponderTerminate: () => {
        isSwiping.current = false;
      },
    })
  ).current;

  const slots = Array.from({ length: maxChambers }, (_, i) => {
    const slotNum = i + 1;
    const iron = irons.find((ir) => ir.slot_number === slotNum);
    const unlocked = i < chambers;
    return { index: i, iron, unlocked };
  });

  return (
    <View style={styles.bar}>
      {/* Left: Hex cylinder — spinnable */}
      <View
        style={[styles.hexGrid, { width: GRID_SIZE, height: GRID_SIZE }]}
        {...panResponder.panHandlers}
      >
        {/* Top marker arrow */}
        <View style={styles.topMarker}>
          <Ionicons name="caret-down" size={14} color={Colors.orange + "90"} />
        </View>

        {slots.map(({ index, iron, unlocked }) => {
          const { x, y } = getSlotCenter(index, spinDeg);
          const isBoosted = !!iron && iron.iron_id === boostedIronId;
          return (
            <HexSlot
              key={index}
              cx={x}
              cy={y}
              iron={iron}
              unlocked={unlocked}
              onPress={() => iron && setModalIron(iron)}
              isBoosted={isBoosted}
              boostScale={boostScale}
            />
          );
        })}
      </View>

      {/* Right: Bet amount slider */}
      <BetSlider betAmount={betAmount} onBetAmountChange={onBetAmountChange} />

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
              {modalIron.iron_id === boostedIronId && modalIron.boost_description && (
                <View style={styles.boostSection}>
                  <View style={styles.boostHeader}>
                    <Ionicons name="flash" size={16} color={Colors.orange} />
                    <Text style={styles.boostLabel}>BOOSTED</Text>
                  </View>
                  <Text style={styles.boostDesc}>{modalIron.boost_description}</Text>
                </View>
              )}
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

  topMarker: {
    position: "absolute",
    top: -2,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },

  sliderColumn: {
    alignItems: "center",
    gap: Spacing.xs,
    width: BET_SLIDER_WIDTH + 16,
  },
  sliderTrack: {
    width: BET_SLIDER_WIDTH,
    height: BET_SLIDER_HEIGHT,
    borderRadius: Radius.md,
    overflow: "visible",
    position: "relative",
  },
  sliderThumb: {
    position: "absolute",
    left: -6,
    width: BET_SLIDER_WIDTH + 12,
    height: THUMB_HEIGHT,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  sliderThumbText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.sm,
    color: Colors.background,
  },
  sliderTopLabel: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.xs,
    color: Colors.orange,
  },
  sliderBottomLabel: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

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
  boostSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.orange + "30",
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
    alignItems: "center",
    gap: Spacing.xs,
    width: "100%",
  },
  boostHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  boostLabel: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.sm,
    color: Colors.orange,
  },
  boostDesc: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    color: Colors.orange,
    textAlign: "center",
    lineHeight: 20,
  },
});
