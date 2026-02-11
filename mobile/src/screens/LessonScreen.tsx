import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTopicFacts, useSubmitQuizAnswer } from "../hooks/useApi";
import { Colors, Spacing, FontSize, Radius, FontFamily } from "../utils/theme";
import type { FactDetail } from "../api/client";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { LearnStackParamList } from "./LearnScreen";
import { computeChunkSizes } from "./LearnScreen";

type Props = NativeStackScreenProps<LearnStackParamList, "Lesson">;

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Ski slope difficulty scale
const DIFFICULTY_CONFIG: Record<number, { label: string; icon: string; color: string }> = {
  1: { label: "Green Circle", icon: "\u25CF", color: "#4CAF50" },
  2: { label: "Blue Square", icon: "\u25A0", color: "#2196F3" },
  3: { label: "Black Diamond", icon: "\u25C6", color: "#222222" },
  4: { label: "Dbl Black Diamond", icon: "\u25C6\u25C6", color: "#222222" },
  5: { label: "Tpl Black Diamond", icon: "\u25C6\u25C6\u25C6", color: "#222222" },
};

type SlideItem =
  | { type: "intro"; title: string; description: string }
  | { type: "fact"; data: FactDetail }
  | { type: "quiz"; data: FactDetail };

function buildSlides(facts: FactDetail[], topicName: string, topicDescription: string): SlideItem[] {
  const slides: SlideItem[] = [];
  slides.push({ type: "intro", title: topicName, description: topicDescription });
  for (const fact of facts) {
    slides.push({ type: "fact", data: fact });
  }
  for (const fact of facts) {
    if (fact.question) {
      slides.push({ type: "quiz", data: fact });
    }
  }
  return slides;
}

function IntroCard({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.slideContainer}>
      <View style={styles.introCard}>
        <Ionicons name="book-outline" size={32} color={Colors.primary} />
        <Text style={styles.introTitle}>{title}</Text>
        <Text style={styles.introDescription}>{description}</Text>
        <View style={styles.introHint}>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          <Text style={styles.introHintText}>Swipe to begin</Text>
        </View>
      </View>
    </View>
  );
}

function FactCard({ fact }: { fact: FactDetail }) {
  return (
    <View style={styles.slideContainer}>
      <View style={styles.factCard}>
        <View style={styles.factHeader}>
          {fact.is_mastered && (
            <View style={styles.masteredBadge}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.green} />
              <Text style={styles.masteredText}>Mastered</Text>
            </View>
          )}
        </View>
        <Text style={styles.factTitle}>{fact.title}</Text>
        <Text style={styles.factExplanation}>{fact.explanation}</Text>
      </View>
    </View>
  );
}

function QuizCard({
  fact,
  onAnswer,
  isSubmitting,
}: {
  fact: FactDetail;
  onAnswer: (questionId: string, option: string) => void;
  isSubmitting: boolean;
}) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [result, setResult] = useState<{
    isCorrect: boolean;
    correctOption: string;
    explanation: string;
    pointsEarned: number;
  } | null>(null);

  const question = fact.question;
  if (!question) return null;

  const options = [
    { key: "A", text: question.option_a },
    { key: "B", text: question.option_b },
    { key: "C", text: question.option_c },
    { key: "D", text: question.option_d },
  ];

  const handleSelect = (optionKey: string) => {
    if (fact.is_mastered || fact.is_locked || selectedOption || isSubmitting) return;
    setSelectedOption(optionKey);
    onAnswer(question.id, optionKey);
  };

  const getOptionStyle = (key: string) => {
    if (fact.is_mastered) {
      const isMasteredCorrect = result?.correctOption === key;
      return isMasteredCorrect ? styles.optionCorrect : styles.optionMastered;
    }
    if (fact.is_locked) {
      return styles.optionLocked;
    }
    if (!selectedOption) {
      return styles.optionDefault;
    }
    if (result) {
      if (key === result.correctOption) return styles.optionCorrect;
      if (key === selectedOption && !result.isCorrect) return styles.optionWrong;
    }
    if (key === selectedOption) return styles.optionSelected;
    return styles.optionDefault;
  };

  const getOptionTextStyle = (key: string) => {
    if (fact.is_locked) return styles.optionTextLocked;
    return styles.optionText;
  };

  const formatCountdown = (dateStr: string) => {
    const target = new Date(dateStr);
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    if (diffMs <= 0) return "Available now";
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `Retry in ${days}d ${hours}h`;
    return `Retry in ${hours}h`;
  };

  return (
    <ScrollView
      style={styles.slideContainer}
      contentContainerStyle={styles.slideScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.quizCard}>
        <View style={styles.quizHeader}>
          <Ionicons name="help-circle" size={18} color={Colors.yellow} />
          <Text style={styles.quizLabel}>Quiz</Text>
          {question.difficulty > 0 && (
            <View style={[styles.difficultyBadge, { backgroundColor: DIFFICULTY_CONFIG[question.difficulty]?.color + "20" }]}>
              <Text style={[styles.difficultyIcon, { color: DIFFICULTY_CONFIG[question.difficulty]?.color }]}>
                {DIFFICULTY_CONFIG[question.difficulty]?.icon}
              </Text>
            </View>
          )}
          {fact.is_mastered && (
            <View style={styles.masteredBadge}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.green} />
              <Text style={styles.masteredText}>Mastered</Text>
            </View>
          )}
        </View>

        <Text style={styles.quizQuestion}>{question.question_text}</Text>

        {fact.is_locked && fact.retry_available_at && (
          <View style={styles.lockedBanner}>
            <Ionicons name="lock-closed" size={16} color={Colors.orange} />
            <Text style={styles.lockedText}>
              {formatCountdown(fact.retry_available_at)}
            </Text>
          </View>
        )}

        <View style={styles.optionsContainer}>
          {options.map(({ key, text }) => (
            <TouchableOpacity
              key={key}
              style={[styles.optionButton, getOptionStyle(key)]}
              onPress={() => handleSelect(key)}
              disabled={fact.is_mastered || fact.is_locked || !!selectedOption || isSubmitting}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionKey, getOptionTextStyle(key)]}>{key}.</Text>
              <Text style={[styles.optionText, getOptionTextStyle(key)]}>{text}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isSubmitting && selectedOption && !result && (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.md }} />
        )}
      </View>
    </ScrollView>
  );
}

