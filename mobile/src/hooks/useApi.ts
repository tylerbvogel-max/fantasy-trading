import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { auth, bounty } from "../api/client";
import type {
  UserProfile,
  BountyStatus,
  BountyBoardEntry,
  BountyPickResponse,
  BountySubmitResponse,
  BountyDetailedStats,
  BountyEquippedIron,
  BountyIronFullDef,
  BountyIronOffering,
  BountyResetResponse,
  BountySkipResponse,
  BountyRunHistoryEntry,
  BountyBadge,
  BountyBadgeProgress,
  BountyTitle,
  BountyStreakInfo,
  BountyIronCombo,
  BountySettlementAnalysis,
  BountyPerformanceAnalytics,
  BountyActivityEvent,
  BountyAdjustResponse,
} from "../api/client";

// ── User ──

export function useProfile() {
  return useQuery<UserProfile>({
    queryKey: ["profile"],
    queryFn: auth.me,
  });
}

// ── Bounty ──

export function useBountyStatus() {
  return useQuery<BountyStatus>({
    queryKey: ["bountyStatus"],
    queryFn: () => bounty.status(),
    refetchInterval: 15000,
  });
}

export function useBountyBoard(period: "weekly" | "alltime") {
  return useQuery<BountyBoardEntry[]>({
    queryKey: ["bountyBoard", period],
    queryFn: () => bounty.board(period),
  });
}

export function useBountyHistory(limit?: number) {
  return useQuery<BountyPickResponse[]>({
    queryKey: ["bountyHistory", limit],
    queryFn: () => bounty.history(limit),
  });
}

export function useBountyDetailedStats() {
  return useQuery<BountyDetailedStats>({
    queryKey: ["bountyDetailedStats"],
    queryFn: () => bounty.stats(),
  });
}

export function useSubmitPrediction() {
  const queryClient = useQueryClient();

  return useMutation<
    BountySubmitResponse,
    Error,
    { bounty_window_id: string; prediction: string; bet_amount: number; symbol: string; leverage: number }
  >({
    mutationFn: (data) => bounty.predict(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bountyStatus"] });
      queryClient.invalidateQueries({ queryKey: ["bountyStreak"] });
    },
  });
}

export function useBountySkip() {
  const queryClient = useQueryClient();

  return useMutation<
    BountySkipResponse,
    Error,
    { bounty_window_id: string; symbol: string }
  >({
    mutationFn: (data) => bounty.skip(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bountyStatus"] });
    },
  });
}

export function useAdjustPrediction() {
  const queryClient = useQueryClient();

  return useMutation<
    BountyAdjustResponse,
    Error,
    { bounty_window_id: string; symbol: string; new_prediction: string; new_bet_amount?: number }
  >({
    mutationFn: (data) => bounty.adjust(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bountyStatus"] });
    },
  });
}

export function useAllIrons() {
  return useQuery<BountyIronFullDef[]>({
    queryKey: ["allIrons"],
    queryFn: () => bounty.allIrons(),
  });
}

export function useBountyIrons() {
  return useQuery<BountyEquippedIron[]>({
    queryKey: ["bountyIrons"],
    queryFn: () => bounty.irons(),
  });
}

export function useBountyIronOffering() {
  return useQuery<BountyIronOffering>({
    queryKey: ["bountyIronOffering"],
    queryFn: () => bounty.ironOffering(),
  });
}

export function usePickIron() {
  const queryClient = useQueryClient();

  return useMutation<BountyEquippedIron, Error, string>({
    mutationFn: (ironId) => bounty.pickIron(ironId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bountyStatus"] });
      queryClient.invalidateQueries({ queryKey: ["bountyIrons"] });
      queryClient.invalidateQueries({ queryKey: ["bountyIronOffering"] });
      queryClient.invalidateQueries({ queryKey: ["bountyActiveCombos"] });
    },
  });
}

export function useBountyReset() {
  const queryClient = useQueryClient();

  return useMutation<BountyResetResponse, Error, void>({
    mutationFn: () => bounty.reset(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bountyStatus"] });
      queryClient.invalidateQueries({ queryKey: ["bountyIrons"] });
      queryClient.invalidateQueries({ queryKey: ["bountyIronOffering"] });
      queryClient.invalidateQueries({ queryKey: ["bountyBadges"] });
      queryClient.invalidateQueries({ queryKey: ["bountyTitles"] });
      queryClient.invalidateQueries({ queryKey: ["bountyRuns"] });
    },
  });
}

// ── P1-A: Run History ──

export function useBountyRuns(limit?: number) {
  return useQuery<BountyRunHistoryEntry[]>({
    queryKey: ["bountyRuns", limit],
    queryFn: () => bounty.runs(limit),
  });
}

// ── P1-B: Badges ──

export function useBountyBadges() {
  return useQuery<BountyBadge[]>({
    queryKey: ["bountyBadges"],
    queryFn: () => bounty.badges(),
  });
}

export function useBountyBadgeProgress() {
  return useQuery<BountyBadgeProgress>({
    queryKey: ["bountyBadgeProgress"],
    queryFn: () => bounty.badgeProgress(),
  });
}

// ── P1-C: Titles ──

export function useBountyTitles() {
  return useQuery<BountyTitle[]>({
    queryKey: ["bountyTitles"],
    queryFn: () => bounty.titles(),
  });
}

export function useEquipTitle() {
  const queryClient = useQueryClient();

  return useMutation<{ title_id: string; title_name: string }, Error, string>({
    mutationFn: (titleId) => bounty.equipTitle(titleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bountyStatus"] });
      queryClient.invalidateQueries({ queryKey: ["bountyTitles"] });
    },
  });
}

// ── P1-D: Streaks ──

export function useBountyStreak() {
  return useQuery<BountyStreakInfo>({
    queryKey: ["bountyStreak"],
    queryFn: () => bounty.streak(),
  });
}

// ── P2-A: Iron Combos ──

export function useBountyActiveCombos() {
  return useQuery<BountyIronCombo[]>({
    queryKey: ["bountyActiveCombos"],
    queryFn: () => bounty.activeCombos(),
  });
}

export function useBountyAllCombos() {
  return useQuery<BountyIronCombo[]>({
    queryKey: ["bountyAllCombos"],
    queryFn: () => bounty.allCombos(),
  });
}

// ── P2-C: Settlement Analysis ──

export function useBountyAnalysis(windowId: string | null) {
  return useQuery<BountySettlementAnalysis>({
    queryKey: ["bountyAnalysis", windowId],
    queryFn: () => bounty.analysis(windowId!),
    enabled: !!windowId,
  });
}

// ── P2-D: Performance Analytics ──

export function useBountyAnalytics() {
  return useQuery<BountyPerformanceAnalytics>({
    queryKey: ["bountyAnalytics"],
    queryFn: () => bounty.analytics(),
  });
}

// ── P3-B: Activity Feed ──

export function useBountyFeed(limit?: number) {
  return useQuery<BountyActivityEvent[]>({
    queryKey: ["bountyFeed", limit],
    queryFn: () => bounty.feed(limit),
    refetchInterval: 60000, // Refresh feed every minute
  });
}
