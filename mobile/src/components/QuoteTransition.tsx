import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableWithoutFeedback,
  StyleSheet,
  Animated,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontFamily, FontSize, Spacing } from "../utils/theme";
import { FINANCE_QUOTES } from "../data/financeQuotes";
import { ALL_CHART_PATTERNS, type ChartPattern } from "../data/chartPatterns";

const SCREEN_WIDTH = Dimensions.get("window").width;

type SlideContent =
  | { kind: "quote"; quote: string; attribution: string }
  | { kind: "tip"; pattern: ChartPattern };

interface QuoteTransitionProps {
  visible: boolean;
  onComplete: () => void;
}

export default function QuoteTransition({ visible, onComplete }: QuoteTransitionProps) {
  const translateX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const lastQuoteIdx = useRef(-1);
  const lastPatternIdx = useRef(-1);
  const contentRef = useRef<SlideContent>(pickContent());
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissed = useRef(false);

  function pickContent(): SlideContent {
    // ~50/50 split between quotes and pattern tips
    if (Math.random() < 0.5) {
      let idx: number;
      do {
        idx = Math.floor(Math.random() * FINANCE_QUOTES.length);
      } while (idx === lastQuoteIdx.current && FINANCE_QUOTES.length > 1);
      lastQuoteIdx.current = idx;
      const q = FINANCE_QUOTES[idx];
      return { kind: "quote", quote: q.quote, attribution: q.attribution };
    } else {
      let idx: number;
      do {
        idx = Math.floor(Math.random() * ALL_CHART_PATTERNS.length);
      } while (idx === lastPatternIdx.current && ALL_CHART_PATTERNS.length > 1);
      lastPatternIdx.current = idx;
      return { kind: "tip", pattern: ALL_CHART_PATTERNS[idx] };
    }
  }

  useEffect(() => {
    if (!visible) {
      translateX.setValue(SCREEN_WIDTH);
      dismissed.current = false;
      return;
    }

    contentRef.current = pickContent();
    dismissed.current = false;

    // Slide in from right
    Animated.timing(translateX, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => {
      // Hold for 3.5 seconds (tips need slightly more reading time), then slide out
      holdTimer.current = setTimeout(() => {
        if (!dismissed.current) {
          slideOut();
        }
      }, 3500);
    });

    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, [visible]);

  const slideOut = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    if (holdTimer.current) clearTimeout(holdTimer.current);

    Animated.timing(translateX, {
      toValue: -SCREEN_WIDTH,
      duration: 400,
      useNativeDriver: true,
    }).start(() => {
      onComplete();
    });
  };

  if (!visible) return null;

  const content = contentRef.current;

  return (
    <TouchableWithoutFeedback onPress={slideOut}>
      <Animated.View style={[styles.overlay, { transform: [{ translateX }] }]}>
        {content.kind === "quote" ? (
          <View style={styles.content}>
            <Ionicons name="skull-outline" size={48} color={Colors.orange} />
            <Text style={styles.quote}>"{content.quote}"</Text>
            <Text style={styles.attribution}>-- {content.attribution}</Text>
          </View>
        ) : (
          <View style={styles.content}>
            <Ionicons
              name={content.pattern.type === "candlestick" ? "bar-chart-outline" : "trending-up"}
              size={40}
              color={
                content.pattern.signal === "bullish"
                  ? Colors.green
                  : content.pattern.signal === "bearish"
                  ? Colors.accent
                  : Colors.primary
              }
            />
            <View style={styles.tipHeader}>
              <Text style={styles.tipLabel}>
                {content.pattern.type === "candlestick" ? "CANDLESTICK" : "CHART"} PATTERN
              </Text>
              <View style={[
                styles.signalBadge,
                {
                  backgroundColor:
                    content.pattern.signal === "bullish"
                      ? Colors.green + "20"
                      : content.pattern.signal === "bearish"
                      ? Colors.accent + "20"
                      : Colors.primary + "20",
                },
              ]}>
                <Text style={[
                  styles.signalText,
                  {
                    color:
                      content.pattern.signal === "bullish"
                        ? Colors.green
                        : content.pattern.signal === "bearish"
                        ? Colors.accent
                        : Colors.primary,
                  },
                ]}>
                  {content.pattern.signal.toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.patternName}>{content.pattern.name}</Text>
            <Text style={styles.patternIndication}>{content.pattern.indication}</Text>
          </View>
        )}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 200,
  },
  content: {
    alignItems: "center",
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.lg,
  },
  // Quote styles
  quote: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    textAlign: "center",
    fontStyle: "italic",
    lineHeight: 26,
  },
  attribution: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: "center",
  },
  // Tip styles
  tipHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  tipLabel: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  signalBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
  },
  signalText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xs,
  },
  patternName: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xxl,
    color: Colors.text,
    textAlign: "center",
  },
  patternIndication: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
});