function CompletionScreen({
  correctCount,
  totalCount,
  onContinue,
}: {
  correctCount: number;
  totalCount: number;
  onContinue: () => void;
}) {
  let icon: keyof typeof Ionicons.glyphMap;
  let color: string;
  let title: string;
  let subtitle: string;

  if (correctCount === totalCount) {
    icon = "trophy";
    color = Colors.yellow;
    title = "Congratulations!";
    subtitle = "Perfect score!";
  } else if (correctCount > totalCount / 2) {
    icon = "thumbs-up";
    color = Colors.primary;
    title = "Good job!";
    subtitle = "Keep learning!";
  } else {
    icon = "refresh";
    color = Colors.orange;
    title = "Try again soon!";
    subtitle = "Review the material and retry.";
  }

  return (
    <View style={styles.completionOverlay}>
      <View style={styles.completionCard}>
        <Ionicons name={icon} size={64} color={color} />
        <Text style={styles.completionTitle}>{title}</Text>
        <Text style={styles.completionScore}>
          {correctCount}/{totalCount} correct
        </Text>
        <Text style={styles.completionSubtitle}>{subtitle}</Text>
        <TouchableOpacity style={styles.completionButton} onPress={onContinue} activeOpacity={0.7}>
          <Text style={styles.completionButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function LessonScreen({ route, navigation }: Props) {
  const { topicId, topicName, topicDescription, chunkIndex } = route.params;
  const { data: allFacts, isLoading, isError, refetch } = useTopicFacts(topicId);
  const submitAnswer = useSubmitQuizAnswer();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerResults, setAnswerResults] = useState<
    Record<string, { isCorrect: boolean; correctOption: string; explanation: string; pointsEarned: number }>
  >({});
  const [sessionAnswers, setSessionAnswers] = useState<Record<string, boolean>>({});
  const [showCompletion, setShowCompletion] = useState(false);

  // Slice facts to just this chunk using variable chunk sizes
  const facts = useMemo(() => {
    if (!allFacts) return undefined;
    const sizes = computeChunkSizes(allFacts.length);
    const start = sizes.slice(0, chunkIndex).reduce((a, b) => a + b, 0);
    return allFacts.slice(start, start + sizes[chunkIndex]);
  }, [allFacts, chunkIndex]);

  const slides = facts ? buildSlides(facts, topicName, topicDescription) : [];

  // Check for chunk completion after each answer + refetch
  useEffect(() => {
    if (!facts || Object.keys(sessionAnswers).length === 0 || showCompletion) return;
    const stillAnswerable = facts.filter(
      (f) => f.question && !f.is_mastered && !f.is_locked && !sessionAnswers[f.question!.id]
    );
    if (stillAnswerable.length === 0) {
      setTimeout(() => setShowCompletion(true), 800);
    }
  }, [facts, sessionAnswers, showCompletion]);

  const handleAnswer = useCallback(
    (questionId: string, option: string) => {
      submitAnswer.mutate(
        { question_id: questionId, selected_option: option },
        {
          onSuccess: (response) => {
            setAnswerResults((prev) => ({
              ...prev,
              [questionId]: {
                isCorrect: response.is_correct,
                correctOption: response.correct_option,
                explanation: response.explanation,
                pointsEarned: response.points_earned,
              },
            }));

            setSessionAnswers((prev) => ({
              ...prev,
              [questionId]: response.is_correct,
            }));

            const dollarBonus = response.points_earned * 25;

            if (response.is_correct) {
              Alert.alert(
                "Correct!",
                `+$${dollarBonus.toLocaleString()} learning earnings\n\n${response.explanation}`,
                [{ text: "Nice!" }]
              );
            } else {
              Alert.alert(
                "Not quite!",
                `The correct answer is ${response.correct_option}.\n\n${response.explanation}\n\nYou can retry tomorrow.`,
                [{ text: "Got it" }]
              );
            }

            refetch();
          },
          onError: (error) => {
            Alert.alert("Error", error.message);
          },
        }
      );
    },
    [submitAnswer, refetch]
  );

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slides.length) {
      flatListRef.current?.scrollToIndex({ index, animated: true });
    }
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <View style={styles.lessonHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.lessonTitle} numberOfLines={1}>{topicName}</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.red} />
          <Text style={styles.errorText}>Failed to load lessons</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const renderSlide = ({ item }: { item: SlideItem }) => {
    if (item.type === "intro") {
      return <IntroCard title={item.title} description={item.description} />;
    }
    if (item.type === "fact") {
      return <FactCard fact={item.data} />;
    }
    return (
      <QuizCard
        fact={item.data}
        onAnswer={handleAnswer}
        isSubmitting={submitAnswer.isPending}
      />
    );
  };

  const correctCount = Object.values(sessionAnswers).filter(Boolean).length;
  const totalAnswered = Object.keys(sessionAnswers).length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.lessonHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.lessonTitle} numberOfLines={1}>
          {topicName}
        </Text>
        <Text style={styles.slideCounter}>
          {currentIndex + 1}/{slides.length}
        </Text>
      </View>

      {/* Progress dots */}
      <View style={styles.dotsContainer}>
        {slides.map((slide, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === currentIndex && styles.dotActive,
              slide.type === "intro" && styles.dotIntro,
              slide.type === "quiz" && styles.dotQuiz,
            ]}
          />
        ))}
      </View>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={(_, i) => `slide-${i}`}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />

      {/* Navigation arrows */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
          onPress={() => goToSlide(currentIndex - 1)}
          disabled={currentIndex === 0}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={currentIndex === 0 ? Colors.textMuted : Colors.text}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.navButton,
            currentIndex === slides.length - 1 && styles.navButtonDisabled,
          ]}
          onPress={() => goToSlide(currentIndex + 1)}
          disabled={currentIndex === slides.length - 1}
        >
          <Ionicons
            name="chevron-forward"
            size={24}
            color={
              currentIndex === slides.length - 1 ? Colors.textMuted : Colors.text
            }
          />
        </TouchableOpacity>
      </View>

      {/* Completion overlay */}
      {showCompletion && totalAnswered > 0 && (
        <CompletionScreen
          correctCount={correctCount}
          totalCount={totalAnswered}
          onContinue={() => navigation.goBack()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.textSecondary,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
  },
  retryButtonText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  lessonHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.statusBar,
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  lessonTitle: {
    flex: 1,
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  slideCounter: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontFamily: FontFamily.semiBold,
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    gap: 4,
    flexWrap: "wrap",
    paddingHorizontal: Spacing.xl,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surface,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 20,
  },
  dotIntro: {
    backgroundColor: Colors.primary + "60",
  },
  dotQuiz: {
    backgroundColor: Colors.yellow + "60",
  },
  slideContainer: {
    width: SCREEN_WIDTH,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
  },
  slideScrollContent: {
    paddingBottom: Spacing.md,
  },
  introCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  introTitle: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    textAlign: "center",
  },
  introDescription: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  introHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  introHintText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
  },
  factCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    flex: 1,
  },
  factHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: Spacing.sm,
  },
  factTitle: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  factExplanation: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  masteredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.green + "20",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  masteredText: {
    fontSize: FontSize.xs,
    color: Colors.green,
    fontFamily: FontFamily.bold,
  },
  quizCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.yellow + "40",
  },
  quizHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  quizLabel: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: Colors.yellow,
    flex: 1,
  },
  difficultyBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  difficultyIcon: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
  },
  quizQuestion: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
    lineHeight: 22,
  },
  lockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.orange + "15",
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  lockedText: {
    fontSize: FontSize.sm,
    color: Colors.orange,
    fontFamily: FontFamily.semiBold,
  },
  optionsContainer: {
    gap: Spacing.xs,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  optionDefault: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  optionSelected: {
    backgroundColor: Colors.primary + "30",
    borderColor: Colors.primary,
  },
  optionCorrect: {
    backgroundColor: Colors.green + "20",
    borderColor: Colors.green,
  },
  optionWrong: {
    backgroundColor: Colors.red + "20",
    borderColor: Colors.red,
  },
  optionLocked: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    opacity: 0.4,
  },
  optionMastered: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    opacity: 0.6,
  },
  optionKey: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.bold,
    color: Colors.textSecondary,
    width: 18,
    marginTop: 1,
  },
  optionText: {
    flex: 1,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.text,
    lineHeight: 16,
  },
  optionTextLocked: {
    flex: 1,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  navButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.card,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  completionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  completionCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.xxl,
    alignItems: "center",
    gap: Spacing.md,
    width: "100%",
    maxWidth: 320,
  },
  completionTitle: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    textAlign: "center",
  },
  completionScore: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.semiBold,
    color: Colors.textSecondary,
  },
  completionSubtitle: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    textAlign: "center",
  },
  completionButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
  },
  completionButtonText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
});
