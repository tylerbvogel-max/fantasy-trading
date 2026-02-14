import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Animated as RNAnimated,
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
import SwipeCard from "../components/SwipeCard";
import IronOfferingModal from "../components/IronOfferingModal";

// Scoring tables from bounty_config (for display only)
const DIR_SCORING: Record<number, { win: number; lose: number }> = {
  1: { win: 13, lose: 11 },
  2: { win: 31, lose: 28 },
  3: { win: 57, lose: 70 },
};

const WANTED_MULT: Record<number, number> = {
  1: 1, 2: 2, 3: 4, 4: 8, 5: 18,
  6: 42, 7: 100, 8: 230, 9: 530, 10: 1200,
};

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
  const { data: status, isLoading, isError, refetch } = useBountyStatus();
  const submitPrediction = useSubmitPrediction();
  const submitSkip = useBountySkip();
  const { data: ironOffering, refetch: refetchOffering } = useBountyIronOffering();
  const pickIronMutation = usePickIron();
  const resetMutation = useBountyReset();
  const [confidence, setConfidence] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useState(() => new RNAnimated.Value(0))[0];
  const [swipedPicks, setSwipedPicks] = useState<{ symbol: string; prediction: "UP" | "DOWN" | "HOLD"; confidence: number }[]>([]);
  const [skippedSymbols, setSkippedSymbols] = useState<string[]>([]);
  const [showIronModal, setShowIronModal] = useState(false);

  const showToast = (message: string) => {
    setToast(message);
    toastOpacity.setValue(1);
    setTimeout(() => {
      RNAnimated.timing(toastOpacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => setToast(null));
    }, 4500);
  };

  const currentWindow = status?.current_window;
  const previousWindow = status?.previous_window;
  const myPick = status?.my_pick;
  const previousPick = status?.previous_pick;
  const stats = status?.player_stats;
  const anteCost = status?.ante_cost ?? 75;
  const skipCost = status?.skip_cost ?? 25;

  // Check for pending iron offering
  useEffect(() => {
    if (stats?.pending_offering && ironOffering?.offering_id) {
      setShowIronModal(true);
    }
  }, [stats?.pending_offering, ironOffering?.offering_id]);

  // Reset optimistic swiped list when window changes
  const windowId = currentWindow?.id;
  useEffect(() => {
    setSwipedPicks([]);
    setSkippedSymbols([]);
  }, [windowId]);

  // Multi-stock: derive unpicked, picked, and skipped stocks
  const allStocks = status?.stocks ?? [];
  const swipedSymbolSet = new Set(swipedPicks.map((p) => p.symbol));
  const unpickedStocks = allStocks.filter(
    (s) => !s.my_pick && !swipedSymbolSet.has(s.symbol) && !skippedSymbols.includes(s.symbol)
  );
  const pickedStocks = allStocks.filter((s) => !!s.my_pick || swipedSymbolSet.has(s.symbol));
  const skippedStocks = allStocks.filter((s) => skippedSymbols.includes(s.symbol) && !s.my_pick);
  const currentStock = unpickedStocks.length > 0 ? unpickedStocks[0] : null;
  const nextStock = unpickedStocks.length > 1 ? unpickedStocks[1] : null;
  const allExhausted = allStocks.length > 0 && unpickedStocks.length === 0;
  const stockProgress = allStocks.length > 0
    ? `${pickedStocks.length + skippedStocks.length + 1}/${allStocks.length}`
    : "";

  const windowEndCountdown = useCountdown(currentWindow?.end_time ?? null);
  const nextWindowCountdown = useCountdown(
    !currentWindow ? status?.next_window_time ?? null : null
  );

  const wantedLevel = stats?.wanted_level ?? 1;
  const mult = getWantedMult(Math.max(wantedLevel, 1));

  const CONFIDENCE_OPTIONS = [
    {
      value: 1,
      label: "Draw",
      description: `+${DIR_SCORING[1].win}x${mult}`,
      color: Colors.text,
      bgColor: Colors.surface,
    },
    {
      value: 2,
      label: "Quick Draw",
      description: `+${DIR_SCORING[2].win}x${mult}`,
      color: Colors.yellow,
      bgColor: Colors.yellow + "20",
    },
    {
      value: 3,
      label: "Dead Eye",
      description: `+${DIR_SCORING[3].win}x${mult}`,
      color: Colors.orange,
      bgColor: Colors.orange + "20",
    },
  ];

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
        onSuccess: () => {
          showToast(`${symbol} Locked In!`);
        },
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
        onSuccess: () => {
          showToast(`${symbol} HOLD Locked In!`);
        },
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

    setSkippedSymbols((prev) => [...prev, currentStock.symbol]);

    submitSkip.mutate(
      {
        bounty_window_id: currentWindow.id,
        symbol: currentStock.symbol,
      },
      {
        onSuccess: (data) => {
          showToast(`Skipped (-$$${data.skip_cost})`);
          if (data.is_busted) {
            refetch();
          }
        },
        onError: (error) => {
          setSkippedSymbols((prev) => prev.filter((s) => s !== currentStock.symbol));
          showToast(error.message ?? "Skip failed");
        },
      }
    );
  };

  const handlePickIron = (ironId: string) => {
    pickIronMutation.mutate(ironId, {
      onSuccess: () => {
        setShowIronModal(false);
        showToast("Iron equipped!");
        refetchOffering();
      },
      onError: (error) => {
        Alert.alert("Error", error.message);
      },
    });
  };

  const handleReset = () => {
    resetMutation.mutate(undefined, {
      onSuccess: (data) => {
        showToast(data.message);
        refetch();
      },
      onError: (error) => {
        Alert.alert("Error", error.message);
      },
    });
  };

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

  // Iron offering modal
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
    <RNAnimated.View style={[styles.toast, { opacity: toastOpacity }]}>
      <Ionicons name="checkmark-circle" size={20} color={Colors.green} />
      <Text style={styles.toastText}>{toast}</Text>
    </RNAnimated.View>
  ) : null;

  // ── BUST STATE ──
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

  const hasActiveWindow = !!currentWindow;

  // Equipped irons row
  const equippedIronsRow = stats?.equipped_irons && stats.equipped_irons.length > 0 ? (
    <View style={styles.ironsRow}>
      {stats.equipped_irons.map((iron) => {
        const rarityColor = iron.rarity === "rare" ? Colors.yellow : iron.rarity === "uncommon" ? Colors.primary : Colors.textMuted;
        return (
          <View key={iron.slot_number} style={[styles.ironPill, { borderColor: rarityColor + "60" }]}>
            <Text style={[styles.ironPillText, { color: rarityColor }]}>
              {iron.name.split(" ").map(w => w[0]).join("")}
            </Text>
          </View>
        );
      })}
    </View>
  ) : null;

  // Active window, stocks still to pick
  if (hasActiveWindow && currentStock) {
    return (
      <View style={styles.container}>
        {toastElement}
        {ironModal}
        <View style={styles.header}>
          <Text style={styles.title}>Bounty Hunter</Text>
        </View>

        {/* Compact stats row */}
        {stats && (
          <View style={styles.compactStatsRow}>
            <Text style={styles.compactStat}>
              <Text style={{ color: Colors.yellow }}>$$</Text> {stats.double_dollars.toLocaleString()}
            </Text>
            <Text style={styles.compactStatDivider}>|</Text>
            <Text style={styles.compactStat}>
              <Text style={{ color: Colors.orange }}>Lv.{stats.wanted_level}</Text>
              <Text style={{ color: Colors.textMuted, fontSize: FontSize.xs }}> ({"\u00D7"}{mult})</Text>
            </Text>
            <Text style={styles.compactStatDivider}>|</Text>
            <Text style={styles.compactStat}>{stats.accuracy_pct}%</Text>
          </View>
        )}

        {/* Equipped irons */}
        {equippedIronsRow}

        {/* Timer + progress */}
        <View style={styles.timerRow}>
          <Text style={styles.timerLabel}>
            Bounty #{currentWindow.window_index} — Closes in
          </Text>
          <Text style={styles.timerValue}>{windowEndCountdown}</Text>
          {allStocks.length > 1 && (
            <Text style={styles.progressLabel}>{stockProgress}</Text>
          )}
        </View>

        {/* Swipe card with chart — centered in remaining space */}
        <View style={styles.swipeArea}>
          {/* Next card peeking behind */}
          {nextStock && (
            <View style={styles.backCardContainer}>
              <View style={styles.backCardInner}>
                <SwipeCard
                  key={nextStock.symbol}
                  onSwipeRight={() => {}}
                  onSwipeLeft={() => {}}
                  enabled={false}
                  candles={nextStock.candles}
                  openPrice={nextStock.open_price}
                  symbol={nextStock.symbol}
                  name={nextStock.name}
                />
              </View>
            </View>
          )}
          {/* Current card on top */}
          <SwipeCard
            key={currentStock.symbol}
            onSwipeRight={() => handleSwipe("UP")}
            onSwipeLeft={() => handleSwipe("DOWN")}
            enabled={true}
            candles={currentStock.candles}
            openPrice={currentStock.open_price}
            symbol={currentStock.symbol}
            name={currentStock.name}
          />
        </View>

        {/* HOLD + Skip row */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.skipButton,
              (stats?.double_dollars ?? 0) < skipCost && styles.skipButtonDisabled,
            ]}
            onPress={handleSkip}
            disabled={(stats?.double_dollars ?? 0) < skipCost}
          >
            <Ionicons name="play-skip-forward" size={14} color={Colors.orange} />
            <Text style={styles.skipText}>Skip ($${ skipCost })</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.holdButton} onPress={handleHold}>
            <Ionicons name="pause-circle" size={16} color={Colors.primary} />
            <Text style={styles.holdText}>HOLD</Text>
          </TouchableOpacity>
        </View>

        {/* Confidence selector — compact at bottom */}
        <View style={styles.confidenceBar}>
          {CONFIDENCE_OPTIONS.map((opt) => {
            const isSelected = confidence === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.confButton,
                  isSelected && { backgroundColor: opt.bgColor },
                ]}
                onPress={() => setConfidence(opt.value)}
              >
                <Text style={[
                  styles.confLabel,
                  { color: isSelected ? opt.color : Colors.textMuted },
                ]}>
                  {opt.label}
                </Text>
                <Text style={[
                  styles.confDesc,
                  { color: isSelected ? opt.color : Colors.textMuted, opacity: isSelected ? 0.7 : 0.5 },
                ]}>
                  {opt.description}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  // Active window, all stocks picked — locked-in state
  if (hasActiveWindow && allExhausted) {
    return (
      <View style={styles.container}>
        {toastElement}
        {ironModal}
        <View style={styles.header}>
          <Text style={styles.title}>Bounty Hunter</Text>
        </View>

        {/* Compact stats row */}
        {stats && (
          <View style={styles.compactStatsRow}>
            <Text style={styles.compactStat}>
              <Text style={{ color: Colors.yellow }}>$$</Text> {stats.double_dollars.toLocaleString()}
            </Text>
            <Text style={styles.compactStatDivider}>|</Text>
            <Text style={styles.compactStat}>
              <Text style={{ color: Colors.orange }}>Lv.{stats.wanted_level}</Text>
              <Text style={{ color: Colors.textMuted, fontSize: FontSize.xs }}> ({"\u00D7"}{mult})</Text>
            </Text>
            <Text style={styles.compactStatDivider}>|</Text>
            <Text style={styles.compactStat}>{stats.accuracy_pct}%</Text>
          </View>
        )}

        {/* Equipped irons */}
        {equippedIronsRow}

        {/* Timer */}
        <View style={styles.timerRow}>
          <Text style={styles.timerLabel}>
            Bounty #{currentWindow!.window_index} — Closes in
          </Text>
          <Text style={styles.timerValue}>{windowEndCountdown}</Text>
        </View>

        {/* Locked-in picks — centered hero */}
        <ScrollView contentContainerStyle={styles.lockedPicksArea}>
          <Ionicons name="checkmark-circle" size={48} color={Colors.green} />
          <Text style={styles.lockedTitle}>Locked In</Text>
          <View style={styles.lockedPicksGrid}>
            {pickedStocks.map((stock) => {
              const swipedPick = swipedPicks.find((p) => p.symbol === stock.symbol);
              const pred = stock.my_pick?.prediction ?? swipedPick?.prediction;
              const conf = stock.my_pick?.confidence ?? swipedPick?.confidence ?? 1;
              const color = pred === "UP" ? Colors.green
                : pred === "DOWN" ? Colors.accent
                : pred === "HOLD" ? Colors.primary
                : Colors.textMuted;
              const icon = pred === "UP" ? "arrow-up-circle"
                : pred === "DOWN" ? "arrow-down-circle"
                : pred === "HOLD" ? "pause-circle"
                : "checkmark-circle";
              const confOpt = CONFIDENCE_OPTIONS.find((o) => o.value === conf) ?? CONFIDENCE_OPTIONS[0];
              return (
                <View
                  key={stock.symbol}
                  style={[
                    styles.lockedPickCard,
                    { borderColor: color + "40" },
                  ]}
                >
                  <Text style={[styles.lockedPickSymbol, { color }]}>
                    {stock.symbol}
                  </Text>
                  <Ionicons name={icon as any} size={22} color={color} />
                  {pred && (
                    <Text style={[styles.lockedPickLabel, { color }]}>
                      {pred}
                    </Text>
                  )}
                  <Text style={[styles.lockedPickBounty, { color: confOpt.color }]}>
                    {confOpt.label}
                  </Text>
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
        </ScrollView>

        {/* Previous result inline */}
        {previousWindow && previousWindow.is_settled && previousPick && (
          <View style={styles.prevResultBar}>
            <Text style={styles.prevResultLabel}>Last:</Text>
            <Text style={[
              styles.prevResultPayout,
              { color: (previousPick.payout ?? 0) >= 0 ? Colors.green : Colors.accent },
            ]}>
              {(previousPick.payout ?? 0) >= 0 ? "+" : ""}$${previousPick.payout}
            </Text>
          </View>
        )}
      </View>
    );
  }

  // No active window — no scroll
  return (
    <View style={styles.container}>
      {ironModal}
      <View style={styles.header}>
        <Text style={styles.title}>Bounty Hunter</Text>
      </View>

      {/* Compact stats row */}
      {stats && (
        <View style={styles.compactStatsRow}>
          <Text style={styles.compactStat}>
            <Text style={{ color: Colors.yellow }}>$$</Text> {stats.double_dollars.toLocaleString()}
          </Text>
          <Text style={styles.compactStatDivider}>|</Text>
          <Text style={styles.compactStat}>
            <Text style={{ color: Colors.orange }}>Lv.{stats.wanted_level}</Text>
            <Text style={{ color: Colors.textMuted, fontSize: FontSize.xs }}> ({"\u00D7"}{mult})</Text>
          </Text>
          <Text style={styles.compactStatDivider}>|</Text>
          <Text style={styles.compactStat}>{stats.accuracy_pct}%</Text>
        </View>
      )}

      {/* Equipped irons */}
      {equippedIronsRow}

      {/* Previous result card */}
      {previousWindow && previousWindow.is_settled && (
        <View style={styles.resultCardCompact}>
          <Text style={styles.resultCompactLabel}>Last Bounty</Text>
          <View style={[
            styles.resultBadgeInline,
            { backgroundColor: previousWindow.result === "UP" ? Colors.green + "20" : Colors.accent + "20" },
          ]}>
            <Ionicons
              name={previousWindow.result === "UP" ? "arrow-up" : "arrow-down"}
              size={14}
              color={previousWindow.result === "UP" ? Colors.green : Colors.accent}
            />
            <Text style={{
              color: previousWindow.result === "UP" ? Colors.green : Colors.accent,
              fontFamily: FontFamily.bold,
              fontSize: FontSize.sm,
            }}>
              {previousWindow.result}
            </Text>
          </View>
          {previousPick && (
            <Text style={[
              styles.resultCompactPayout,
              { color: (previousPick.payout ?? 0) >= 0 ? Colors.green : Colors.accent },
            ]}>
              {(previousPick.payout ?? 0) >= 0 ? "+" : ""}$${previousPick.payout}
            </Text>
          )}
        </View>
      )}

      {/* Centered waiting card */}
      <View style={styles.waitingArea}>
        <Ionicons name="timer-outline" size={48} color={Colors.orange} />
        <Text style={styles.waitingTitle}>Next Bounty</Text>
        <Text style={styles.waitingCountdown}>{nextWindowCountdown || "Calculating..."}</Text>
        <Text style={styles.waitingSubtext}>
          New bounty every 2 minutes.{"\n"}Ante: $${anteCost} per window.
        </Text>
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
    top: Spacing.statusBar + 50,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.card,
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

  // ── Compact prediction layout (no scroll) ──
  compactStatsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  compactStat: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  compactStatDivider: {
    color: Colors.border,
    fontSize: FontSize.sm,
  },
  ironsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  ironPill: {
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
  timerRow: {
    alignItems: "center",
    paddingBottom: Spacing.sm,
  },
  timerLabel: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
  },
  timerValue: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.orange,
    marginTop: 2,
  },
  progressLabel: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.semiBold,
    color: Colors.textMuted,
    marginTop: 2,
  },
  swipeArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  backCardContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  backCardInner: {
    transform: [{ scale: 0.95 }, { translateY: 8 }],
    opacity: 0.5,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  skipButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  skipButtonDisabled: {
    opacity: 0.3,
  },
  skipText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.orange,
  },
  holdButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.primary + "20",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary + "40",
  },
  holdText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: Colors.primary,
  },
  confidenceBar: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    paddingTop: Spacing.md,
  },
  confButton: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  confLabel: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
  },
  confDesc: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    marginTop: 1,
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
