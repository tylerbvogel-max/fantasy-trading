import React, { useRef } from "react";
import { View, Text, StyleSheet, Dimensions, Animated, PanResponder } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontFamily, FontSize, Spacing, Radius } from "../utils/theme";

interface SwipeCardProps {
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  enabled: boolean;
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = SCREEN_WIDTH - Spacing.xl * 2;
const COMMIT_THRESHOLD = CARD_WIDTH * 0.3;
const VELOCITY_THRESHOLD = 0.5;

export default function SwipeCard({ onSwipeRight, onSwipeLeft, enabled }: SwipeCardProps) {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        enabled && Math.abs(gesture.dx) > 10,
      onPanResponderMove: (_, gesture) => {
        translateX.setValue(gesture.dx);
      },
      onPanResponderRelease: (_, gesture) => {
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
            translateX.setValue(0);
          });
        } else if (swipedLeft) {
          Animated.spring(translateX, {
            toValue: -SCREEN_WIDTH,
            useNativeDriver: true,
          }).start(() => {
            onSwipeLeft();
            translateX.setValue(0);
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

  // Interpolations for visual feedback
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

  if (!enabled) {
    return (
      <View style={styles.wrapper}>
        <View style={[styles.card, styles.cardDisabled]}>
          <Ionicons name="lock-closed" size={32} color={Colors.textMuted} />
          <Text style={styles.lockedText}>Submitting...</Text>
        </View>
      </View>
    );
  }

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
          {
            transform: [{ translateX }, { rotate: cardRotation }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Green overlay for right swipe */}
        <Animated.View style={[styles.cardOverlay, { backgroundColor: Colors.green, opacity: rightBgOpacity }]} />
        {/* Red overlay for left swipe */}
        <Animated.View style={[styles.cardOverlay, { backgroundColor: Colors.accent, opacity: leftBgOpacity }]} />

        <View style={styles.cardContent}>
          <View style={styles.directionRow}>
            <View style={styles.directionHint}>
              <Ionicons name="arrow-back" size={18} color={Colors.accent} />
              <Text style={[styles.directionLabel, { color: Colors.accent }]}>DOWN</Text>
            </View>
            <View style={styles.centerIcon}>
              <Ionicons name="swap-horizontal" size={28} color={Colors.textMuted} />
            </View>
            <View style={styles.directionHint}>
              <Text style={[styles.directionLabel, { color: Colors.green }]}>UP</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.green} />
            </View>
          </View>
          <Text style={styles.swipePrompt}>Swipe to predict</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    height: 180,
  },
  card: {
    width: CARD_WIDTH,
    height: 160,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.lg,
  },
  cardContent: {
    alignItems: "center",
    gap: Spacing.md,
  },
  cardDisabled: {
    opacity: 0.5,
    gap: Spacing.md,
  },
  lockedText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.md,
  },
  directionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "80%",
  },
  directionHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  directionLabel: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.lg,
  },
  centerIcon: {
    opacity: 0.4,
  },
  swipePrompt: {
    color: Colors.textMuted,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
  },
  sideIndicator: {
    position: "absolute",
    alignItems: "center",
    gap: Spacing.xs,
    zIndex: 10,
  },
  leftIndicator: {
    left: Spacing.md,
  },
  rightIndicator: {
    right: Spacing.md,
  },
  sideIndicatorText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.sm,
  },
});
