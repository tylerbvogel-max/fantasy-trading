import React, { useRef } from "react";
import { View, Text, StyleSheet, Dimensions, Animated, PanResponder } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontFamily, FontSize, Spacing, Radius } from "../utils/theme";

interface SwipeCardProps {
  onSwipeUp: () => void;
  onSwipeDown: () => void;
  enabled: boolean;
}

const CARD_HEIGHT = 200;
const COMMIT_THRESHOLD = CARD_HEIGHT * 0.4;
const VELOCITY_THRESHOLD = 0.5;

export default function SwipeCard({ onSwipeUp, onSwipeDown, enabled }: SwipeCardProps) {
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        enabled && Math.abs(gesture.dy) > 10,
      onPanResponderMove: (_, gesture) => {
        translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        const swipedUp =
          gesture.dy < -COMMIT_THRESHOLD || gesture.vy < -VELOCITY_THRESHOLD;
        const swipedDown =
          gesture.dy > COMMIT_THRESHOLD || gesture.vy > VELOCITY_THRESHOLD;

        if (swipedUp) {
          Animated.spring(translateY, {
            toValue: -CARD_HEIGHT * 1.5,
            useNativeDriver: true,
          }).start(() => {
            onSwipeUp();
            translateY.setValue(0);
          });
        } else if (swipedDown) {
          Animated.spring(translateY, {
            toValue: CARD_HEIGHT * 1.5,
            useNativeDriver: true,
          }).start(() => {
            onSwipeDown();
            translateY.setValue(0);
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const upOpacity = translateY.interpolate({
    inputRange: [-COMMIT_THRESHOLD, -20, 0],
    outputRange: [1, 0.3, 0],
    extrapolate: "clamp",
  });

  const downOpacity = translateY.interpolate({
    inputRange: [0, 20, COMMIT_THRESHOLD],
    outputRange: [0, 0.3, 1],
    extrapolate: "clamp",
  });

  if (!enabled) {
    return (
      <View style={[styles.card, styles.cardDisabled]}>
        <Ionicons name="lock-closed" size={32} color={Colors.textMuted} />
        <Text style={styles.lockedText}>Prediction locked</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.indicator, styles.indicatorUp, { opacity: upOpacity }]}>
        <Ionicons name="arrow-up" size={24} color={Colors.green} />
        <Text style={[styles.indicatorText, { color: Colors.green }]}>UP</Text>
      </Animated.View>

      <Animated.View
        style={[styles.card, { transform: [{ translateY }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.hintRow}>
          <Ionicons name="arrow-up" size={20} color={Colors.green} />
          <Text style={[styles.hintText, { color: Colors.green }]}>SWIPE UP — SPY goes up</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.hintRow}>
          <Ionicons name="arrow-down" size={20} color={Colors.accent} />
          <Text style={[styles.hintText, { color: Colors.accent }]}>SWIPE DOWN — SPY goes down</Text>
        </View>
      </Animated.View>

      <Animated.View style={[styles.indicator, styles.indicatorDown, { opacity: downOpacity }]}>
        <Text style={[styles.indicatorText, { color: Colors.accent }]}>DOWN</Text>
        <Ionicons name="arrow-down" size={24} color={Colors.accent} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    marginVertical: Spacing.lg,
  },
  card: {
    width: Dimensions.get("window").width - Spacing.xl * 2,
    height: CARD_HEIGHT,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
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
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  hintText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.lg,
  },
  divider: {
    width: "80%",
    height: 1,
    backgroundColor: Colors.border,
  },
  indicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  indicatorUp: {
    marginBottom: Spacing.sm,
  },
  indicatorDown: {
    marginTop: Spacing.sm,
  },
  indicatorText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.lg,
  },
});
