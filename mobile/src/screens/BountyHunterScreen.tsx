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
import { Colors, LightCardColors, Spacing, FontSize, Radius, FontFamily } from "../utils/theme";
import { useCardTheme } from "../contexts/CardThemeContext";
import HexIronBar from "../components/HexIronBar";
import {
  useBountyStatus,
  useSubmitPrediction,
  useBountySkip,
  useBountyIronOffering,
  usePickIron,
  useBountyReset,
  useAdjustPrediction,
} from "../hooks/useApi";
import ProbabilityConeChart from "../components/ProbabilityConeChart";
import IronOfferingModal from "../components/IronOfferingModal";

// ── Card & gesture constants ──

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const CARD_WIDTH = SCREEN_WIDTH - Spacing.xl * 2 - 24;
const CARD_SIZE = CARD_WIDTH;
const COMMIT_THRESHOLD = CARD_WIDTH * 0.3;
const VELOCITY_THRESHOLD = 0.5;
const CHART_WIDTH = CARD_WIDTH - Spacing.lg * 2;
const CHART_HEIGHT = CARD_SIZE - 120;


const WANTED_MULT: Record<number, number> = {
  1: 1, 2: 2, 3: 4, 4: 8, 5: 18,
  6: 42, 7: 100, 8: 230, 9: 530, 10: 1200,
};


const WantedBar = ({ level, mult }: { level: number; mult: number }) => (
  <View
    style={{
      width: 120,
      height: 16,
      backgroundColor: Colors.surface,
      borderRadius: Radius.full,
      overflow: "hidden",
      justifyContent: "center",
    }}
  >
    <View
      style={{
        position: "absolute",
        width: `${Math.min(level / 10, 1) * 100}%`,
        height: "100%",
        backgroundColor: Colors.orange,
        borderRadius: Radius.full,
      }}
    />
    <Text
      style={{
        position: "absolute",
        alignSelf: "center",
        color: "#fff",
        fontSize: FontSize.xs,
        fontFamily: FontFamily.bold,
      }}
    >
      Lv.{level} · {mult}x
    </Text>
  </View>
);
const ANTE_BASE = 75;
const HOLSTER_COLOR = Colors.primary;

// ── Iron effects (mirrors tools/bounty-sim/irons.mjs getIronEffects) ──
interface IronEffects {
  drawWinBonus: number;
  allLoseReduction: number;
  accuracyBonus: number;
  anteReduction: number;
  skipDiscount: number;
  holsterWinBonus: number;
  qdWinBonus: number;
  snakeOil: boolean;
  deAccuracyBonus: number;
  flatCashPerCorrect: number;
  notorietyBonus: number;
  perLevelWinBonus: number;
  deWinMultiplier: number;
  ghostChance: number;
  scoreMultiplier: number;
}

// Boost effects map: keyed by iron_id, values are additive (multiply for deWinMultiplier/scoreMultiplier)
const BOOST_EFFECTS: Record<string, Partial<IronEffects>> = {
  steady_hand:     { drawWinBonus: 6, allLoseReduction: 2 },
  thick_skin:      { allLoseReduction: 5, holsterWinBonus: 2 },
  lucky_horseshoe: { accuracyBonus: 0.10, ghostChance: 0.05 },
  trail_rations:   { anteReduction: 35 },
  bandolier:       { skipDiscount: 0.40, flatCashPerCorrect: 25 },
  leather_holster: { holsterWinBonus: 8, snakeOil: true },
  iron_sights:     { qdWinBonus: 10, deAccuracyBonus: 0.05 },
  snake_oil:       { allLoseReduction: 5, holsterWinBonus: 3 },
  deadeye_scope:   { deAccuracyBonus: 0.15, deWinMultiplier: 1.5 },
  gold_tooth:      { flatCashPerCorrect: 100, notorietyBonus: 0.3 },
  bounty_poster:   { notorietyBonus: 1.0, perLevelWinBonus: 0.5 },
  sheriffs_badge:  { perLevelWinBonus: 2, allLoseReduction: 2 },
  double_barrel:   { deWinMultiplier: 1.5, scoreMultiplier: 1.2 },
  ghost_rider:     { ghostChance: 0.15, flatCashPerCorrect: 75 },
  golden_revolver: { scoreMultiplier: 1.3, flatCashPerCorrect: 50 },
};

