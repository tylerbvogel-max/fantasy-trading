import React, { useRef } from "react";
import { View, Text, StyleSheet, Dimensions, Animated, PanResponder } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontFamily, FontSize, Spacing, Radius } from "../utils/theme";
import ProbabilityConeChart from "./ProbabilityConeChart";

interface SpyCandlePoint {
  timestamp: number;
  close: number;
}

interface SwipeCardProps {
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  enabled: boolean;
  candles: SpyCandlePoint[];
  openPrice?: number | null;
  symbol?: string;
  name?: string;
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = SCREEN_WIDTH - Spacing.xl * 2;
const CARD_SIZE = CARD_WIDTH; // square
const COMMIT_THRESHOLD = CARD_WIDTH * 0.3;
const VELOCITY_THRESHOLD = 0.5;
const CHART_WIDTH = CARD_WIDTH - Spacing.lg * 2;
const CHART_HEIGHT = CARD_SIZE - 120; // leave room for header + direction hints

export default function SwipeCard({ onSwipeRight, onSwipeLeft, enabled, candles, openPrice, symbol = "SPY", name }: SwipeCardProps) {
  const translateX = useRef(new Animated.Value(0)).current;

  const hasPrice = (candles && candles.length >= 2) || !!openPrice;
  const canSwipe = enabled && hasPrice;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        canSwipe && Math.abs(gesture.dx) > 10,
      onPanResponderMove: (_, gesture) => {
        if (!canSwipe) return;
        translateX.setValue(gesture.dx);
      },
      onPanResponderRelease: (_, gesture) => {
        if (!canSwipe) {
          translateX.setValue(0);
          return;
        }

        const swipedRight =
          gesture.dx > COMMIT_THRESHOLD || gesture.vx > VELOCITY_THRESHOLD;
        const swipedLeft =
          gesture.dx < -COMMIT_THRESHOLD || gesture.vx < -VELOCITY_THRESHOLD;

        if (swipedRight) {
          Animated.spring(translateX, {
            toValue: SCREEN_WIDTH,
            useNativeDriver: true,
          }).start(() => {
            onSwipeRight();
          });
        } else if (swipedLeft) {
          Animated.spring(translateX, {
            toValue: -SCREEN_WIDTH,
            useNativeDriver: true,
          }).start(() => {
            onSwipeLeft();
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const rightOpacity = translateX.interpolate({
    inputRange: [0, 30, COMMIT_THRESHOLD],
    outputRange: [0, 0.3, 1],
    extrapolate: "clamp",
  });

  const leftOpacity = translateX.interpolate({
    inputRange: [-COMMIT_THRESHOLD, -30, 0],
    outputRange: [1, 0.3, 0],
    extrapolate: "clamp",
  });

  const cardRotation = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ["-12deg", "0deg", "12deg"],
    extrapolate: "clamp",
  });

  const rightBgOpacity = translateX.interpolate({
    inputRange: [0, COMMIT_THRESHOLD],
    outputRange: [0, 0.15],
    extrapolate: "clamp",
  });

  const leftBgOpacity = translateX.interpolate({
    inputRange: [-COMMIT_THRESHOLD, 0],
    outputRange: [0.15, 0],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.wrapper}>
      {/* Left indicator (DOWN) */}
      <Animated.View style={[styles.sideIndicator, styles.leftIndicator, { opacity: leftOpacity }]}>
        <Ionicons name="arrow-down" size={32} color={Colors.accent} />
        <Text style={[styles.sideIndicatorText, { color: Colors.accent }]}>DOWN</Text>
      </Animated.View>

      {/* Right indicator (UP) */}
      <Animated.View style={[styles.sideIndicator, styles.rightIndicator, { opacity: rightOpacity }]}>
        <Ionicons name="arrow-up" size={32} color={Colors.green} />
        <Text style={[styles.sideIndicatorText, { color: Colors.green }]}>UP</Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.card,
          { transform: [{ translateX }, { rotate: cardRotation }] },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Green overlay for right swipe */}
        <Animated.View style={[styles.cardOverlay, { backgroundColor: Colors.green, opacity: rightBgOpacity }]} />
        {/* Red overlay for left swipe */}
        <Animated.View style={[styles.cardOverlay, { backgroundColor: Colors.accent, opacity: leftBgOpacity }]} />

        <View style={styles.cardContent}>
          <ProbabilityConeChart
            candles={candles}
            symbol={symbol}
            name={name}
            openPrice={openPrice}
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
          />

          {/* Direction hints at bottom */}
          <View style={styles.directionRow}>
            <View style={styles.directionHint}>
              <Ionicons name="arrow-back" size={16} color={hasPrice ? Colors.accent : Colors.textMuted} />
              <Text style={[styles.directionLabel, { color: hasPrice ? Colors.accent : Colors.textMuted }]}>DOWN</Text>
            </View>
            <Text style={styles.swipePrompt}>
              {hasPrice ? "Swipe to predict" : "Waiting for data..."}
            </Text>
            <View style={styles.directionHint}>
              <Text style={[styles.directionLabel, { color: hasPrice ? Colors.green : Colors.textMuted }]}>UP</Text>
              <Ionicons name="arrow-forward" size={16} color={hasPrice ? Colors.green : Colors.textMuted} />
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
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
    padding: Spacing.lg,
    justifyContent: "space-between",
  },

  // Direction hints
  directionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.sm,
  },
  directionHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  directionLabel: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
  },
  swipePrompt: {
    color: Colors.textMuted,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.xs,
  },

  // Side indicators
  sideIndicator: {
    position: "absolute",
    alignItems: "center",
    gap: Spacing.xs,
    zIndex: 10,
  },
  leftIndicator: {
    left: Spacing.xs,
  },
  rightIndicator: {
    right: Spacing.xs,
  },
  sideIndicatorText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.sm,
  },
});
