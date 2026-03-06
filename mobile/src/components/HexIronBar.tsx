import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, Animated, PanResponder, Easing, LayoutChangeEvent } from "react-native";
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
const BET_SLIDER_WIDTH = 56;
const THUMB_HEIGHT = 28;

interface Props {
  chambers: number;
  irons: BountyEquippedIron[];
  maxChambers: number;
  betAmount: number;
  onBetAmountChange: (value: number) => void;
  boostedIronId: string | null;
  onBoostSelected: (ironId: string | null) => void;
  leverage: number;
  onLeverageChange: (v: number) => void;
  maxLeverage: number;
  marginCallCooldown: number;
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

  // Iron always takes priority over lock state — if an iron exists, show it
  const hasIron = !!iron;

  const strokeColor = hasIron
    ? isBoosted
      ? Colors.orange
      : rarityColor(iron!.rarity) + "CC"
    : !unlocked
      ? Colors.textMuted + "65"
      : Colors.textMuted + "90";
  const fillColor = hasIron
    ? isBoosted
      ? Colors.orange + "50"
      : rarityColor(iron!.rarity) + "35"
    : !unlocked
      ? Colors.card + "85"
      : Colors.surface + "30";
  const dashArray = hasIron ? undefined : "3,3";

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
            name={iron.rarity === "legendary" ? "flash" : iron.rarity === "rare" ? "star" : iron.rarity === "uncommon" ? "diamond" : "ellipse"}
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
      onPress={hasIron ? onPress : undefined}
      activeOpacity={hasIron ? 0.7 : 1}
      disabled={!hasIron}
    >
      <Svg width={HEX_W} height={HEX_H} style={StyleSheet.absoluteFill}>
        <Polygon
          points={hexPoints(HEX_R, HEX_H / 2, HEX_R - 1)}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={hasIron ? 1.5 : 1}
          strokeDasharray={dashArray}
        />
      </Svg>
      {/* Iron always visible if equipped, regardless of lock state */}
      {hasIron ? (
        <>
          <Ionicons
            name={iron!.rarity === "legendary" ? "flash" : iron!.rarity === "rare" ? "star" : iron!.rarity === "uncommon" ? "diamond" : "ellipse"}
            size={16}
            color={rarityColor(iron!.rarity)}
          />
          <Text style={[styles.hexLabel, { color: rarityColor(iron!.rarity) }]} numberOfLines={1}>
            {iron!.name}
          </Text>
        </>
      ) : !unlocked ? (
        <Ionicons name="lock-closed" size={14} color={Colors.textMuted + "90"} />
      ) : (
        <Ionicons name="ellipse-outline" size={14} color={Colors.textMuted + "BB"} />
      )}
    </TouchableOpacity>
  );
}

// ── Slider flame particles ──

const FLAME_BASE = "#FA8057";
const FLAME_MID = "#FAD009";
const FLAME_TIP = "#ED2EA5";
const SLIDER_PARTICLE_COUNT = 18;

interface SliderParticleConfig {
  x: number;
  startY: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  driftX: number;
  driftY: number;
  maxOpacity: number;
}

function generateSliderParticles(): SliderParticleConfig[] {
  const particles: SliderParticleConfig[] = [];
  for (let i = 0; i < SLIDER_PARTICLE_COUNT; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const colors = [FLAME_BASE, FLAME_MID, FLAME_TIP];
    particles.push({
      x: BET_SLIDER_WIDTH / 2 + side * (Math.random() * (BET_SLIDER_WIDTH / 2 + 6)),
      startY: 0,
      size: 2 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 600,
      duration: 400 + Math.random() * 400,
      driftX: (Math.random() - 0.5) * 10,
      driftY: -(8 + Math.random() * 14),
      maxOpacity: 0.6 + Math.random() * 0.3,
    });
  }
  return particles;
}

