import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontFamily, FontSize, Spacing, Radius } from "../utils/theme";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = SCREEN_WIDTH - Spacing.xl * 2;
const CARD_SIZE = CARD_WIDTH;
const COMMIT_THRESHOLD = CARD_WIDTH * 0.3;
const VELOCITY_THRESHOLD = 0.5;
const PICKS_PER_ROUND = 5;
const OUTCOMES = ["rise", "fall", "holster"] as const;

// ── Scoring tables ──

const DIRECTIONAL_SCORING: Record<number, { win: number; lose: number }> = {
  1: { win: 13, lose: 7 },
  2: { win: 31, lose: 18 },
  3: { win: 57, lose: 37 },
};

const HOLSTER_SCORING: Record<number, { win: number; lose: number }> = {
  1: { win: 8, lose: 4 },
  2: { win: 19, lose: 10 },
  3: { win: 35, lose: 20 },
};

const CONFIDENCE_OPTIONS = [
  { value: 1, label: "Draw", color: Colors.text, bgColor: Colors.surface },
  { value: 2, label: "Quick Draw", color: Colors.yellow, bgColor: Colors.yellow + "20" },
  { value: 3, label: "Dead Eye", color: Colors.orange, bgColor: Colors.orange + "20" },
];

// Notoriety weights per confidence (Option B)
const NOTORIETY_WEIGHT: Record<number, number> = { 1: 1, 2: 1.5, 3: 2 };

function skipCost(n: number, dd: number): number {
  return Math.ceil(25 * Math.pow(2.5, n - 1) * Math.max(1, dd / 5000));
}

const WANTED_MULTIPLIERS: Record<number, number> = {
  1: 1, 2: 2, 3: 4, 4: 8, 5: 18, 6: 42, 7: 100, 8: 230, 9: 530, 10: 1200,
};

function wantedMultiplier(level: number): number {
  if (WANTED_MULTIPLIERS[level]) return WANTED_MULTIPLIERS[level];
  // Beyond level 10: continue ~2.3x per level
  return Math.round(WANTED_MULTIPLIERS[10] * Math.pow(2.3, level - 10));
}

function randomOutcome(): string {
  return OUTCOMES[Math.floor(Math.random() * 3)];
}

const HOLSTER_COLOR = Colors.primary;