function getIronEffects(equipped: { iron_id: string }[], boostedIronId?: string | null): IronEffects {
  const fx: IronEffects = {
    drawWinBonus: 0, allLoseReduction: 0, accuracyBonus: 0,
    anteReduction: 0, skipDiscount: 0, holsterWinBonus: 0,
    qdWinBonus: 0, snakeOil: false, deAccuracyBonus: 0,
    flatCashPerCorrect: 0, notorietyBonus: 0, perLevelWinBonus: 0,
    deWinMultiplier: 1, ghostChance: 0, scoreMultiplier: 1,
  };
  for (const iron of equipped) {
    switch (iron.iron_id) {
      case 'steady_hand':     fx.drawWinBonus += 3; break;
      case 'thick_skin':      fx.allLoseReduction += 3; break;
      case 'lucky_horseshoe': fx.accuracyBonus += 0.05; break;
      case 'trail_rations':   fx.anteReduction += 20; break;
      case 'bandolier':       fx.skipDiscount += 0.30; break;
      case 'leather_holster': fx.holsterWinBonus += 4; break;
      case 'iron_sights':     fx.qdWinBonus += 5; break;
      case 'snake_oil':       fx.snakeOil = true; break;
      case 'deadeye_scope':   fx.deAccuracyBonus += 0.10; break;
      case 'gold_tooth':      fx.flatCashPerCorrect += 50; break;
      case 'bounty_poster':   fx.notorietyBonus += 0.5; break;
      case 'sheriffs_badge':  fx.perLevelWinBonus += 1; break;
      case 'double_barrel':   fx.deWinMultiplier *= 2; break;
      case 'ghost_rider':     fx.ghostChance = Math.min(1, fx.ghostChance + 0.20); break;
      case 'golden_revolver': fx.scoreMultiplier *= 1.5; break;
    }
  }

  // Apply boost effects if an iron is boosted
  if (boostedIronId) {
    const boost = BOOST_EFFECTS[boostedIronId];
    if (boost) {
      if (boost.drawWinBonus)      fx.drawWinBonus += boost.drawWinBonus;
      if (boost.allLoseReduction)  fx.allLoseReduction += boost.allLoseReduction;
      if (boost.accuracyBonus)     fx.accuracyBonus += boost.accuracyBonus;
      if (boost.anteReduction)     fx.anteReduction += boost.anteReduction;
      if (boost.skipDiscount)      fx.skipDiscount += boost.skipDiscount;
      if (boost.holsterWinBonus)   fx.holsterWinBonus += boost.holsterWinBonus;
      if (boost.qdWinBonus)        fx.qdWinBonus += boost.qdWinBonus;
      if (boost.snakeOil)          fx.snakeOil = true;
      if (boost.deAccuracyBonus)   fx.deAccuracyBonus += boost.deAccuracyBonus;
      if (boost.flatCashPerCorrect) fx.flatCashPerCorrect += boost.flatCashPerCorrect;
      if (boost.notorietyBonus)    fx.notorietyBonus += boost.notorietyBonus;
      if (boost.perLevelWinBonus)  fx.perLevelWinBonus += boost.perLevelWinBonus;
      if (boost.deWinMultiplier)   fx.deWinMultiplier *= boost.deWinMultiplier;
      if (boost.ghostChance)       fx.ghostChance = Math.min(1, fx.ghostChance + boost.ghostChance);
      if (boost.scoreMultiplier)   fx.scoreMultiplier *= boost.scoreMultiplier;
    }
  }

  return fx;
}

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
  // ── Card theme ──
  const { lightCards, candleChart } = useCardTheme();

  // ── API hooks ──
  const { data: status, isLoading, isError, refetch } = useBountyStatus();
  const submitPrediction = useSubmitPrediction();
  const submitSkip = useBountySkip();
  const { data: ironOffering, refetch: refetchOffering } = useBountyIronOffering();
  const pickIronMutation = usePickIron();
  const resetMutation = useBountyReset();
  const adjustMutation = useAdjustPrediction();

  // ── UI state ──
  const [betAmount, setBetAmount] = useState(50);
  const [leverage, setLeverage] = useState(1.0);
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [swipedPicks, setSwipedPicks] = useState<
    { symbol: string; prediction: "UP" | "DOWN" | "HOLD"; betAmount: number; leverage: number }[]
  >([]);
  const [skippedSymbols, setSkippedSymbols] = useState<string[]>([]);
  const [showIronModal, setShowIronModal] = useState(false);
  const [boostedIronId, setBoostedIronId] = useState<string | null>(null);
  const [adjustingSymbol, setAdjustingSymbol] = useState<string | null>(null);
  const [adjustmentUsed, setAdjustmentUsed] = useState(false);

  // ── Showdown state ──
  const [showdownActive, setShowdownActive] = useState(false);
  const [showdownStep, setShowdownStep] = useState(0); // 0=not started, 1-N=revealing stock N
  const [showdownWindowId, setShowdownWindowId] = useState<string | null>(null);
  const showdownSlideAnim = useRef(new Animated.Value(0)).current;
  const showdownDDCounter = useRef(new Animated.Value(0)).current;

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

  const allStocks = status?.stocks ?? [];
  const swipedSymbolSet = new Set(swipedPicks.map((p) => p.symbol));
  const unpickedStocks = allStocks.filter(
    (s) =>
      !s.my_pick &&
      !swipedSymbolSet.has(s.symbol) &&
      !skippedSymbols.includes(s.symbol)
  );
  const pickedStocks = allStocks.filter(
    (s) => !!s.my_pick || swipedSymbolSet.has(s.symbol)
  );
  const skippedStocks = allStocks.filter(
    (s) => skippedSymbols.includes(s.symbol) && !s.my_pick
  );
  const currentStock = unpickedStocks.length > 0 ? unpickedStocks[0] : null;
  const nextStock = unpickedStocks.length > 1 ? unpickedStocks[1] : null;
  const allExhausted = allStocks.length > 0 && unpickedStocks.length === 0;
  const cardInBatch = pickedStocks.length + skippedStocks.length + 1;
  const stockProgress = allStocks.length > 0
    ? `Card ${Math.min(cardInBatch, allStocks.length)}/${allStocks.length}`
    : "";

  const hasActiveWindow = !!currentWindow;
  const wantedLevel = Math.max(1, stats?.wanted_level ?? 1);
  const mult = getWantedMult(Math.max(wantedLevel, 1));
  const displayBalance = stats?.double_dollars ?? 0;
  const maxLeverage = status?.max_leverage ?? 2.0;
  const marginCallCooldown = stats?.margin_call_cooldown ?? 0;

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

  // Reset optimistic lists and boost when window changes
  const windowId = currentWindow?.id;
  useEffect(() => {
    setSwipedPicks([]);
    setSkippedSymbols([]);
    setBoostedIronId(null);
    setLeverage(1.0);
    setAdjustingSymbol(null);
    setAdjustmentUsed(false);
  }, [windowId]);

  // Auto-set leverage to 1.0 when cooldown is active
  useEffect(() => {
    if (marginCallCooldown > 0) setLeverage(1.0);
  }, [marginCallCooldown]);

  // Show iron offering modal
  useEffect(() => {
    if (stats?.pending_offering && ironOffering?.offering_id && !showdownActive) {
      setShowIronModal(true);
    }
  }, [stats?.pending_offering, ironOffering?.offering_id, showdownActive]);

  // Trigger showdown when previous window has settled results we haven't shown
  const previousStocks = status?.previous_stocks ?? [];
  const prevWindowId = previousWindow?.id;
  useEffect(() => {
    if (
      previousWindow?.is_settled &&
      previousStocks.length > 0 &&
      previousStocks.some(s => s.my_pick) &&
      prevWindowId !== showdownWindowId
    ) {
      setShowdownWindowId(prevWindowId ?? null);
      setShowdownStep(0);
      setShowdownActive(true);
    }
  }, [prevWindowId, previousWindow?.is_settled]);

  const showdownResults = previousStocks.filter(s => s.my_pick);

  const advanceShowdown = () => {
    const nextStep = showdownStep + 1;
    if (nextStep > showdownResults.length) {
      // Showdown complete
      setShowdownActive(false);
      setShowdownStep(0);
      // Trigger iron offering if pending
      if (stats?.pending_offering && ironOffering?.offering_id) {
        setShowIronModal(true);
      }
      return;
    }
    setShowdownStep(nextStep);
    // Slide-in animation for each card
    showdownSlideAnim.setValue(SCREEN_WIDTH);
    Animated.spring(showdownSlideAnim, {
      toValue: 0,
      friction: 8,
      tension: 60,
      useNativeDriver: true,
    }).start();
  };

  const skipShowdown = () => {
    setShowdownActive(false);
    setShowdownStep(0);
    if (stats?.pending_offering && ironOffering?.offering_id) {
      setShowIronModal(true);
    }
  };

  // ── Handlers ──

  const handleSwipe = (prediction: "UP" | "DOWN") => {
    if (!currentWindow || !currentStock) return;
    const symbol = currentStock.symbol;
    setSwipedPicks((prev) => [...prev, { symbol, prediction, betAmount, leverage }]);

    submitPrediction.mutate(
      {
        bounty_window_id: currentWindow.id,
        prediction,
        bet_amount: betAmount,
        symbol,
        leverage,
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
    setSwipedPicks((prev) => [...prev, { symbol, prediction: "HOLD", betAmount, leverage }]);

    submitPrediction.mutate(
      {
        bounty_window_id: currentWindow.id,
        prediction: "HOLD",
        bet_amount: betAmount,
        symbol,
        leverage,
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

  const handleBoostSelected = (ironId: string | null) => {
    setBoostedIronId(ironId);
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

  // ── Scoring display values (bet-based with leverage) ──
  const effLev = leverage; // HOLD halving shown separately in indicator
  const betWin = Math.round(betAmount * effLev * mult);
  const betLose = Math.round(betAmount * effLev);

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

  const chambers = stats?.chambers ?? 2;
  const equipped = stats?.equipped_irons ?? [];

  // ── Showdown: card-by-card settlement reveal ──
  if (showdownActive && showdownResults.length > 0) {
    const revealedResults = showdownResults.slice(0, showdownStep);
    const currentReveal = showdownStep > 0 && showdownStep <= showdownResults.length
      ? showdownResults[showdownStep - 1]
      : null;
    const runningDD = revealedResults.reduce((sum, s) => sum + (s.my_pick?.payout ?? 0), 0);
    const allRevealed = showdownStep > showdownResults.length;

    return (
      <View style={styles.container}>
        {toastElement}
        {ironModal}

        <View style={styles.titleRow}>
          <Text
            style={[
              styles.balanceText,
              displayBalance <= 0 && { color: Colors.accent },
            ]}
          >
            $${displayBalance.toLocaleString()}
          </Text>
          <WantedBar level={wantedLevel} mult={mult} />
        </View>

        <ScrollView contentContainerStyle={styles.lockedPicksArea}>
          <Ionicons name="flash" size={48} color={Colors.yellow} />
          <Text style={[styles.lockedTitle, { color: Colors.yellow }]}>Showdown</Text>

          {showdownStep === 0 ? (
            <TouchableOpacity
              style={[styles.showdownRevealButton, { marginTop: Spacing.lg }]}
              onPress={advanceShowdown}
            >
              <Text style={styles.showdownRevealText}>Reveal Results</Text>
            </TouchableOpacity>
          ) : (
            <>
              {/* Revealed cards */}
              <View style={styles.lockedPicksGrid}>
                {revealedResults.map((stock) => {
                  const pick = stock.my_pick!;
                  const isWin = pick.is_correct;
                  const predLabel = pick.prediction === "UP" ? "RISE" : pick.prediction === "DOWN" ? "FALL" : "HOLD";
                  const color = isWin ? Colors.green : Colors.accent;
                  const icon = isWin ? "checkmark-circle" : "close-circle";

                  return (
                    <Animated.View
                      key={stock.symbol}
                      style={[
                        styles.lockedPickCard,
                        { borderColor: color + "60" },
                        currentReveal?.symbol === stock.symbol && {
                          transform: [{ translateX: showdownSlideAnim }],
                        },
                      ]}
                    >
                      <Text style={[styles.lockedPickSymbol, { color }]}>
                        {stock.symbol}
                      </Text>
                      <Ionicons name={icon as any} size={24} color={color} />
                      <Text style={[styles.lockedPickLabel, { color }]}>
                        {predLabel} {"\u2192"} {stock.result ?? "?"}
                      </Text>
                      <Text
                        style={[
                          styles.lockedPickBounty,
                          { color: (pick.payout ?? 0) >= 0 ? Colors.green : Colors.accent },
                        ]}
                      >
                        {(pick.payout ?? 0) >= 0 ? "+" : ""}$${pick.payout ?? 0}
                      </Text>
                      {pick.ghost_triggered && (
                        <Text style={{ color: Colors.primaryLight, fontFamily: FontFamily.bold, fontSize: FontSize.xs, marginTop: 2 }}>
                          Ghost Rider!
                        </Text>
                      )}
                      {pick.insurance_triggered && (
                        <Text style={{ color: Colors.primary, fontFamily: FontFamily.bold, fontSize: FontSize.xs, marginTop: 2 }}>
                          Insurance!
                        </Text>
                      )}
                      {pick.margin_call_triggered && (
                        <Text style={{ color: Colors.accent, fontFamily: FontFamily.bold, fontSize: FontSize.xs, marginTop: 2 }}>
                          Margin Call!
                        </Text>
                      )}
                    </Animated.View>
                  );
                })}
              </View>

              {/* Running total */}
              <View style={{ marginTop: Spacing.md, alignItems: "center" }}>
                <Text style={{ fontFamily: FontFamily.regular, fontSize: FontSize.sm, color: Colors.textSecondary }}>
                  Window P/L
                </Text>
                <Text style={{
                  fontFamily: FontFamily.bold,
                  fontSize: FontSize.xl,
                  color: runningDD >= 0 ? Colors.green : Colors.accent,
                }}>
                  {runningDD >= 0 ? "+" : ""}$${Math.abs(runningDD).toLocaleString()}
                </Text>
              </View>

              {/* Advance or finish */}
              {!allRevealed ? (
                <TouchableOpacity
                  style={[styles.showdownRevealButton, { marginTop: Spacing.lg }]}
                  onPress={advanceShowdown}
                >
                  <Ionicons name="arrow-forward" size={18} color={Colors.text} />
                  <Text style={styles.showdownRevealText}>
                    Next ({showdownStep}/{showdownResults.length})
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.showdownRevealButton, { marginTop: Spacing.lg, backgroundColor: Colors.green + "30" }]}
                  onPress={advanceShowdown}
                >
                  <Text style={[styles.showdownRevealText, { color: Colors.green }]}>Continue</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={skipShowdown} style={{ marginTop: Spacing.sm }}>
                <Text style={{ color: Colors.textMuted, fontFamily: FontFamily.regular, fontSize: FontSize.sm }}>
                  Skip
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

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
              displayBalance <= 0 && { color: Colors.accent },
            ]}
          >
            $${displayBalance.toLocaleString()}
          </Text>
          <WantedBar level={wantedLevel} mult={mult} />
        </View>

        {/* Pick counter */}
        <View style={styles.statusRow}>
          <Text style={styles.pickCounter}>Card {stockProgress}</Text>
        </View>

        {/* Conditions banner */}
        {(status?.conditions?.length ?? 0) > 0 && (
          <View style={styles.conditionsBanner}>
            {status!.conditions.map((c, i) => (
              <View key={i} style={styles.conditionChip}>
                <Ionicons
                  name={c.category === "ticker_event" ? "flash" : "thunderstorm"}
                  size={12}
                  color={Colors.yellow}
                />
                <Text style={styles.conditionChipText}>{c.name}</Text>
              </View>
            ))}
          </View>
        )}

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
              <Text style={{ color: Colors.green }}>+{betWin}</Text>
              {" / "}
              <Text style={{ color: Colors.accent }}>-{betLose}</Text>
            </Text>
          </Animated.View>

          {/* Rise indicator (right) */}
          <Animated.View
            style={[styles.indicator, styles.rightIndicator, { opacity: riseOpacity }]}
          >
            <Ionicons name="trending-up" size={20} color={Colors.green} />
            <Text style={[styles.indicatorLabel, { color: Colors.green }]}>RISE</Text>
            <Text style={styles.indicatorScore}>
              <Text style={{ color: Colors.green }}>+{betWin}</Text>
              {" / "}
              <Text style={{ color: Colors.accent }}>-{betLose}</Text>
            </Text>
          </Animated.View>

          {/* Holster indicator (bottom) — HOLD halves leverage */}
          {(() => {
            const holdEffLev = 1 + (leverage - 1) * 0.5;
            const holdWin = Math.round(betAmount * holdEffLev * mult);
            const holdLose = Math.round(betAmount * holdEffLev);
            return (
              <Animated.View
                style={[styles.indicator, styles.bottomIndicator, { opacity: holsterOpacity }]}
              >
                <Ionicons name="shield-checkmark" size={20} color={HOLSTER_COLOR} />
                <Text style={[styles.indicatorLabel, { color: HOLSTER_COLOR }]}>HOLD</Text>
                <Text style={styles.indicatorScore}>
                  <Text style={{ color: Colors.green }}>+{holdWin}</Text>
                  {" / "}
                  <Text style={{ color: Colors.accent }}>-{holdLose}</Text>
                </Text>
              </Animated.View>
            );
          })()}

          {/* Back card (next stock peeking behind) */}
          {nextStock && (
            <View style={styles.backCardContainer}>
              <View style={[styles.card, styles.backCard, lightCards && { backgroundColor: LightCardColors.cardBg, borderColor: LightCardColors.border }]}>
                <View style={styles.cardContent}>
                  <ProbabilityConeChart
                    candles={nextStock.candles}
                    symbol={nextStock.symbol}
                    name={nextStock.name}
                    openPrice={nextStock.open_price}
                    width={CHART_WIDTH}
                    height={CHART_HEIGHT}
                    lightTheme={lightCards}
                    candleChart={candleChart}
                  />
                </View>
              </View>
            </View>
          )}


          {/* Main swipeable card */}
          <Animated.View
            style={[
              styles.cardOuter,
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
          <View style={[
            styles.card,
            lightCards && { backgroundColor: LightCardColors.cardBg, borderColor: LightCardColors.border },
            currentStock.is_high_noon && styles.highNoonCard,
          ]}>
            {/* High Noon badge */}
            {currentStock.is_high_noon && (
              <View style={styles.highNoonBadge}>
                <Ionicons name="skull" size={14} color="#000" />
                <Text style={styles.highNoonBadgeText}>HIGH NOON</Text>
              </View>
            )}
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
                lightTheme={lightCards}
                candleChart={candleChart}
              />

              {/* Cardinal direction labels */}
              <View style={[styles.cardLabelWrap, { top: 4, left: 0, right: 0 }]}>
                <Text style={[styles.cardLabel, { color: lightCards ? "#B85C00" : Colors.orange }]}>SKIP ↑</Text>
              </View>
              <View style={[styles.cardLabelWrap, { bottom: 4, left: 0, right: 0 }]}>
                <Text style={[styles.cardLabel, { color: lightCards ? "#4A5A9A" : HOLSTER_COLOR }]}>↓ HOLD</Text>
              </View>
              <View style={[styles.cardLabelWrap, { left: 4, top: 0, bottom: 0 }]}>
                <Text style={[styles.cardLabel, { color: lightCards ? "#C0207A" : Colors.accent }]}>FALL</Text>
              </View>
              <View style={[styles.cardLabelWrap, { right: 4, top: 0, bottom: 0 }]}>
                <Text style={[styles.cardLabel, { color: lightCards ? "#267A4D" : Colors.green }]}>RISE</Text>
              </View>
            </View>
          </View>
          </Animated.View>
        </View>

        <HexIronBar
          chambers={chambers}
          irons={equipped}
          maxChambers={6}
          betAmount={betAmount}
          onBetAmountChange={setBetAmount}
          boostedIronId={boostedIronId}
          onBoostSelected={handleBoostSelected}
          leverage={leverage}
          onLeverageChange={setLeverage}
          maxLeverage={maxLeverage}
          marginCallCooldown={marginCallCooldown}
        />
      </View>
    );
  }

  // ── Active window, all stocks picked — waiting for settlement ──
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
              displayBalance <= 0 && { color: Colors.accent },
            ]}
          >
            $${displayBalance.toLocaleString()}
          </Text>
          <WantedBar level={wantedLevel} mult={mult} />
        </View>

        <ScrollView contentContainerStyle={styles.lockedPicksArea}>
          <Ionicons name="lock-closed" size={48} color={Colors.orange} />
          <Text style={styles.lockedTitle}>Picks Locked</Text>
          <Text style={styles.waitingSubtext}>
            Settling in {windowEndCountdown || "..."}
          </Text>

          {/* Show submitted picks with adjust option */}
          <View style={styles.lockedPicksGrid}>
            {pickedStocks.map((stock) => {
              const swipedPick = swipedPicks.find((p) => p.symbol === stock.symbol);
              const pred = stock.my_pick?.prediction ?? swipedPick?.prediction;
              const bet = (stock.my_pick as any)?.bet_amount ?? swipedPick?.betAmount ?? 50;
              const pickLev = (stock.my_pick as any)?.leverage ?? swipedPick?.leverage ?? 1.0;
              const predLabel = pred === "UP" ? "RISE" : pred === "DOWN" ? "FALL" : pred;
              const color = pred === "UP" ? Colors.green : pred === "DOWN" ? Colors.accent : pred === "HOLD" ? Colors.primary : Colors.textMuted;
              const icon = pred === "UP" ? "arrow-up-circle" : pred === "DOWN" ? "arrow-down-circle" : pred === "HOLD" ? "pause-circle" : "checkmark-circle";
              const isAdjusting = adjustingSymbol === stock.symbol;
              const conf = bet <= 33 ? 1 : bet <= 66 ? 2 : 3;
              const adjCost = Math.round(25 * conf * (1 + 0.1 * wantedLevel));

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
                  <Text style={[styles.lockedPickBounty, { color: Colors.orange }]}>
                    $${bet}{pickLev > 1 ? ` @${pickLev.toFixed(1)}x` : ""}
                  </Text>
                  {/* Adjust controls */}
                  {!adjustmentUsed && !isAdjusting && (
                    <TouchableOpacity
                      style={styles.adjustButton}
                      onPress={() => setAdjustingSymbol(stock.symbol)}
                    >
                      <Text style={styles.adjustButtonText}>Adjust -$${adjCost}</Text>
                    </TouchableOpacity>
                  )}
                  {isAdjusting && (
                    <View style={styles.adjustControls}>
                      {(["UP", "DOWN", "HOLD"] as const).filter(d => d !== pred).map((dir) => {
                        const dColor = dir === "UP" ? Colors.green : dir === "DOWN" ? Colors.accent : Colors.primary;
                        const dLabel = dir === "UP" ? "RISE" : dir === "DOWN" ? "FALL" : "HOLD";
                        return (
                          <TouchableOpacity
                            key={dir}
                            style={[styles.adjustOption, { borderColor: dColor + "60" }]}
                            disabled={adjustMutation.isPending}
                            onPress={() => {
                              if (!currentWindow) return;
                              adjustMutation.mutate(
                                {
                                  bounty_window_id: currentWindow.id,
                                  symbol: stock.symbol,
                                  new_prediction: dir,
                                },
                                {
                                  onSuccess: (res) => {
                                    setAdjustmentUsed(true);
                                    setAdjustingSymbol(null);
                                    showToast(`Adjusted to ${dLabel} (-$$${res.adjustment_cost})`);
                                  },
                                  onError: (err) => {
                                    setAdjustingSymbol(null);
                                    showToast(err.message ?? "Adjust failed");
                                  },
                                }
                              );
                            }}
                          >
                            <Text style={[styles.adjustOptionText, { color: dColor }]}>{dLabel}</Text>
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity onPress={() => setAdjustingSymbol(null)}>
                        <Text style={{ color: Colors.textMuted, fontSize: FontSize.xs }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
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

          {/* Next window preview */}
          {status?.next_window_preview && status.next_window_preview.length > 0 && (
            <View style={styles.nextPreview}>
              <Text style={styles.nextPreviewLabel}>Coming Next</Text>
              <View style={styles.nextPreviewTickers}>
                {status.next_window_preview.map((sym) => (
                  <Text key={sym} style={styles.nextPreviewTicker}>{sym}</Text>
                ))}
              </View>
            </View>
          )}

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
            displayBalance <= 0 && { color: Colors.accent },
          ]}
        >
          $${displayBalance.toLocaleString()}
        </Text>
        <WantedBar level={wantedLevel} mult={mult} />
      </View>

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
          New bounty every 15 minutes.{"\n"}Ante: $${anteCost} per window.
        </Text>
        {status?.next_window_preview && status.next_window_preview.length > 0 && (
          <View style={[styles.nextPreview, { marginTop: Spacing.lg }]}>
            <Text style={styles.nextPreviewLabel}>Coming Next</Text>
            <View style={styles.nextPreviewTickers}>
              {status.next_window_preview.map((sym) => (
                <Text key={sym} style={styles.nextPreviewTicker}>{sym}</Text>
              ))}
            </View>
          </View>
        )}
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

  // ── 4-direction swipe area ──
  swipeArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },

  // Card
  cardOuter: {
    width: CARD_WIDTH,
    height: CARD_SIZE,
    overflow: "visible",
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

  // Back card
  backCardContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  backCard: {
    transform: [{ scale: 0.97 }, { translateY: 14 }],
    opacity: 0.6,
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
    justifyContent: "center",
    gap: 2,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    width: 100,
    minHeight: 120,
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

  // ── Adjustment controls ──
  adjustButton: {
    marginTop: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.orange + "40",
  },
  adjustButtonText: {
    fontFamily: FontFamily.medium,
    fontSize: 10,
    color: Colors.orange,
  },
  adjustControls: {
    marginTop: 4,
    alignItems: "center",
    gap: 3,
  },
  adjustOption: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  adjustOptionText: {
    fontFamily: FontFamily.bold,
    fontSize: 10,
  },

  // ── Next window preview ──
  nextPreview: {
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  nextPreviewLabel: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  nextPreviewTickers: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  nextPreviewTicker: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.sm,
    color: Colors.orange,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    overflow: "hidden",
  },

  // ── Showdown ──
  showdownRevealButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.yellow + "40",
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  showdownRevealText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
    color: Colors.text,
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

  // ── Conditions banner ──
  conditionsBanner: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  conditionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.yellow + "18",
    borderWidth: 1,
    borderColor: Colors.yellow + "40",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  conditionChipText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xs,
    color: Colors.yellow,
  },

  // ── High Noon card ──
  highNoonCard: {
    borderColor: Colors.yellow,
    borderWidth: 2,
  },
  highNoonBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.yellow,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  highNoonBadgeText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xs,
    color: "#000",
  },
});