const SliderFlameParticle = React.memo(function SliderFlameParticle({
  config,
  thumbY,
  masterOpacity,
}: {
  config: SliderParticleConfig;
  thumbY: number;
  masterOpacity: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const driftX = useRef(new Animated.Value(0)).current;
  const driftY = useRef(new Animated.Value(0)).current;
  const thumbYRef = useRef(thumbY);
  const masterOpRef = useRef(masterOpacity);
  thumbYRef.current = thumbY;
  masterOpRef.current = masterOpacity;

  useEffect(() => {
    let cancelled = false;
    let currentAnim: Animated.CompositeAnimation | null = null;

    const animate = () => {
      if (cancelled) return;
      driftX.setValue(0);
      driftY.setValue(0);
      opacity.setValue(0);

      const peakOpacity = config.maxOpacity * masterOpRef.current;
      if (peakOpacity < 0.01) {
        const t = setTimeout(animate, config.duration + config.delay);
        return () => clearTimeout(t);
      }

      currentAnim = Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, { toValue: peakOpacity, duration: config.duration * 0.25, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: config.duration * 0.75, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.timing(driftX, { toValue: config.driftX, duration: config.duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(driftY, { toValue: config.driftY, duration: config.duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]);
      currentAnim.start(({ finished }) => { if (finished && !cancelled) animate(); });
    };

    const timeout = setTimeout(animate, config.delay);
    return () => { cancelled = true; clearTimeout(timeout); currentAnim?.stop(); };
  }, []);

  const baseTop = thumbY + config.startY - config.size / 2 + (Math.random() - 0.5) * 10;

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: config.x - config.size / 2,
        top: baseTop,
        width: config.size,
        height: config.size,
        borderRadius: 1,
        backgroundColor: config.color,
        opacity,
        transform: [{ translateX: driftX as unknown as number }, { translateY: driftY as unknown as number }],
      }}
    />
  );
});

function BetSlider({
  betAmount,
  onBetAmountChange,
}: {
  betAmount: number;
  onBetAmountChange: (v: number) => void;
}) {
  const trackRef = useRef<View>(null);
  const onBetAmountChangeRef = useRef(onBetAmountChange);
  onBetAmountChangeRef.current = onBetAmountChange;

  const sliderPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        trackRef.current?.measure((_x, _y, _w, h, _px, py) => {
          const touchY = evt.nativeEvent.pageY - py;
          const pct = 1 - Math.max(0, Math.min(1, touchY / h));
          onBetAmountChangeRef.current(Math.round(pct * 100));
        });
      },
      onPanResponderMove: (evt) => {
        trackRef.current?.measure((_x, _y, _w, h, _px, py) => {
          const touchY = evt.nativeEvent.pageY - py;
          const pct = 1 - Math.max(0, Math.min(1, touchY / h));
          onBetAmountChangeRef.current(Math.round(pct * 100));
        });
      },
    })
  ).current;

  // ── Erratic shake (random jitter — feels like it's about to burst) ──
  const shakeX = useRef(new Animated.Value(0)).current;
  const shakeRot = useRef(new Animated.Value(0)).current;
  const shakeRaf = useRef<ReturnType<typeof setTimeout> | null>(null);

  // t: 0 at bet=0, 1 at bet=100 — squared for gentler ramp (calmer at mid-range)
  const tLinear = Math.max(0, (betAmount - 10) / 90);
  const t = tLinear * tLinear;

  useEffect(() => {
    if (shakeRaf.current) { clearTimeout(shakeRaf.current); shakeRaf.current = null; }
    if (betAmount < 10) {
      shakeX.setValue(0);
      shakeRot.setValue(0);
      return;
    }

    const ampX = t * 2.5;
    const ampRot = t * 3;
    const interval = Math.max(30, 90 - t * 55);

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      shakeX.setValue((Math.random() * 2 - 1) * ampX);
      shakeRot.setValue((Math.random() * 2 - 1) * ampRot);
      shakeRaf.current = setTimeout(tick, interval + Math.random() * 20);
    };
    tick();

    return () => { cancelled = true; if (shakeRaf.current) clearTimeout(shakeRaf.current); shakeX.setValue(0); shakeRot.setValue(0); };
  }, [betAmount]);

  // ── Flame particles ──
  const flameParticles = useMemo(() => generateSliderParticles(), []);
  // Flame visibility: 0 at bet≤15, 1 at bet=100
  const flameOpacity = betAmount <= 15 ? 0 : (betAmount - 15) / 85;

  const thumbBottom = (betAmount / 100) * (BET_SLIDER_HEIGHT - THUMB_HEIGHT);
  const thumbTop = BET_SLIDER_HEIGHT - THUMB_HEIGHT - thumbBottom;
  const tierColor =
    betAmount <= 33 ? Colors.text : betAmount <= 66 ? Colors.yellow : Colors.orange;

  return (
    <View style={styles.sliderColumn}>
      {/* Spacer to match leverage slider's label area above */}
      <View style={{ height: 13 }} />
      <Animated.View
        style={[styles.sliderOuter, { transform: [
          { translateX: shakeX as unknown as number },
          { rotate: shakeRot.interpolate({ inputRange: [-10, 10], outputRange: ["-10deg", "10deg"] }) as unknown as string },
        ] }]}
      >
        {/* Flame particles behind the track */}
        {flameOpacity > 0 && (
          <View style={styles.flameContainer} pointerEvents="none">
            {flameParticles.map((p, i) => (
              <SliderFlameParticle key={i} config={p} thumbY={thumbTop + THUMB_HEIGHT / 2} masterOpacity={flameOpacity} />
            ))}
          </View>
        )}

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
      </Animated.View>
    </View>
  );
}

