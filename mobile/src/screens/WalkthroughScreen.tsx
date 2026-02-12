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
import { useMode } from "../contexts/ModeContext";
import { useWalkthrough } from "../contexts/WalkthroughContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Slide {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
}

const CLASSROOM_SLIDES: Slide[] = [
  {
    icon: "rocket-outline",
    title: "Welcome!",
    description: "Learn to invest with virtual money in a safe environment",
    color: Colors.primary,
  },
  {
    icon: "swap-horizontal-outline",
    title: "Trade",
    description: "Buy and sell real stocks with your $10,000 virtual balance",
    color: Colors.accent,
  },
  {
    icon: "briefcase-outline",
    title: "Portfolio",
    description: "Track your holdings and watch your portfolio grow",
    color: Colors.orange,
  },
  {
    icon: "school-outline",
    title: "Learn",
    description: "Take quizzes to earn bonus cash for your portfolio",
    color: Colors.yellow,
  },
  {
    icon: "bar-chart-outline",
    title: "Stocks",
    description: "Browse real stocks and see live market prices",
    color: Colors.primary,
  },
  {
    icon: "trophy-outline",
    title: "Leaderboard",
    description: "Compete with classmates to become the best trader",
    color: Colors.accent,
  },
];

const LEAGUE_SLIDES: Slide[] = [
  {
    icon: "rocket-outline",
    title: "Welcome!",
    description: "Compete with real stock picks against other traders",
    color: Colors.primary,
  },
  {
    icon: "swap-horizontal-outline",
    title: "Trade",
    description: "Buy and sell stocks in your active season",
    color: Colors.accent,
  },
  {
    icon: "briefcase-outline",
    title: "Portfolio",
    description: "Track your holdings and P&L across seasons",
    color: Colors.orange,
  },
  {
    icon: "bar-chart-outline",
    title: "Stocks",
    description: "Browse stocks, filter by sector, and check prices",
    color: Colors.yellow,
  },
  {
    icon: "calendar-outline",
    title: "Seasons",
    description: "Join seasons, create your own, and climb the leaderboard",
    color: Colors.primary,
  },
];

export default function WalkthroughScreen() {
  const { mode } = useMode();
  const { completeWalkthrough } = useWalkthrough();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const slides = mode === "classroom" ? CLASSROOM_SLIDES : LEAGUE_SLIDES;
  const isLastSlide = currentIndex === slides.length - 1;

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
        {slides.map((slide, index) => (
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
          {slides.map((slide, index) => (
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
          style={[styles.nextButton, { backgroundColor: slides[currentIndex].color }]}
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
