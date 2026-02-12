import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { seasons, portfolio, trading, stocks, auth, education, bounty } from "../api/client";
import type {
  LeaderboardEntry,
  PortfolioSummary,
  PortfolioAnalytics,
  TradeRequest,
  TradeResponse,
  TradeValidation,
  StockQuote,
  SeasonSummary,
  SeasonDetail,
  CreateSeasonRequest,
  UserProfile,
  TopicSummary,
  FactDetail,
  QuizAnswerRequest,
  QuizAnswerResponse,
  UserKnowledgeScore,
  BountyStatus,
  BountyBoardEntry,
  BountyPickResponse,
  BountySubmitResponse,
  BountyDetailedStats,
} from "../api/client";

// ── Seasons ──

export function useSeasons(mode?: string) {
  return useQuery<SeasonSummary[]>({
    queryKey: ["seasons", mode ?? "all"],
    queryFn: () => seasons.list(mode),
  });
}

export function useSeasonDetail(seasonId: string) {
  return useQuery<SeasonDetail>({
    queryKey: ["seasonDetail", seasonId],
    queryFn: () => seasons.get(seasonId),
    enabled: !!seasonId,
  });
}

export function useSeasonStocks(seasonId: string) {
  return useQuery<StockQuote[]>({
    queryKey: ["seasonStocks", seasonId],
    queryFn: () => seasons.stocks(seasonId),
    enabled: !!seasonId,
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

export function useCreateSeason() {
  const queryClient = useQueryClient();

  return useMutation<SeasonDetail, Error, CreateSeasonRequest>({
    mutationFn: (data: CreateSeasonRequest) => seasons.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seasons"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
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

export function usePlayerPortfolio(seasonId: string, alias: string) {
  return useQuery<PortfolioSummary>({
    queryKey: ["playerPortfolio", seasonId, alias],
    queryFn: () => portfolio.player(seasonId, alias),
    enabled: !!seasonId && !!alias,
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

// ── Bounty / Time Attack ──

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
    { bounty_window_id: string; prediction: string; confidence: number }
  >({
    mutationFn: (data) => bounty.predict(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bountyStatus"] });
    },
  });
}