// Leverage slider uses same dimensions as bet slider for visual consistency
const LEV_FLAME_BASE = "#FF4040";
const LEV_FLAME_MID = "#FF8800";
const LEV_FLAME_TIP = "#ED2EA5";

function generateLeverageParticles(): SliderParticleConfig[] {
  const particles: SliderParticleConfig[] = [];
  for (let i = 0; i < SLIDER_PARTICLE_COUNT; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const colors = [LEV_FLAME_BASE, LEV_FLAME_MID, LEV_FLAME_TIP];
    particles.push({
      x: BET_SLIDER_WIDTH / 2 + side * (Math.random() * (BET_SLIDER_WIDTH / 2 + 6)),
      startY: 0,
      size: 2 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 600,
      duration: 400 + Math.random() * 400,
      driftX: (Math.random() - 0.5) * 10,
      driftY: -(8 + Math.random() * 14),
      maxOpacity: 0.6 + Math.random() * 0.3,
    });
  }
  return particles;
}

function LeverageSlider({
  leverage,
  onLeverageChange,
  maxLeverage,
  marginCallCooldown,
}: {
  leverage: number;
  onLeverageChange: (v: number) => void;
  maxLeverage: number;
  marginCallCooldown: number;
}) {
  const trackRef = useRef<View>(null);
  const isLocked = marginCallCooldown > 0;
  const onLeverageChangeRef = useRef(onLeverageChange);
  onLeverageChangeRef.current = onLeverageChange;
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;
  const maxLeverageRef = useRef(maxLeverage);
  maxLeverageRef.current = maxLeverage;

  const sliderPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (isLockedRef.current) return;
        trackRef.current?.measure((_x, _y, _w, h, _px, py) => {
          const touchY = evt.nativeEvent.pageY - py;
          const pct = 1 - Math.max(0, Math.min(1, touchY / h));
          const range = maxLeverageRef.current - 1.0;
          const raw = 1.0 + pct * range;
          // Round to 2 decimal places for smooth but clean values
          onLeverageChangeRef.current(Math.min(maxLeverageRef.current, Math.round(raw * 100) / 100));
        });
      },
      onPanResponderMove: (evt) => {
        if (isLockedRef.current) return;
        trackRef.current?.measure((_x, _y, _w, h, _px, py) => {
          const touchY = evt.nativeEvent.pageY - py;
          const pct = 1 - Math.max(0, Math.min(1, touchY / h));
          const range = maxLeverageRef.current - 1.0;
          const raw = 1.0 + pct * range;
          onLeverageChangeRef.current(Math.min(maxLeverageRef.current, Math.round(raw * 100) / 100));
        });
      },
    })
  ).current;

  // ── Erratic shake (mirrors BetSlider) ──
  const shakeX = useRef(new Animated.Value(0)).current;
  const shakeRot = useRef(new Animated.Value(0)).current;
  const shakeRaf = useRef<ReturnType<typeof setTimeout> | null>(null);

  // t: 0 at 1x, 1 at maxLeverage — squared for gentler ramp (calmer at mid-range)
  const levRange = maxLeverage - 1.0 || 1;
  const tLinear = Math.max(0, (leverage - 1.0) / levRange);
  const t = tLinear * tLinear;

  useEffect(() => {
    if (shakeRaf.current) { clearTimeout(shakeRaf.current); shakeRaf.current = null; }
    if (leverage <= 1.05) {
      shakeX.setValue(0);
      shakeRot.setValue(0);
      return;
    }

    const ampX = t * 2.5;
    const ampRot = t * 3;
    const interval = Math.max(30, 90 - t * 55);

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      shakeX.setValue((Math.random() * 2 - 1) * ampX);
      shakeRot.setValue((Math.random() * 2 - 1) * ampRot);
      shakeRaf.current = setTimeout(tick, interval + Math.random() * 20);
    };
    tick();

    return () => { cancelled = true; if (shakeRaf.current) clearTimeout(shakeRaf.current); shakeX.setValue(0); shakeRot.setValue(0); };
  }, [leverage]);

  // ── Flame particles ──
  const flameParticles = useMemo(() => generateLeverageParticles(), []);
  // Flame visibility: 0 at leverage <= 1.1, 1 at maxLeverage
  const flameOpacity = leverage <= 1.1 ? 0 : Math.min(1, (leverage - 1.1) / (maxLeverage - 1.1 || 1));

  const range = maxLeverage - 1.0;
  const normalizedPct = range > 0 ? (leverage - 1.0) / range : 0;
  const thumbBottom = normalizedPct * (BET_SLIDER_HEIGHT - THUMB_HEIGHT);
  const thumbTop = BET_SLIDER_HEIGHT - THUMB_HEIGHT - thumbBottom;

  // Color: primary at 1x → orange mid → accent at max
  const thumbColor = isLocked
    ? Colors.textMuted
    : leverage <= 1.0
      ? Colors.primary
      : t <= 0.5
        ? Colors.orange
        : Colors.accent;

  const carryCost = Math.round((leverage - 1.0) * 10);

  return (
    <View style={styles.sliderColumn}>
      {/* Labels above the slider so both bars stay at the same height */}
      {isLocked ? (
        <Text style={{ fontFamily: FontFamily.bold, fontSize: 9, color: Colors.accent, marginBottom: 2 }}>
          COOLDOWN
        </Text>
      ) : carryCost > 0 ? (
        <Text style={{ fontFamily: FontFamily.medium, fontSize: 9, color: Colors.orange, marginBottom: 2 }}>
          -$${carryCost}
        </Text>
      ) : (
        <View style={{ height: 13 }} />
      )}
      <Animated.View
        style={[styles.sliderOuter, { transform: [
          { translateX: shakeX as unknown as number },
          { rotate: shakeRot.interpolate({ inputRange: [-10, 10], outputRange: ["-10deg", "10deg"] }) as unknown as string },
        ] }]}
      >
        {/* Flame particles behind the track */}
        {flameOpacity > 0 && (
          <View style={styles.flameContainer} pointerEvents="none">
            {flameParticles.map((p, i) => (
              <SliderFlameParticle key={i} config={p} thumbY={thumbTop + THUMB_HEIGHT / 2} masterOpacity={flameOpacity} />
            ))}
          </View>
        )}

        <View
          ref={trackRef}
          style={styles.sliderTrack}
          {...sliderPan.panHandlers}
        >
          <Svg width={BET_SLIDER_WIDTH} height={BET_SLIDER_HEIGHT} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="levGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={Colors.accent} stopOpacity="0.9" />
                <Stop offset="0.5" stopColor={Colors.orange} stopOpacity="0.5" />
                <Stop offset="1" stopColor={Colors.surface} stopOpacity="0.3" />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={BET_SLIDER_WIDTH} height={BET_SLIDER_HEIGHT} rx={Radius.md} fill="url(#levGrad)" />
          </Svg>

          {/* Thumb */}
          <View
            style={[
              styles.sliderThumb,
              {
                bottom: thumbBottom,
                backgroundColor: thumbColor,
              },
            ]}
          >
            <Text style={styles.sliderThumbText}>
              {isLocked ? "1.0x" : `${leverage.toFixed(2)}x`}
            </Text>
          </View>
        </View>
      </Animated.View>
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
  leverage,
  onLeverageChange,
  maxLeverage,
  marginCallCooldown,
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

  const lastMoveTime = useRef(0);
  const lastMoveDeg = useRef(0);
  // Angular tracking: store the angle of the initial touch and the page-coordinates of the ring center
  const touchStartAngle = useRef(0);
  const spinAtTouchStart = useRef(0);
  const ringCenterPage = useRef({ px: 0, py: 0 });
  const hexGridRef = useRef<View>(null);

  /** Angle (degrees) from ring center to a page-coordinate point */
  const angleFromCenter = (pageX: number, pageY: number) => {
    const dx = pageX - ringCenterPage.current.px;
    const dy = pageY - ringCenterPage.current.py;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > SWIPE_THRESHOLD || Math.abs(g.dy) > SWIPE_THRESHOLD,
      onPanResponderGrant: (evt) => {
        stopMomentum();
        isSnapping.current = false;
        isSwiping.current = true;
        velocityRef.current = 0;
        lastMoveTime.current = Date.now();
        lastMoveDeg.current = spinRef.current;

        // Measure ring center on screen, then compute start angle
        hexGridRef.current?.measure((_x, _y, w, h, px, py) => {
          ringCenterPage.current = { px: px + w / 2, py: py + h / 2 };
          touchStartAngle.current = angleFromCenter(
            evt.nativeEvent.pageX,
            evt.nativeEvent.pageY,
          );
          spinAtTouchStart.current = spinRef.current;
        });
      },
      onPanResponderMove: (evt) => {
        const currentAngle = angleFromCenter(
          evt.nativeEvent.pageX,
          evt.nativeEvent.pageY,
        );
        let delta = currentAngle - touchStartAngle.current;
        // Wrap around ±180
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
        isSwiping.current = false;
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

  // Find the currently boosted iron for the info label
  const boostedIron = boostedIronId
    ? irons.find((ir) => ir.iron_id === boostedIronId)
    : null;

  return (
    <View style={styles.bar}>
      {/* Left: Hex cylinder — spinnable */}
      <View style={styles.revolverColumn}>
        <View
          ref={hexGridRef}
          style={[styles.hexGrid, { width: GRID_SIZE, height: GRID_SIZE }]}
          {...panResponder.panHandlers}
        >
          {/* Top marker arrow */}
          <View style={styles.topMarker}>
            <Ionicons name="caret-down" size={14} color={Colors.orange + "90"} />
          </View>

          {/* Render locked/empty slots first, then equipped irons on top */}
          {[...slots]
            .sort((a, b) => {
              // Irons render last (highest z), boosted iron last of all
              const aWeight = a.iron ? (a.iron.iron_id === boostedIronId ? 2 : 1) : 0;
              const bWeight = b.iron ? (b.iron.iron_id === boostedIronId ? 2 : 1) : 0;
              return aWeight - bWeight;
            })
            .map(({ index, iron, unlocked }) => {
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

        {/* Iron info label — always visible */}
        {boostedIron ? (
          <TouchableOpacity onPress={() => setModalIron(boostedIron)} activeOpacity={0.7} style={styles.ironInfoLabel}>
            <Ionicons
              name={boostedIron.rarity === "legendary" ? "flash" : boostedIron.rarity === "rare" ? "star" : boostedIron.rarity === "uncommon" ? "diamond" : "ellipse"}
              size={11}
              color={boostedIron.rarity === "legendary" ? Colors.orange : rarityColor(boostedIron.rarity)}
            />
            <Text style={[styles.ironInfoName, { color: boostedIron.rarity === "legendary" ? Colors.orange : rarityColor(boostedIron.rarity) }]} numberOfLines={1}>
              {boostedIron.name}
            </Text>
            <Text style={styles.ironInfoDesc} numberOfLines={1}>
              {boostedIron.description}
            </Text>
          </TouchableOpacity>
        ) : irons.length === 0 ? (
          <Text style={styles.ironInfoEmpty}>No irons</Text>
        ) : null}
      </View>

      {/* Center: Bet amount slider */}
      <BetSlider betAmount={betAmount} onBetAmountChange={onBetAmountChange} />

      {/* Right: Leverage slider */}
      <LeverageSlider
        leverage={leverage}
        onLeverageChange={onLeverageChange}
        maxLeverage={maxLeverage}
        marginCallCooldown={marginCallCooldown}
      />

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

  revolverColumn: {
    alignItems: "center",
  },
  hexGrid: {
    position: "relative",
  },
  ironInfoLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: GRID_SIZE,
    paddingHorizontal: 4,
    marginTop: -4,
  },
  ironInfoName: {
    fontFamily: FontFamily.bold,
    fontSize: 9,
    flexShrink: 0,
  },
  ironInfoDesc: {
    fontFamily: FontFamily.regular,
    fontSize: 8,
    color: Colors.textMuted,
    flexShrink: 1,
  },
  ironInfoEmpty: {
    fontFamily: FontFamily.regular,
    fontSize: 9,
    color: Colors.textMuted + "80",
    marginTop: -4,
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
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  sliderOuter: {
    width: BET_SLIDER_WIDTH,
    height: BET_SLIDER_HEIGHT,
    position: "relative",
  },
  flameContainer: {
    position: "absolute",
    top: -20,
    left: -10,
    right: -10,
    bottom: 0,
    overflow: "visible",
    zIndex: -1,
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
