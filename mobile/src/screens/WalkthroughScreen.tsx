import React, { useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, FontSize, FontFamily, Radius } from "../utils/theme";
import { useWalkthrough } from "../contexts/WalkthroughContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Slide {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
}

const SLIDES: Slide[] = [
  {
    icon: "skull-outline",
    title: "Welcome, Hunter",
    description: "Predict stock price movements on 1-hour windows to earn Double Dollars",
    color: Colors.orange,
  },
  {
    icon: "trending-up-outline",
    title: "Make Your Pick",
    description: "Swipe UP, DOWN, or HOLD on each stock — choose your confidence level",
    color: Colors.accent,
  },
  {
    icon: "star-outline",
    title: "Climb the Ranks",
    description: "Build your wanted level with streaks and earn bigger multipliers",
    color: Colors.yellow,
  },
  {
    icon: "hammer-outline",
    title: "Collect Irons",
    description: "Unlock gear that modifies your scoring, accuracy, and economy",
    color: Colors.primary,
  },
  {
    icon: "list-outline",
    title: "Top the Board",
    description: "Compete against other hunters on the weekly and all-time leaderboards",
    color: Colors.orange,
  },
];

export default function WalkthroughScreen() {
  const { completeWalkthrough } = useWalkthrough();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const isLastSlide = currentIndex === SLIDES.length - 1;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  const handleNext = () => {
    if (isLastSlide) {
      completeWalkthrough();
    } else {
      scrollRef.current?.scrollTo({ x: (currentIndex + 1) * SCREEN_WIDTH, animated: true });
    }
  };

  return (
    <View style={styles.container}>
      {/* Skip button */}
      <TouchableOpacity style={styles.skipButton} onPress={completeWalkthrough}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        bounces={false}
      >
        {SLIDES.map((slide, index) => (
          <View key={index} style={styles.slide}>
            <View style={[styles.iconCircle, { backgroundColor: slide.color + "20" }]}>
              <Ionicons name={slide.icon} size={64} color={slide.color} />
            </View>
            <Text style={styles.slideTitle}>{slide.title}</Text>
            <Text style={styles.slideDescription}>{slide.description}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Bottom controls */}
      <View style={styles.bottomControls}>
        {/* Dot indicators */}
        <View style={styles.dots}>
          {SLIDES.map((slide, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === currentIndex
                  ? { backgroundColor: slide.color, width: 24 }
                  : { backgroundColor: Colors.surface },
              ]}
            />
          ))}
        </View>

        {/* Next / Get Started button */}
        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: SLIDES[currentIndex].color }]}
          onPress={handleNext}
        >
          <Text style={styles.nextButtonText}>
            {isLastSlide ? "Get Started" : "Next"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  skipButton: {
    position: "absolute",
    top: Spacing.statusBar,
    right: Spacing.xl,
    zIndex: 10,
    padding: Spacing.sm,
  },
  skipText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.textSecondary,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xxxl,
  },
  iconCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xxl,
  },
  slideTitle: {
    fontSize: FontSize.xxxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  slideDescription: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 26,
  },
  bottomControls: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl + 16,
    gap: Spacing.xxl,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dot: {
    height: 8,
    width: 8,
    borderRadius: 4,
  },
  nextButton: {
    paddingVertical: Spacing.lg,
    borderRadius: Radius.md,
    alignItems: "center",
  },
  nextButtonText: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
});
