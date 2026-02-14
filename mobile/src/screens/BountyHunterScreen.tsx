import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Animated,
  PanResponder,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, FontSize, Radius, FontFamily } from "../utils/theme";
import {
  useBountyStatus,
  useSubmitPrediction,
  useBountySkip,
  useBountyIronOffering,
  usePickIron,
  useBountyReset,
} from "../hooks/useApi";
import ProbabilityConeChart from "../components/ProbabilityConeChart";
import IronOfferingModal from "../components/IronOfferingModal";

// ── Card & gesture constants ──

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const CARD_WIDTH = SCREEN_WIDTH - Spacing.xl * 2;
const CARD_SIZE = CARD_WIDTH;
const COMMIT_THRESHOLD = CARD_WIDTH * 0.3;
const VELOCITY_THRESHOLD = 0.5;
const CHART_WIDTH = CARD_WIDTH - Spacing.lg * 2;
const CHART_HEIGHT = CARD_SIZE - 120;

// ── Scoring tables (display only — mirrors backend bounty_config) ──

const DIR_SCORING: Record<number, { win: number; lose: number }> = {
  1: { win: 13, lose: 11 },
  2: { win: 31, lose: 28 },
  3: { win: 57, lose: 70 },
};

const HOL_SCORING: Record<number, { win: number; lose: number }> = {
  1: { win: 8, lose: 6 },
  2: { win: 19, lose: 15 },
  3: { win: 35, lose: 30 },
};

const WANTED_MULT: Record<number, number> = {
  1: 1, 2: 2, 3: 4, 4: 8, 5: 18,
  6: 42, 7: 100, 8: 230, 9: 530, 10: 1200,
};

const HOLSTER_COLOR = Colors.primary;

function getWantedMult(level: number): number {
  return WANTED_MULT[level] ?? Math.round(1200 * Math.pow(2.3, level - 10));
}

function useCountdown(targetTime: string | null) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!targetTime) {
      setTimeLeft("");
      return;
    }

    const update = () => {
      const now = Date.now();
      const target = new Date(targetTime).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft("Starting...");
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  return timeLeft;
}

