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
    refetchInterval: 30000,
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
    },
  });
}
