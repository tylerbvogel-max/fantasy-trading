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

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Slide {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
}

const MODE_SLIDES: Slide[] = [
  {
    icon: "school-outline",
    title: "Classroom",
    description:
      "The learning mode. Trade stocks with virtual cash, take quizzes to earn bonus money, and compete on your class leaderboard. Perfect for courses and beginners.",
    color: Colors.primary,
  },
  {
    icon: "trophy-outline",
    title: "League",
    description:
      "Fantasy football for the stock market. Create or join seasons, pick your stocks, and compete on skill alone. No gimmicks — just pure trading.",
    color: Colors.yellow,
  },
  {
    icon: "flash-outline",
    title: "Arena",
    description:
      "Chaos mode. Everything from League plus player interactions — forced trades, sabotage, and strategic disruption. Not for the faint of heart.",
    color: Colors.accent,
  },
  {
    icon: "timer-outline",
    title: "Time Attack",
    description:
      "Predict whether SPY goes up or down every 2 hours. Earn Double Dollars, build your Wanted Level streak, and climb the Bounty Board. One swipe, instant stakes.",
    color: Colors.orange,
  },
];

interface ModeGuideScreenProps {
  onClose: () => void;
}

export default function ModeGuideScreen({ onClose }: ModeGuideScreenProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const isLastSlide = currentIndex === MODE_SLIDES.length - 1;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  const handleNext = () => {
    if (isLastSlide) {
      onClose();
    } else {
      scrollRef.current?.scrollTo({ x: (currentIndex + 1) * SCREEN_WIDTH, animated: true });
    }
  };

  return (
    <View style={styles.container}>
      {/* Close button */}
      <TouchableOpacity style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeText}>Close</Text>
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
        {MODE_SLIDES.map((slide, index) => (
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
          {MODE_SLIDES.map((slide, index) => (
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

        {/* Next / Done button */}
        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: MODE_SLIDES[currentIndex].color }]}
          onPress={handleNext}
        >
          <Text style={styles.nextButtonText}>
            {isLastSlide ? "Done" : "Next"}
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
  closeButton: {
    position: "absolute",
    top: Spacing.statusBar,
    right: Spacing.xl,
    zIndex: 10,
    padding: Spacing.sm,
  },
  closeText: {
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