export default function SwipeTestScreen() {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const [confidence, setConfidence] = useState(1);
  const [skipCount, setSkipCount] = useState(0);
  const [balance, setBalance] = useState(5000);
  const [wantedLevel, setWantedLevel] = useState(1);
  const [pickNum, setPickNum] = useState(1);
  const [roundNotoriety, setRoundNotoriety] = useState(0);
  const [correctAnswer, setCorrectAnswer] = useState(randomOutcome);
  const [log, setLog] = useState<string[]>([]);

  const busted = balance <= 0;
  const currentSkipCostVal = skipCost(skipCount + 1, balance);
  const canSkipRef = useRef(true);
  canSkipRef.current = !busted && balance >= currentSkipCostVal;

  const mult = wantedMultiplier(wantedLevel);

  // End of round: evaluate notoriety, adjust wanted level, reset
  const endRound = (notoriety: number) => {
    let levelChange = 0;
    let label = "";
    if (notoriety >= 5) {
      levelChange = 1;
      label = "WANTED LEVEL UP!";
    } else if (notoriety <= -3) {
      levelChange = -1;
      label = "Wanted level down";
    } else {
      label = "Wanted level holds";
    }
    const newLevel = Math.max(1, wantedLevel + levelChange);
    setWantedLevel(newLevel);
    setPickNum(1);
    setRoundNotoriety(0);
    setSkipCount(0);
    setCorrectAnswer(randomOutcome());
    const newMult = wantedMultiplier(newLevel);
    setLog((prev) => [
      `── Round over (notoriety ${notoriety >= 0 ? "+" : ""}${notoriety.toFixed(1)}) → ${label} → Lv.${newLevel} (${newMult.toFixed(2)}x) ──`,
      ...prev,
    ].slice(0, 20));
  };

  const onCommit = useRef<(direction: string) => void>(() => {});
  onCommit.current = (direction: string) => {
    // Skip
    if (direction === "skip") {
      const cost = currentSkipCostVal;
      if (balance < cost) return;
      setBalance((b) => b - cost);
      setSkipCount((n) => n + 1);
      setCorrectAnswer(randomOutcome());
      setLog((prev) => [`  SKIP -$$${cost.toLocaleString()}`, ...prev].slice(0, 20));
      // Skips don't count as a pick — don't advance pickNum
      translateX.stopAnimation();
      translateY.stopAnimation();
      translateX.setValue(0);
      translateY.setValue(0);
      return;
    }

    // Score the pick
    const isHolster = direction === "holster";
    const correct = direction === correctAnswer;
    const scoring = isHolster ? HOLSTER_SCORING[confidence] : DIRECTIONAL_SCORING[confidence];
    const basePoints = correct ? scoring.win : -scoring.lose;
    const scaledPoints = Math.round(basePoints * mult);
    const notorietyDelta = NOTORIETY_WEIGHT[confidence] * (correct ? 1 : -1);
    const newNotoriety = roundNotoriety + notorietyDelta;

    const newBalance = balance + scaledPoints;
    setBalance(newBalance);
    setRoundNotoriety(newNotoriety);

    const conf = CONFIDENCE_OPTIONS.find((o) => o.value === confidence)!;
    const dirLabel = direction.toUpperCase();
    const correctLabel = correctAnswer.toUpperCase();
    const icon = correct ? "+" : "";
    const entry = `${correct ? "✓" : "✗"} ${dirLabel} (${conf.label}) → was ${correctLabel} | ${icon}${scaledPoints} (${basePoints} × ${mult.toFixed(2)}x)`;
    setLog((prev) => [entry, ...prev].slice(0, 20));

    // Busted — game over
    if (newBalance <= 0) {
      setLog((prev) => [`💀 BUSTED — bounty hunt is over`, ...prev].slice(0, 20));
      return;
    }

    const nextPick = pickNum + 1;
    if (nextPick > PICKS_PER_ROUND) {
      // End of round — process after a tick so log renders first
      setTimeout(() => endRound(newNotoriety), 50);
    } else {
      setPickNum(nextPick);
      setCorrectAnswer(randomOutcome());
    }

    translateX.stopAnimation();
    translateY.stopAnimation();
    translateX.setValue(0);
    translateY.setValue(0);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 10 || Math.abs(g.dy) > 10,
      onPanResponderMove: (_, g) => {
        translateX.setValue(g.dx);
        if (g.dy < 0 && !canSkipRef.current) {
          translateY.setValue(g.dy * 0.3);
        } else {
          translateY.setValue(g.dy);
        }
      },
      onPanResponderRelease: (_, g) => {
        const absDx = Math.abs(g.dx);
        const absDy = Math.abs(g.dy);
        const isHorizontal = absDx >= absDy;

        if (isHorizontal) {
          const committed =
            absDx > COMMIT_THRESHOLD ||
            (Math.abs(g.vx) > VELOCITY_THRESHOLD && absDx > 20);
          if (committed) {
            const dir = g.dx > 0 ? "rise" : "fall";
            Animated.spring(translateX, {
              toValue: g.dx > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH,
              useNativeDriver: true,
            }).start(() => onCommit.current(dir));
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          } else {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
          }
        } else {
          if (g.dy < 0 && !canSkipRef.current) {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
            return;
          }
          const committed =
            absDy > COMMIT_THRESHOLD ||
            (Math.abs(g.vy) > VELOCITY_THRESHOLD && absDy > 20);
          if (committed) {
            const dir = g.dy < 0 ? "skip" : "holster";
            Animated.spring(translateY, {
              toValue: g.dy < 0 ? -SCREEN_WIDTH : SCREEN_WIDTH,
              useNativeDriver: true,
            }).start(() => onCommit.current(dir));
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          } else {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
          }
        }
      },
    })
  ).current;

  // Direction indicator opacities
  const riseOpacity = translateX.interpolate({
    inputRange: [0, 30, COMMIT_THRESHOLD],
    outputRange: [0, 0.3, 1],
    extrapolate: "clamp",
  });
  const fallOpacity = translateX.interpolate({
    inputRange: [-COMMIT_THRESHOLD, -30, 0],
    outputRange: [1, 0.3, 0],
    extrapolate: "clamp",
  });
  const skipOpacity = translateY.interpolate({
    inputRange: [-COMMIT_THRESHOLD, -30, 0],
    outputRange: [1, 0.3, 0],
    extrapolate: "clamp",
  });
  const holsterOpacity = translateY.interpolate({
    inputRange: [0, 30, COMMIT_THRESHOLD],
    outputRange: [0, 0.3, 1],
    extrapolate: "clamp",
  });

  // Card color overlays
  const riseBgOpacity = translateX.interpolate({
    inputRange: [0, COMMIT_THRESHOLD],
    outputRange: [0, 0.15],
    extrapolate: "clamp",
  });
  const fallBgOpacity = translateX.interpolate({
    inputRange: [-COMMIT_THRESHOLD, 0],
    outputRange: [0.15, 0],
    extrapolate: "clamp",
  });
  const skipBgOpacity = translateY.interpolate({
    inputRange: [-COMMIT_THRESHOLD, 0],
    outputRange: [0.15, 0],
    extrapolate: "clamp",
  });
  const holsterBgOpacity = translateY.interpolate({
    inputRange: [0, COMMIT_THRESHOLD],
    outputRange: [0, 0.15],
    extrapolate: "clamp",
  });

  const cardRotation = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ["-12deg", "0deg", "12deg"],
    extrapolate: "clamp",
  });

  const resetGame = () => {
    setSkipCount(0);
    setBalance(5000);
    setWantedLevel(1);
    setPickNum(1);
    setRoundNotoriety(0);
    setConfidence(1);
    setCorrectAnswer(randomOutcome());
    setLog([]);
    translateX.stopAnimation();
    translateY.stopAnimation();
    translateX.setValue(0);
    translateY.setValue(0);
  };

  const dirScore = DIRECTIONAL_SCORING[confidence];
  const holScore = HOLSTER_SCORING[confidence];
  const dirWin = Math.round(dirScore.win * mult);
  const dirLose = Math.round(dirScore.lose * mult);
  const holWin = Math.round(holScore.win * mult);
  const holLose = Math.round(holScore.lose * mult);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header row: balance + wanted level */}
      <View style={styles.titleRow}>
        <Text style={[styles.balanceText, balance < 0 && { color: Colors.accent }]}>
          $${balance.toLocaleString()}
        </Text>
        <Text style={styles.wantedText}>
          Lv.{wantedLevel} ({mult.toFixed(2)}x)
        </Text>
      </View>

      {/* Round progress + confidence selector */}
      <View style={styles.statusRow}>
        <Text style={styles.pickCounter}>Card {pickNum}/{PICKS_PER_ROUND}</Text>
        <View style={styles.confRow}>
          {CONFIDENCE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.confPill,
                {
                  backgroundColor: confidence === opt.value ? opt.bgColor : Colors.card,
                  borderColor: confidence === opt.value ? opt.color : Colors.border,
                },
              ]}
              onPress={() => setConfidence(opt.value)}
            >
              <Text
                style={[
                  styles.confPillText,
                  { color: confidence === opt.value ? opt.color : Colors.textMuted },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Swipe area */}
      <View style={styles.swipeArea}>
        {/* Skip indicator (top) */}
        <Animated.View style={[styles.indicator, styles.topIndicator, { opacity: skipOpacity }]}>
          <Ionicons
            name={canSkipRef.current ? "play-skip-forward" : "lock-closed"}
            size={22}
            color={canSkipRef.current ? Colors.orange : Colors.textMuted}
          />
          <Text style={[styles.indicatorLabel, { color: canSkipRef.current ? Colors.orange : Colors.textMuted }]}>
            {canSkipRef.current ? "SKIP" : "CAN'T AFFORD"}
          </Text>
          <Text style={[styles.indicatorScore, { color: canSkipRef.current ? Colors.orange : Colors.textMuted }]}>
            $${currentSkipCostVal.toLocaleString()}
          </Text>
        </Animated.View>

        {/* Fall indicator (left) */}
        <Animated.View style={[styles.indicator, styles.leftIndicator, { opacity: fallOpacity }]}>
          <Ionicons name="trending-down" size={22} color={Colors.accent} />
          <Text style={[styles.indicatorLabel, { color: Colors.accent }]}>FALL</Text>
          <Text style={styles.indicatorScore}>
            <Text style={{ color: Colors.green }}>+{dirWin}</Text>
            {" / "}
            <Text style={{ color: Colors.accent }}>-{dirLose}</Text>
          </Text>
        </Animated.View>

        {/* Rise indicator (right) */}
        <Animated.View style={[styles.indicator, styles.rightIndicator, { opacity: riseOpacity }]}>
          <Ionicons name="trending-up" size={22} color={Colors.green} />
          <Text style={[styles.indicatorLabel, { color: Colors.green }]}>RISE</Text>
          <Text style={styles.indicatorScore}>
            <Text style={{ color: Colors.green }}>+{dirWin}</Text>
            {" / "}
            <Text style={{ color: Colors.accent }}>-{dirLose}</Text>
          </Text>
        </Animated.View>

        {/* Holster indicator (bottom) */}
        <Animated.View style={[styles.indicator, styles.bottomIndicator, { opacity: holsterOpacity }]}>
          <Ionicons name="shield-checkmark" size={22} color={HOLSTER_COLOR} />
          <Text style={[styles.indicatorLabel, { color: HOLSTER_COLOR }]}>HOLSTER</Text>
          <Text style={styles.indicatorScore}>
            <Text style={{ color: Colors.green }}>+{holWin}</Text>
            {" / "}
            <Text style={{ color: Colors.accent }}>-{holLose}</Text>
          </Text>
        </Animated.View>

        {/* Card */}
        <Animated.View
          style={[
            styles.card,
            {
              transform: [
                { translateX },
                { translateY },
                { rotate: cardRotation },
              ],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <Animated.View style={[styles.cardOverlay, { backgroundColor: Colors.green, opacity: riseBgOpacity }]} />
          <Animated.View style={[styles.cardOverlay, { backgroundColor: Colors.accent, opacity: fallBgOpacity }]} />
          <Animated.View style={[styles.cardOverlay, { backgroundColor: Colors.orange, opacity: skipBgOpacity }]} />
          <Animated.View style={[styles.cardOverlay, { backgroundColor: HOLSTER_COLOR, opacity: holsterBgOpacity }]} />

          <View style={styles.cardContent}>
            <Text style={styles.cardPickNum}>Card {pickNum}</Text>
            <Text style={styles.cardAnswer}>
              Answer: {correctAnswer === "rise" ? "→ RISE" : correctAnswer === "fall" ? "← FALL" : "↓ HOLSTER"}
            </Text>
            <Text style={styles.cardHint}>← Fall  |  Rise →</Text>
            <Text style={styles.cardHint}>↑ Skip  |  Holster ↓</Text>
          </View>
        </Animated.View>
      </View>

      {/* Log */}
      <View style={styles.logArea}>
        <View style={styles.logHeader}>
          <Text style={styles.logTitle}>Skips: {skipCount}</Text>
          <TouchableOpacity onPress={resetGame}>
            <Text style={styles.resetText}>Reset All</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.logScroll}>
          {log.length === 0 ? (
            <Text style={styles.logEmpty}>Swipe cards to play...</Text>
          ) : (
            log.map((entry, i) => (
              <Text
                key={i}
                style={[
                  styles.logEntry,
                  entry.startsWith("✓") && { color: Colors.green },
                  entry.startsWith("✗") && { color: Colors.accent },
                  entry.startsWith("──") && { color: Colors.yellow, fontFamily: FontFamily.bold },
                ]}
              >
                {entry}
              </Text>
            ))
          )}
        </ScrollView>
      </View>
      {/* Game over overlay */}
      {busted && (
        <View style={styles.gameOverOverlay}>
          <View style={styles.gameOverCard}>
            <Ionicons name="skull" size={48} color={Colors.accent} />
            <Text style={styles.gameOverTitle}>BUSTED</Text>
            <Text style={styles.gameOverSub}>
              You reached Lv.{wantedLevel} ({wantedMultiplier(wantedLevel)}x)
            </Text>
            <TouchableOpacity style={styles.newHuntButton} onPress={resetGame}>
              <Text style={styles.newHuntText}>Start a New Hunt</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.xl,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: Spacing.sm,
  },
  balanceText: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.yellow,
  },
  wantedText: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.orange,
  },

  // Status row
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  pickCounter: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  confRow: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.xs,
  },
  confPill: {
    flex: 1,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  confPillText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.xs,
  },

  // Swipe area
  swipeArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: Spacing.sm,
  },

  // Card
  card: {
    width: CARD_WIDTH,
    height: CARD_SIZE,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.lg,
  },
  cardContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
  },
  cardPickNum: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xxxl,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },
  cardAnswer: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xl,
    color: Colors.yellow,
    marginBottom: Spacing.sm,
  },
  cardHint: {
    color: Colors.textMuted,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
  },

  // Indicators
  indicator: {
    position: "absolute",
    alignItems: "center",
    gap: 2,
    zIndex: 10,
  },
  topIndicator: {
    top: 0,
    left: 0,
    right: 0,
  },
  bottomIndicator: {
    bottom: 0,
    left: 0,
    right: 0,
  },
  leftIndicator: {
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  rightIndicator: {
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  indicatorLabel: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.sm,
  },
  indicatorScore: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  // Log
  logArea: {
    height: 160,
    marginBottom: Spacing.md,
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  logTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  resetText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.sm,
    color: Colors.orange,
  },
  logScroll: {
    flex: 1,
  },
  logEmpty: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  logEntry: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    paddingVertical: 1,
  },

  // Game over
  gameOverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  gameOverCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accent,
    padding: Spacing.xxl,
    alignItems: "center",
    gap: Spacing.md,
    width: CARD_WIDTH * 0.8,
  },
  gameOverTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xxxl,
    color: Colors.accent,
  },
  gameOverSub: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  newHuntButton: {
    backgroundColor: Colors.orange,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
  },
  newHuntText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.lg,
    color: Colors.background,
  },
});
