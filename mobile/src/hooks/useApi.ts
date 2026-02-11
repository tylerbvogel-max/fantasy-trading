import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { seasons, portfolio, trading, stocks, auth, education } from "../api/client";
import type {
  LeaderboardEntry,
  PortfolioSummary,
  PortfolioAnalytics,
  TradeRequest,
  TradeResponse,
  TradeValidation,
  StockQuote,
  SeasonSummary,
  UserProfile,
  TopicSummary,
  FactDetail,
  QuizAnswerRequest,
  QuizAnswerResponse,
  UserKnowledgeScore,
} from "../api/client";

// ── Seasons ──

export function useSeasons(mode?: string) {
  return useQuery<SeasonSummary[]>({
    queryKey: ["seasons", mode ?? "all"],
    queryFn: () => seasons.list(mode),
  });
}

export function useLeaderboard(seasonId: string) {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard", seasonId],
    queryFn: () => seasons.leaderboard(seasonId),
    enabled: !!seasonId,
    refetchInterval: 60000, // Refresh every minute
  });
}

export function useJoinSeason() {
  const queryClient = useQueryClient();

  return useMutation<{ player_season_id: string; message: string }, Error, string>({
    mutationFn: (seasonId: string) => seasons.join(seasonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["seasons"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}

// ── Portfolio ──

export function usePortfolio(seasonId: string) {
  return useQuery<PortfolioSummary>({
    queryKey: ["portfolio", seasonId],
    queryFn: () => portfolio.get(seasonId),
    enabled: !!seasonId,
    refetchInterval: 60000,
  });
}

export function usePortfolioHistory(seasonId: string) {
  return useQuery<{ date: string; total_value: number; percent_gain: number }[]>({
    queryKey: ["portfolioHistory", seasonId],
    queryFn: () => portfolio.history(seasonId),
    enabled: !!seasonId,
  });
}

// ── Trading ──

export function useTrade() {
  const queryClient = useQueryClient();

  return useMutation<TradeResponse, Error, TradeRequest>({
    mutationFn: trading.execute,
    onSuccess: (data) => {
      // Invalidate portfolio and leaderboard caches after a successful trade
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}

export function useValidateTrade() {
  return useMutation<TradeValidation, Error, TradeRequest>({
    mutationFn: trading.validate,
  });
}

export function useTradeHistory(seasonId: string) {
  return useQuery({
    queryKey: ["tradeHistory", seasonId],
    queryFn: () => trading.history(seasonId),
    enabled: !!seasonId,
  });
}

// ── Stocks ──

export function useStocks() {
  return useQuery<StockQuote[]>({
    queryKey: ["stocks"],
    queryFn: stocks.list,
  });
}

export function useStockSearch(query: string) {
  return useQuery<StockQuote[]>({
    queryKey: ["stockSearch", query],
    queryFn: () => stocks.search(query),
    enabled: query.length >= 1,
  });
}

export function useStockCount() {
  return useQuery<{ count: number }>({
    queryKey: ["stockCount"],
    queryFn: stocks.count,
  });
}

// ── Analytics ──

export function usePortfolioAnalytics(seasonId: string, compareTo?: string) {
  return useQuery<PortfolioAnalytics>({
    queryKey: ["portfolioAnalytics", seasonId, compareTo ?? ""],
    queryFn: () => portfolio.analytics(seasonId, compareTo),
    enabled: !!seasonId,
  });
}

export function useSeasonPlayers(seasonId: string) {
  return useQuery<string[]>({
    queryKey: ["seasonPlayers", seasonId],
    queryFn: () => seasons.players(seasonId),
    enabled: !!seasonId,
  });
}

// ── User ──

export function useProfile() {
  return useQuery<UserProfile>({
    queryKey: ["profile"],
    queryFn: auth.me,
  });
}

// ── Education ──

export function useTopics() {
  return useQuery<TopicSummary[]>({
    queryKey: ["educationTopics"],
    queryFn: education.topics,
  });
}

export function useTopicFacts(topicId: string) {
  return useQuery<FactDetail[]>({
    queryKey: ["educationFacts", topicId],
    queryFn: () => education.facts(topicId),
    enabled: !!topicId,
  });
}

export function useSubmitQuizAnswer() {
  const queryClient = useQueryClient();

  return useMutation<QuizAnswerResponse, Error, QuizAnswerRequest>({
    mutationFn: education.submitAnswer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["educationTopics"] });
      queryClient.invalidateQueries({ queryKey: ["educationFacts"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["knowledgeScore"] });
    },
  });
}

export function useKnowledgeScore() {
  return useQuery<UserKnowledgeScore>({
    queryKey: ["knowledgeScore"],
    queryFn: education.score,
  });
}