export default function BountyHunterScreen() {
  // ── API hooks ──
  const { data: status, isLoading, isError, refetch } = useBountyStatus();
  const submitPrediction = useSubmitPrediction();
  const submitSkip = useBountySkip();
  const { data: ironOffering, refetch: refetchOffering } = useBountyIronOffering();
  const pickIronMutation = usePickIron();
  const resetMutation = useBountyReset();

  // ── UI state ──
  const [confidence, setConfidence] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [swipedPicks, setSwipedPicks] = useState<
    { symbol: string; prediction: "UP" | "DOWN" | "HOLD"; confidence: number }[]
  >([]);
  const [skippedSymbols, setSkippedSymbols] = useState<string[]>([]);
  const [showIronModal, setShowIronModal] = useState(false);
  const [ignoreServerPicks, setIgnoreServerPicks] = useState(false);

  // ── Test mode: random outcomes for each stock (1/3 each) ──
  const TEST_CHOICES: ("RISE" | "FALL" | "HOLD")[] = ["RISE", "FALL", "HOLD"];
  const [testOutcomes, setTestOutcomes] = useState<Record<string, "RISE" | "FALL" | "HOLD">>({});

  // ── Swipe animation values ──
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // ── Derived state ──
  const currentWindow = status?.current_window;
  const previousWindow = status?.previous_window;
  const previousPick = status?.previous_pick;
  const stats = status?.player_stats;
  const anteCost = status?.ante_cost ?? 75;
  const skipCost = status?.skip_cost ?? 25;

  const allStocks = (status?.stocks ?? []).slice(0, 5);
  const swipedSymbolSet = new Set(swipedPicks.map((p) => p.symbol));
  const unpickedStocks = allStocks.filter(
    (s) =>
      (ignoreServerPicks || !s.my_pick) &&
      !swipedSymbolSet.has(s.symbol) &&
      !skippedSymbols.includes(s.symbol)
  );
  const pickedStocks = allStocks.filter(
    (s) => (!ignoreServerPicks && !!s.my_pick) || swipedSymbolSet.has(s.symbol)
  );
  const skippedStocks = allStocks.filter(
    (s) => skippedSymbols.includes(s.symbol) && !s.my_pick
  );
  const currentStock = unpickedStocks.length > 0 ? unpickedStocks[0] : null;
  const nextStock = unpickedStocks.length > 1 ? unpickedStocks[1] : null;
  const allExhausted = allStocks.length > 0 && unpickedStocks.length === 0;
  const stockProgress = allStocks.length > 0
    ? `${pickedStocks.length + skippedStocks.length + 1}/${allStocks.length}`
    : "";

  const hasActiveWindow = !!currentWindow;
  const wantedLevel = stats?.wanted_level ?? 1;
  const mult = getWantedMult(Math.max(wantedLevel, 1));

  const windowEndCountdown = useCountdown(currentWindow?.end_time ?? null);
  const nextWindowCountdown = useCountdown(
    !currentWindow ? status?.next_window_time ?? null : null
  );

  const hasPrice =
    currentStock &&
    ((currentStock.candles?.length ?? 0) >= 2 || !!currentStock.open_price);

  // ── Toast ──
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastOpacity.stopAnimation();
    setToast(message);
    toastOpacity.setValue(0);
    Animated.timing(toastOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => setToast(null));
    }, 1500);
  };

  // ── Refs for PanResponder (avoid stale closures) ──
  const onCommitRef = useRef<(dir: string) => void>(() => {});
  const canSkipRef = useRef(true);
  const enabledRef = useRef(true);

  canSkipRef.current =
    !stats?.is_busted && (stats?.double_dollars ?? 0) >= skipCost;
  enabledRef.current = hasActiveWindow && !!currentStock && !!hasPrice;

  // ── PanResponder (created once, uses refs for latest state) ──
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        enabledRef.current && (Math.abs(g.dx) > 10 || Math.abs(g.dy) > 10),
      onPanResponderMove: (_, g) => {
        if (!enabledRef.current) return;
        translateX.setValue(g.dx);
        // Dampen upward drag when can't afford skip
        if (g.dy < 0 && !canSkipRef.current) {
          translateY.setValue(g.dy * 0.3);
        } else {
          translateY.setValue(g.dy);
        }
      },
      onPanResponderRelease: (_, g) => {
        const snapBack = () => {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        };

        if (!enabledRef.current) {
          snapBack();
          return;
        }

        const absDx = Math.abs(g.dx);
        const absDy = Math.abs(g.dy);
        const isHorizontal = absDx >= absDy;

        if (isHorizontal) {
          const committed =
            absDx > COMMIT_THRESHOLD ||
            (Math.abs(g.vx) > VELOCITY_THRESHOLD && absDx > 20);
          if (committed) {
            const dir = g.dx > 0 ? "rise" : "fall";
            Animated.timing(translateX, {
              toValue: g.dx > 0 ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5,
              duration: 180,
              useNativeDriver: true,
            }).start(() => onCommitRef.current(dir));
            Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }).start();
          } else {
            snapBack();
          }
        } else {
          // Block upward commit when can't afford skip
          if (g.dy < 0 && !canSkipRef.current) {
            snapBack();
            return;
          }
          const committed =
            absDy > COMMIT_THRESHOLD ||
            (Math.abs(g.vy) > VELOCITY_THRESHOLD && absDy > 20);
          if (committed) {
            const dir = g.dy < 0 ? "skip" : "holster";
            Animated.timing(translateY, {
              toValue: g.dy < 0 ? -SCREEN_HEIGHT : SCREEN_HEIGHT,
              duration: 180,
              useNativeDriver: true,
            }).start(() => onCommitRef.current(dir));
            Animated.timing(translateX, { toValue: 0, duration: 180, useNativeDriver: true }).start();
          } else {
            snapBack();
          }
        }
      },
    })
  ).current;

  // ── Direction indicator interpolations ──
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

  // ── Effects ──

  // Reset card position when stock changes
  useEffect(() => {
    translateX.stopAnimation();
    translateY.stopAnimation();
    translateX.setValue(0);
    translateY.setValue(0);
  }, [currentStock?.symbol]);

  // Reset optimistic lists when window changes
  const windowId = currentWindow?.id;
  useEffect(() => {
    setSwipedPicks([]);
    setSkippedSymbols([]);
  }, [windowId]);

  // Show iron offering modal
  useEffect(() => {
    if (stats?.pending_offering && ironOffering?.offering_id) {
      setShowIronModal(true);
    }
  }, [stats?.pending_offering, ironOffering?.offering_id]);

  // Assign random test outcomes when stock list changes
  const stockSymbols = allStocks.map((s) => s.symbol).join(",");
  useEffect(() => {
    if (!stockSymbols) return;
    setTestOutcomes((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const sym of stockSymbols.split(",")) {
        if (!next[sym]) {
          next[sym] = TEST_CHOICES[Math.floor(Math.random() * 3)];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [stockSymbols]);

  // ── Handlers ──

  const handleSwipe = (prediction: "UP" | "DOWN") => {
    if (!currentWindow || !currentStock) return;
    const symbol = currentStock.symbol;
    setSwipedPicks((prev) => [...prev, { symbol, prediction, confidence }]);

    submitPrediction.mutate(
      {
        bounty_window_id: currentWindow.id,
        prediction,
        confidence,
        symbol,
      },
      {
        onSuccess: () => showToast(`${symbol} Locked In!`),
        onError: (error) => {
          const msg = error.message ?? "";
          if (msg.includes("not currently active") || msg.includes("already made a prediction")) {
            refetch();
          } else if (msg.includes("busted")) {
            refetch();
          } else if (msg.includes("ante")) {
            showToast(msg);
            setSwipedPicks((prev) => prev.filter((p) => p.symbol !== symbol));
          } else {
            setSwipedPicks((prev) => prev.filter((p) => p.symbol !== symbol));
            Alert.alert("Error", msg);
          }
        },
      }
    );
  };

  const handleHold = () => {
    if (!currentWindow || !currentStock) return;
    const symbol = currentStock.symbol;
    setSwipedPicks((prev) => [...prev, { symbol, prediction: "HOLD", confidence }]);

    submitPrediction.mutate(
      {
        bounty_window_id: currentWindow.id,
        prediction: "HOLD",
        confidence,
        symbol,
      },
      {
        onSuccess: () => showToast(`${symbol} HOLD Locked In!`),
        onError: (error) => {
          const msg = error.message ?? "";
          setSwipedPicks((prev) => prev.filter((p) => p.symbol !== symbol));
          if (msg.includes("not currently active") || msg.includes("already made a prediction")) {
            refetch();
          } else {
            Alert.alert("Error", msg);
          }
        },
      }
    );
  };

  const handleSkip = () => {
    if (!currentStock || !currentWindow) return;
    const canAfford = (stats?.double_dollars ?? 0) >= skipCost;
    if (!canAfford) {
      showToast("Can't afford skip!");
      return;
    }

    const sym = currentStock.symbol;
    setSkippedSymbols((prev) => [...prev, sym]);

    submitSkip.mutate(
      { bounty_window_id: currentWindow.id, symbol: sym },
      {
        onSuccess: (data) => {
          showToast(`Skipped (-$$${data.skip_cost})`);
          if (data.is_busted) refetch();
        },
        onError: (error) => {
          setSkippedSymbols((prev) => prev.filter((s) => s !== sym));
          showToast(error.message ?? "Skip failed");
        },
      }
    );
  };

  // Called from PanResponder animation callback
  onCommitRef.current = (direction) => {
    translateX.stopAnimation();
    translateY.stopAnimation();
    translateX.setValue(0);
    translateY.setValue(0);

    if (direction === "skip") handleSkip();
    else if (direction === "holster") handleHold();
    else if (direction === "rise") handleSwipe("UP");
    else if (direction === "fall") handleSwipe("DOWN");
  };

  const handlePickIron = (ironId: string) => {
    pickIronMutation.mutate(ironId, {
      onSuccess: () => {
        setShowIronModal(false);
        showToast("Iron equipped!");
        refetchOffering();
      },
      onError: (error) => Alert.alert("Error", error.message),
    });
  };

  const handleReset = () => {
    resetMutation.mutate(undefined, {
      onSuccess: (data) => {
        showToast(data.message);
        refetch();
      },
      onError: (error) => Alert.alert("Error", error.message),
    });
  };

  const handleNextRound = () => {
    setSwipedPicks([]);
    setSkippedSymbols([]);
    setIgnoreServerPicks(true);
    setTestOutcomes({});
    refetch();
  };

  // ── Scoring display values ──
  const dirScore = DIR_SCORING[confidence];
  const holScore = HOL_SCORING[confidence];
  const dirWin = Math.round(dirScore.win * mult);
  const dirLose = Math.round(dirScore.lose * mult);
  const holWin = Math.round(holScore.win * mult);
  const holLose = Math.round(holScore.lose * mult);

  const CONFIDENCE_OPTIONS = [
    {
      value: 1,
      label: "Draw",
      description: `+${DIR_SCORING[1].win}\u00D7${mult}`,
      color: Colors.text,
      bgColor: Colors.surface,
    },
    {
      value: 2,
      label: "Quick Draw",
      description: `+${DIR_SCORING[2].win}\u00D7${mult}`,
      color: Colors.yellow,
      bgColor: Colors.yellow + "20",
    },
    {
      value: 3,
      label: "Dead Eye",
      description: `+${DIR_SCORING[3].win}\u00D7${mult}`,
      color: Colors.orange,
      bgColor: Colors.orange + "20",
    },
  ];

  // ── Loading state ──
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Bounty Hunter</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.orange} />
        </View>
      </View>
    );
  }

  // ── Error state ──
  if (isError || !status) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Bounty Hunter</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>
            Could not load bounty data.{"\n"}The server may be waking up.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Shared elements ──
  const ironModal = (
    <IronOfferingModal
      visible={showIronModal}
      irons={ironOffering?.irons ?? []}
      onPick={handlePickIron}
      isPicking={pickIronMutation.isPending}
      chambersUsed={stats?.equipped_irons?.length ?? 0}
      maxChambers={stats?.chambers ?? 2}
    />
  );

  const toastElement = toast ? (
    <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
      <Ionicons name="checkmark-circle" size={20} color={Colors.green} />
      <Text style={styles.toastText}>{toast}</Text>
    </Animated.View>
  ) : null;

  // ── Bust state ──
  if (stats?.is_busted) {
    return (
      <View style={styles.container}>
        {toastElement}
        <View style={styles.bustContainer}>
          <Text style={styles.bustTitle}>BUSTED</Text>
          <Ionicons name="skull-outline" size={64} color={Colors.accent} />
          <Text style={styles.bustSubtext}>Your run has ended.</Text>
          <View style={styles.bustStats}>
            <View style={styles.bustStatRow}>
              <Text style={styles.bustStatLabel}>Peak Wanted</Text>
              <Text style={styles.bustStatValue}>Lv.{stats.best_streak}</Text>
            </View>
            <View style={styles.bustStatRow}>
              <Text style={styles.bustStatLabel}>Total Picks</Text>
              <Text style={styles.bustStatValue}>{stats.total_predictions}</Text>
            </View>
            <View style={styles.bustStatRow}>
              <Text style={styles.bustStatLabel}>Times Busted</Text>
              <Text style={styles.bustStatValue}>{stats.bust_count}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleReset}
            disabled={resetMutation.isPending}
          >
            {resetMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <Text style={styles.resetButtonText}>Start Over</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Equipped irons row
  const rarityIcon = (r: string) =>
    r === "rare" ? "star" : r === "uncommon" ? "diamond" : "ellipse";
  const equippedIronsRow =
    stats?.equipped_irons && stats.equipped_irons.length > 0 ? (
      <View style={styles.ironsRow}>
        {stats.equipped_irons.map((iron) => {
          const rarityColor =
            iron.rarity === "rare"
              ? Colors.yellow
              : iron.rarity === "uncommon"
                ? Colors.primary
                : Colors.textMuted;
          return (
            <View
              key={iron.slot_number}
              style={[styles.ironPill, { borderColor: rarityColor + "60" }]}
            >
              <Ionicons name={rarityIcon(iron.rarity) as any} size={10} color={rarityColor} />
              <Text style={[styles.ironPillText, { color: rarityColor }]}>
                {iron.name}
              </Text>
            </View>
          );
        })}
      </View>
    ) : null;


  // ── Active window + current stock — 4-direction swipe card ──
  if (hasActiveWindow && currentStock) {
    return (
      <View style={styles.container}>
        {toastElement}
        {ironModal}
        {/* Lab-style header: balance + level */}
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.balanceText,
              (stats?.double_dollars ?? 0) <= 0 && { color: Colors.accent },
            ]}
          >
            $${(stats?.double_dollars ?? 0).toLocaleString()}
          </Text>
          <Text style={styles.wantedText}>
            Lv.{wantedLevel} ({mult}x)
          </Text>
        </View>

        {/* Pick counter */}
        <View style={styles.statusRow}>
          <Text style={styles.pickCounter}>Card {stockProgress}</Text>
        </View>

        {equippedIronsRow}

        {/* 4-direction swipe area */}
        <View style={styles.swipeArea}>
          {/* Skip indicator (top) */}
          <Animated.View
            style={[styles.indicator, styles.topIndicator, { opacity: skipOpacity }]}
          >
            <Ionicons
              name={canSkipRef.current ? "play-skip-forward" : "lock-closed"}
              size={20}
              color={canSkipRef.current ? Colors.orange : Colors.textMuted}
            />
            <Text
              style={[
                styles.indicatorLabel,
                { color: canSkipRef.current ? Colors.orange : Colors.textMuted },
              ]}
            >
              {canSkipRef.current ? "SKIP" : "CAN'T AFFORD"}
            </Text>
            <Text
              style={[
                styles.indicatorScore,
                { color: canSkipRef.current ? Colors.orange : Colors.textMuted },
              ]}
            >
              $${skipCost.toLocaleString()}
            </Text>
          </Animated.View>

          {/* Fall indicator (left) */}
          <Animated.View
            style={[styles.indicator, styles.leftIndicator, { opacity: fallOpacity }]}
          >
            <Ionicons name="trending-down" size={20} color={Colors.accent} />
            <Text style={[styles.indicatorLabel, { color: Colors.accent }]}>FALL</Text>
            <Text style={styles.indicatorScore}>
              <Text style={{ color: Colors.green }}>+{dirWin}</Text>
              {" / "}
              <Text style={{ color: Colors.accent }}>-{dirLose}</Text>
            </Text>
          </Animated.View>

          {/* Rise indicator (right) */}
          <Animated.View
            style={[styles.indicator, styles.rightIndicator, { opacity: riseOpacity }]}
          >
            <Ionicons name="trending-up" size={20} color={Colors.green} />
            <Text style={[styles.indicatorLabel, { color: Colors.green }]}>RISE</Text>
            <Text style={styles.indicatorScore}>
              <Text style={{ color: Colors.green }}>+{dirWin}</Text>
              {" / "}
              <Text style={{ color: Colors.accent }}>-{dirLose}</Text>
            </Text>
          </Animated.View>

          {/* Holster indicator (bottom) */}
          <Animated.View
            style={[styles.indicator, styles.bottomIndicator, { opacity: holsterOpacity }]}
          >
            <Ionicons name="shield-checkmark" size={20} color={HOLSTER_COLOR} />
            <Text style={[styles.indicatorLabel, { color: HOLSTER_COLOR }]}>HOLD</Text>
            <Text style={styles.indicatorScore}>
              <Text style={{ color: Colors.green }}>+{holWin}</Text>
              {" / "}
              <Text style={{ color: Colors.accent }}>-{holLose}</Text>
            </Text>
          </Animated.View>

          {/* Back card (next stock peeking behind) */}
          {nextStock && (
            <View style={styles.backCardContainer}>
              <View style={[styles.card, styles.backCard]}>
                <View style={styles.cardContent}>
                  <ProbabilityConeChart
                    candles={nextStock.candles}
                    symbol={nextStock.symbol}
                    name={nextStock.name}
                    openPrice={nextStock.open_price}
                    width={CHART_WIDTH}
                    height={CHART_HEIGHT}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Main swipeable card */}
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
            {/* Color overlays */}
            <Animated.View
              style={[styles.cardOverlay, { backgroundColor: Colors.green, opacity: riseBgOpacity }]}
            />
            <Animated.View
              style={[styles.cardOverlay, { backgroundColor: Colors.accent, opacity: fallBgOpacity }]}
            />
            <Animated.View
              style={[styles.cardOverlay, { backgroundColor: Colors.orange, opacity: skipBgOpacity }]}
            />
            <Animated.View
              style={[styles.cardOverlay, { backgroundColor: HOLSTER_COLOR, opacity: holsterBgOpacity }]}
            />

            <View style={styles.cardContent}>
              <ProbabilityConeChart
                candles={currentStock.candles}
                symbol={currentStock.symbol}
                name={currentStock.name}
                openPrice={currentStock.open_price}
                width={CHART_WIDTH}
                height={CHART_HEIGHT}
              />

              {/* Test outcome indicator */}
              {testOutcomes[currentStock.symbol] && (() => {
                const outcome = testOutcomes[currentStock.symbol];
                const oColor =
                  outcome === "RISE" ? Colors.green : outcome === "FALL" ? Colors.accent : HOLSTER_COLOR;
                return (
                  <View style={styles.testOutcomeTag}>
                    <Text style={[styles.testOutcomeText, { color: oColor }]}>
                      Answer: {outcome}
                    </Text>
                  </View>
                );
              })()}

              {/* Cardinal direction labels */}
              <View style={[styles.cardLabelWrap, { top: 4, left: 0, right: 0 }]}>
                <Text style={[styles.cardLabel, { color: Colors.orange }]}>SKIP ↑</Text>
              </View>
              <View style={[styles.cardLabelWrap, { bottom: 4, left: 0, right: 0 }]}>
                <Text style={[styles.cardLabel, { color: HOLSTER_COLOR }]}>↓ HOLD</Text>
              </View>
              <View style={[styles.cardLabelWrap, { left: 4, top: 0, bottom: 0 }]}>
                <Text style={[styles.cardLabel, { color: Colors.accent }]}>FALL</Text>
              </View>
              <View style={[styles.cardLabelWrap, { right: 4, top: 0, bottom: 0 }]}>
                <Text style={[styles.cardLabel, { color: Colors.green }]}>RISE</Text>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* Confidence buttons at bottom */}
        <View style={styles.bottomConfBar}>
          {CONFIDENCE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.bottomConfButton,
                {
                  backgroundColor: confidence === opt.value ? opt.bgColor : Colors.card,
                  borderColor: confidence === opt.value ? opt.color : Colors.border,
                },
              ]}
              onPress={() => setConfidence(opt.value)}
            >
              <Text
                style={[
                  styles.bottomConfLabel,
                  { color: confidence === opt.value ? opt.color : Colors.textMuted },
                ]}
              >
                {opt.label}
              </Text>
              <Text
                style={[
                  styles.bottomConfScore,
                  { color: confidence === opt.value ? opt.color : Colors.textMuted },
                ]}
              >
                {opt.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  // ── Active window, all stocks picked — locked-in state ──
  if (hasActiveWindow && allExhausted) {
    return (
      <View style={styles.container}>
        {toastElement}
        {ironModal}

        {/* Lab-style header */}
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.balanceText,
              (stats?.double_dollars ?? 0) <= 0 && { color: Colors.accent },
            ]}
          >
            $${(stats?.double_dollars ?? 0).toLocaleString()}
          </Text>
          <Text style={styles.wantedText}>
            Lv.{wantedLevel} ({mult}x)
          </Text>
        </View>

        {equippedIronsRow}

        <ScrollView contentContainerStyle={styles.lockedPicksArea}>
          <Ionicons name="checkmark-circle" size={48} color={Colors.green} />
          <Text style={styles.lockedTitle}>Locked In</Text>
          <View style={styles.lockedPicksGrid}>
            {pickedStocks.map((stock) => {
              const swipedPick = swipedPicks.find((p) => p.symbol === stock.symbol);
              const pred = stock.my_pick?.prediction ?? swipedPick?.prediction;
              const conf = stock.my_pick?.confidence ?? swipedPick?.confidence ?? 1;
              const color =
                pred === "UP"
                  ? Colors.green
                  : pred === "DOWN"
                    ? Colors.accent
                    : pred === "HOLD"
                      ? Colors.primary
                      : Colors.textMuted;
              const icon =
                pred === "UP"
                  ? "arrow-up-circle"
                  : pred === "DOWN"
                    ? "arrow-down-circle"
                    : pred === "HOLD"
                      ? "pause-circle"
                      : "checkmark-circle";
              const confOpt =
                CONFIDENCE_OPTIONS.find((o) => o.value === conf) ?? CONFIDENCE_OPTIONS[0];
              const testAnswer = testOutcomes[stock.symbol];
              const predLabel = pred === "UP" ? "RISE" : pred === "DOWN" ? "FALL" : pred;
              const isWin = testAnswer === predLabel;
              return (
                <View
                  key={stock.symbol}
                  style={[styles.lockedPickCard, { borderColor: color + "40" }]}
                >
                  <Text style={[styles.lockedPickSymbol, { color }]}>
                    {stock.symbol}
                  </Text>
                  <Ionicons name={icon as any} size={22} color={color} />
                  {pred && (
                    <Text style={[styles.lockedPickLabel, { color }]}>
                      {predLabel}
                    </Text>
                  )}
                  <Text style={[styles.lockedPickBounty, { color: confOpt.color }]}>
                    {confOpt.label}
                  </Text>
                  {testAnswer && (
                    <Text
                      style={[
                        styles.testResultTag,
                        { color: isWin ? Colors.green : Colors.accent },
                      ]}
                    >
                      {isWin ? "WIN" : "LOSE"} ({testAnswer})
                    </Text>
                  )}
                </View>
              );
            })}
            {skippedStocks.map((stock) => (
              <View
                key={stock.symbol}
                style={[
                  styles.lockedPickCard,
                  { borderColor: Colors.orange + "40", opacity: 0.5 },
                ]}
              >
                <Text style={[styles.lockedPickSymbol, { color: Colors.orange }]}>
                  {stock.symbol}
                </Text>
                <Ionicons name="play-skip-forward" size={22} color={Colors.orange} />
                <Text style={[styles.lockedPickLabel, { color: Colors.orange }]}>
                  SKIP
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.nextRoundButton} onPress={handleNextRound}>
            <Ionicons name="refresh" size={18} color={Colors.text} />
            <Text style={styles.nextRoundButtonText}>Next Round</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.resetScoreButton}
            onPress={() =>
              Alert.alert("Reset Score", "This will reset your balance, wanted level, and irons. Continue?", [
                { text: "Cancel", style: "cancel" },
                { text: "Reset", style: "destructive", onPress: handleReset },
              ])
            }
          >
            <Ionicons name="trash-outline" size={16} color={Colors.accent} />
            <Text style={styles.resetScoreText}>Reset Score</Text>
          </TouchableOpacity>
        </ScrollView>

        {previousWindow && previousWindow.is_settled && previousPick && (
          <View style={styles.prevResultBar}>
            <Text style={styles.prevResultLabel}>Last:</Text>
            <Text
              style={[
                styles.prevResultPayout,
                {
                  color:
                    (previousPick.payout ?? 0) >= 0 ? Colors.green : Colors.accent,
                },
              ]}
            >
              {(previousPick.payout ?? 0) >= 0 ? "+" : ""}$${previousPick.payout}
            </Text>
          </View>
        )}
      </View>
    );
  }

  // ── No active window ──
  return (
    <View style={styles.container}>
      {ironModal}

      {/* Lab-style header */}
      <View style={styles.titleRow}>
        <Text
          style={[
            styles.balanceText,
            (stats?.double_dollars ?? 0) <= 0 && { color: Colors.accent },
          ]}
        >
          $${(stats?.double_dollars ?? 0).toLocaleString()}
        </Text>
        <Text style={styles.wantedText}>
          Lv.{wantedLevel} ({mult}x)
        </Text>
      </View>

      {equippedIronsRow}

      {previousWindow && previousWindow.is_settled && (
        <View style={styles.resultCardCompact}>
          <Text style={styles.resultCompactLabel}>Last Bounty</Text>
          <View
            style={[
              styles.resultBadgeInline,
              {
                backgroundColor:
                  previousWindow.result === "UP"
                    ? Colors.green + "20"
                    : Colors.accent + "20",
              },
            ]}
          >
            <Ionicons
              name={previousWindow.result === "UP" ? "arrow-up" : "arrow-down"}
              size={14}
              color={
                previousWindow.result === "UP" ? Colors.green : Colors.accent
              }
            />
            <Text
              style={{
                color:
                  previousWindow.result === "UP" ? Colors.green : Colors.accent,
                fontFamily: FontFamily.bold,
                fontSize: FontSize.sm,
              }}
            >
              {previousWindow.result}
            </Text>
          </View>
          {previousPick && (
            <Text
              style={[
                styles.resultCompactPayout,
                {
                  color:
                    (previousPick.payout ?? 0) >= 0 ? Colors.green : Colors.accent,
                },
              ]}
            >
              {(previousPick.payout ?? 0) >= 0 ? "+" : ""}$${previousPick.payout}
            </Text>
          )}
        </View>
      )}

      <View style={styles.waitingArea}>
        <Ionicons name="timer-outline" size={48} color={Colors.orange} />
        <Text style={styles.waitingTitle}>Next Bounty</Text>
        <Text style={styles.waitingCountdown}>
          {nextWindowCountdown || "Calculating..."}
        </Text>
        <Text style={styles.waitingSubtext}>
          New bounty every 2 minutes.{"\n"}Ante: $${anteCost} per window.
        </Text>
        <TouchableOpacity
          style={[styles.resetScoreButton, { marginTop: Spacing.xl }]}
          onPress={() =>
            Alert.alert("Reset Score", "This will reset your balance, wanted level, and irons. Continue?", [
              { text: "Cancel", style: "cancel" },
              { text: "Reset", style: "destructive", onPress: handleReset },
            ])
          }
        >
          <Ionicons name="trash-outline" size={16} color={Colors.accent} />
          <Text style={styles.resetScoreText}>Reset Score</Text>
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
  toast: {
    position: "absolute",
    bottom: Spacing.xxxl + 20,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.card + "DD",
    borderWidth: 1,
    borderColor: Colors.green + "40",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    zIndex: 100,
  },
  toastText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
    color: Colors.green,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.statusBar,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  retryButton: {
    backgroundColor: Colors.orange,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  retryText: {
    color: Colors.text,
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
  },

  // ── Lab-style header ──
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.statusBar,
    paddingBottom: Spacing.xs,
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

  // ── Status row (pick counter + confidence pills) ──
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xs,
  },
  pickCounter: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  ironsRow: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  ironPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ironPillText: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.bold,
  },

  // ── Bottom confidence bar ──
  bottomConfBar: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    paddingTop: Spacing.sm,
  },
  bottomConfButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  bottomConfLabel: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.sm,
  },
  bottomConfScore: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.xs,
    marginTop: 2,
  },

  // ── Test mode ──
  testOutcomeTag: {
    position: "absolute",
    bottom: Spacing.lg + 20,
    alignSelf: "center",
    backgroundColor: Colors.background + "CC",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    zIndex: 6,
  },
  testOutcomeText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xs,
  },
  testResultTag: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xs,
    marginTop: 4,
  },

  // ── 4-direction swipe area ──
  swipeArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
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
    padding: Spacing.lg,
    justifyContent: "space-between",
  },

  // Back card
  backCardContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  backCard: {
    transform: [{ scale: 0.95 }, { translateY: 8 }],
    opacity: 0.5,
  },

  // Cardinal direction labels on card
  cardLabelWrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  cardLabel: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xs,
    opacity: 0.4,
  },

  // Direction indicators around the card
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


  // ── Locked-in state ──
  lockedPicksArea: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  lockedTitle: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.green,
  },
  lockedPicksGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingBottom: Spacing.lg,
    marginTop: Spacing.sm,
  },
  lockedPickCard: {
    alignItems: "center",
    gap: 2,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minWidth: 80,
  },
  lockedPickSymbol: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
  },
  lockedPickLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.xs,
  },
  lockedPickBounty: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  prevResultBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingBottom: Spacing.xxxl,
    paddingTop: Spacing.xs,
    backgroundColor: Colors.card,
  },
  prevResultLabel: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  prevResultPayout: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.sm,
  },
  nextRoundButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
  },
  nextRoundButtonText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  resetScoreButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
  resetScoreText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.sm,
    color: Colors.accent,
  },

  // ── Waiting / no active window ──
  resultCardCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginHorizontal: Spacing.xl,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultCompactLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  resultBadgeInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  resultCompactPayout: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.sm,
    marginLeft: "auto",
  },
  waitingArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  waitingTitle: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginTop: Spacing.lg,
  },
  waitingCountdown: {
    fontSize: FontSize.xxxl,
    fontFamily: FontFamily.bold,
    color: Colors.orange,
    marginTop: Spacing.xs,
  },
  waitingSubtext: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: Spacing.lg,
    lineHeight: 20,
  },

  // ── Bust state ──
  bustContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  bustTitle: {
    fontSize: FontSize.hero,
    fontFamily: FontFamily.bold,
    color: Colors.accent,
    letterSpacing: 6,
  },
  bustSubtext: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
  },
  bustStats: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    width: "100%",
    gap: Spacing.md,
  },
  bustStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  bustStatLabel: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  bustStatValue: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  resetButton: {
    backgroundColor: Colors.orange,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.lg,
    width: "100%",
    alignItems: "center",
  },
  resetButtonText: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
});
