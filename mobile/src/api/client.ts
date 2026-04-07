/**
 * API client for the Bounty Hunter backend.
 * All requests go through this module for consistent auth handling.
 */

import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

// Reads from app.json → expo.extra.apiUrl. Change there for prod.
const API_BASE: string =
  Constants.expoConfig?.extra?.apiUrl ?? "https://fantasy-trading-api.onrender.com";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const LEGACY_TOKEN_KEY = "auth_token";

let accessToken: string | null = null;
let refreshToken: string | null = null;
let isRefreshing = false;

// Legacy compat: still expose for code that reads authToken
export function setAuthToken(token: string | null) {
  accessToken = token;
}

export function getAuthToken(): string | null {
  return accessToken;
}

export async function persistTokens(access: string, refresh: string): Promise<void> {
  accessToken = access;
  refreshToken = refresh;
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, access);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refresh);
  // Clean up legacy key if present
  await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY).catch(() => {});
}

/** Legacy compat: persist a single opaque token (old flow). */
export async function persistToken(token: string): Promise<void> {
  accessToken = token;
  refreshToken = null;
  await SecureStore.setItemAsync(LEGACY_TOKEN_KEY, token);
}

export async function loadStoredToken(): Promise<string | null> {
  // Try new JWT tokens first
  const access = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  const refresh = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  if (access) {
    accessToken = access;
    refreshToken = refresh;
    return access;
  }
  // Fall back to legacy single token
  const legacy = await SecureStore.getItemAsync(LEGACY_TOKEN_KEY);
  if (legacy) {
    accessToken = legacy;
    return legacy;
  }
  return null;
}

export async function clearStoredToken(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY).catch(() => {});
}

// Global sign-out: clears token and notifies the app to reset to auth screen
let _onSignOut: (() => void) | null = null;

export function registerSignOutHandler(handler: () => void) {
  _onSignOut = handler;
}

export async function signOut(): Promise<void> {
  await clearStoredToken();
  _onSignOut?.();
}

/** Try refreshing the access token using the stored refresh token. */
async function tryRefresh(): Promise<boolean> {
  if (!refreshToken || isRefreshing) return false;
  isRefreshing = true;
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) return false;
    const data: AuthTokenResponse = await response.json();
    await persistTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  } finally {
    isRefreshing = false;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  _retried = false
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    // On 401, try refreshing before signing out
    if (response.status === 401 && accessToken && !_retried) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        return request<T>(path, options, true);
      }
      await signOut();
    }
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    const detail = error.detail;
    const msg = typeof detail === "string"
      ? detail
      : Array.isArray(detail)
        ? detail.map((d: any) => d.msg ?? JSON.stringify(d)).join("; ")
        : `HTTP ${response.status}`;
    throw new Error(msg);
  }

  return response.json();
}

// ── Auth ──

// Legacy interfaces (kept for backwards compat)
export interface RegisterRequest {
  alias: string;
  invite_code: string;
}

export interface RegisterResponse {
  user_id: string;
  alias: string;
  token: string;
  message: string;
}

export interface LoginRequest {
  alias: string;
  token: string;
}

// New v2 interfaces
export interface RegisterRequestV2 {
  alias: string;
  email: string;
  password: string;
  invite_code?: string;
}

export interface LoginRequestV2 {
  email_or_alias: string;
  password: string;
}

export interface AuthTokenResponse {
  user_id: string;
  alias: string;
  is_admin: boolean;
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface UserProfile {
  id: string;
  alias: string;
  email: string | null;
  email_verified: boolean;
  is_admin: boolean;
  has_password: boolean;
  created_at: string;
}

export const auth = {
  // Legacy endpoints
  register: (data: RegisterRequest) =>
    request<RegisterResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data: LoginRequest) =>
    request<RegisterResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // New v2 endpoints
  registerV2: (data: RegisterRequestV2) =>
    request<AuthTokenResponse>("/auth/v2/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  loginV2: (data: LoginRequestV2) =>
    request<AuthTokenResponse>("/auth/v2/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  forgotPassword: (email: string) =>
    request<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, new_password: string) =>
    request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    }),

  upgrade: (legacy_token: string, email: string, password: string) =>
    request<AuthTokenResponse>("/auth/upgrade", {
      method: "POST",
      body: JSON.stringify({ legacy_token, email, password }),
    }),

  me: () => request<UserProfile>("/auth/me"),
};

// ── Stocks ──

export interface StockQuote {
  symbol: string;
  name: string;
  price: number | null;
  change_pct: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  market_cap: number | null;
  pe_ratio: number | null;
  beta: number | null;
}

export const stocks = {
  list: () => request<StockQuote[]>("/stocks"),

  search: (q: string) => request<StockQuote[]>(`/stocks/search?q=${q}`),

  get: (symbol: string) => request<StockQuote>(`/stocks/${symbol}`),

  count: () => request<{ count: number }>("/stocks/count"),
};

// ── Bounty ──

export interface BountyWindowResponse {
  id: string;
  window_date: string;
  window_index: number;
  start_time: string;
  end_time: string;
  prediction_cutoff: string | null;
  spy_open_price: number | null;
  spy_close_price: number | null;
  result: string | null;
  is_settled: boolean;
}

export interface BountyPickResponse {
  id: string;
  prediction: string;
  confidence: number;
  confidence_label: string;
  is_correct: boolean | null;
  payout: number;
  wanted_level_at_pick: number;
  created_at: string;
  action_type: string;
  insurance_triggered: boolean;
  base_points: number;
  wanted_multiplier_used: number;
  leverage: number;
  margin_call_triggered: boolean;
}

export interface BountyEquippedIron {
  iron_id: string;
  name: string;
  rarity: string;
  description: string;
  boost_description?: string;
  slot_number: number;
}

export interface BountyStatsResponse {
  double_dollars: number;
  wanted_level: number;
  total_predictions: number;
  correct_predictions: number;
  accuracy_pct: number;
  best_streak: number;
  notoriety: number;
  chambers: number;
  is_busted: boolean;
  bust_count: number;
  margin_call_cooldown: number;
  equipped_irons: BountyEquippedIron[];
  pending_offering: boolean;
  // P1 additions
  peak_dd: number;
  peak_wanted_level: number;
  best_run_score: number;
  current_streak: number;
  longest_streak: number;
  streak_shield: boolean;
  active_title: string;
  lifetime_dd_earned: number;
  runs_completed: number;
}

export interface SpyCandlePoint {
  timestamp: number;
  close: number;
  open?: number;
  high?: number;
  low?: number;
}

export interface BountyStockStatus {
  symbol: string;
  name: string;
  open_price: number | null;
  close_price: number | null;
  result: string | null;
  is_settled: boolean;
  candles: SpyCandlePoint[];
  my_pick: BountyPickResponse | null;
}

export interface BountyStatus {
  current_window: BountyWindowResponse | null;
  previous_window: BountyWindowResponse | null;
  my_pick: BountyPickResponse | null;
  previous_pick: BountyPickResponse | null;
  player_stats: BountyStatsResponse;
  next_window_time: string | null;
  spy_candles: SpyCandlePoint[];
  stocks: BountyStockStatus[];
  ante_cost: number;
  skip_cost: number;
  max_leverage: number;
}

export interface BountyIronFullDef {
  id: string;
  name: string;
  rarity: string;
  description: string;
  boost_description?: string;
}

export interface BountyIronDef {
  id: string;
  name: string;
  rarity: string;
  description: string;
}

export interface BountyIronOffering {
  offering_id: string | null;
  irons: BountyIronDef[];
}

export interface BountyResetResponse {
  double_dollars: number;
  message: string;
}

export interface BountySkipResponse {
  skip_cost: number;
  new_balance: number;
  is_busted: boolean;
}

export interface BountySubmitResponse {
  prediction: string;
  bet_amount: number;
  message: string;
  symbol: string;
  leverage: number;
}

export interface ConfidenceStatEntry {
  confidence: number;
  label: string;
  total: number;
  correct: number;
  win_rate: number;
}

export interface TimeSlotStatEntry {
  window_index: number;
  time_label: string;
  total: number;
  correct: number;
  win_rate: number;
}

export interface TickerStatEntry {
  symbol: string;
  total: number;
  correct: number;
  win_rate: number;
}

export interface WeeklyTrend {
  this_week: number;
  last_week: number;
  change: number;
}

export interface WantedLevelProgress {
  current_level: number;
  max_level: number;
  progress_pct: number;
}

export interface BountyDetailedStats {
  double_dollars: number;
  wanted_level: number;
  total_predictions: number;
  correct_predictions: number;
  accuracy_pct: number;
  best_streak: number;
  confidence_stats: ConfidenceStatEntry[];
  time_slot_stats: TimeSlotStatEntry[];
  ticker_stats: TickerStatEntry[];
  weekly_trend: WeeklyTrend;
  board_rank: number | null;
  wanted_level_progress: WantedLevelProgress;
}

export interface BountyBoardEntry {
  rank: number;
  alias: string;
  double_dollars: number;
  accuracy_pct: number;
  wanted_level: number;
  total_predictions: number;
  best_run_score: number;
  title: string;
}

// P1-A: Run History
export interface BountyRunHistoryEntry {
  id: string;
  peak_dd: number;
  peak_wanted_level: number;
  accuracy: number;
  rounds_played: number;
  run_score: number;
  end_reason: string;
  ended_at: string;
}

// P1-B: Badges
export interface BountyBadge {
  id: string;
  name: string;
  category: string;
  description: string;
  earned: boolean;
  earned_at: string | null;
}

export interface BountyBadgeProgress {
  earned_count: number;
  total_count: number;
  progress: Record<string, any>;
}

// P1-C: Titles
export interface BountyTitle {
  id: string;
  name: string;
  order: number;
  description: string;
  unlocked: boolean;
  unlocked_at: string | null;
}

// P1-D: Streaks
export interface BountyStreakInfo {
  current_streak: number;
  longest_streak: number;
  last_streak_date: string | null;
  streak_shield: boolean;
  at_risk: boolean;
  next_milestone: { day: number; reward: any } | null;
}

// P2-A: Iron Combos
export interface BountyIronCombo {
  id: string;
  name: string;
  description: string;
  irons: string[] | { id: string; name: string }[];
}

// P2-C: Settlement Analysis
export interface BountySettlementAnalysis {
  settled: boolean;
  window_id?: string;
  stocks?: any[];
  prediction_aggregates?: Record<string, Record<string, number>>;
  my_predictions?: any[];
}

// P2-D: Performance Analytics
export interface BountyPerformanceAnalytics {
  confidence_stats: Record<number, { total: number; correct: number; win_rate: number }>;
  leverage_stats: Record<string, { total: number; correct: number; win_rate: number }>;
  time_stats: { time_slot: string; total: number; correct: number; win_rate: number }[];
  action_stats: Record<string, { total: number; correct: number; win_rate: number }>;
  rolling_trend: { date: string; total: number; correct: number; win_rate: number }[];
  alpha_vs_random: number;
  total_predictions: number;
  overall_accuracy: number;
}

// P3-B: Activity Feed
export interface BountyActivityEvent {
  id: string;
  alias: string;
  event_type: string;
  event_data: Record<string, any>;
  created_at: string;
}

export const bounty = {
  status: () => request<BountyStatus>("/bounty/status"),

  predict: (data: { bounty_window_id: string; prediction: string; bet_amount: number; symbol: string; leverage: number }) =>
    request<BountySubmitResponse>("/bounty/predict", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  skip: (data: { bounty_window_id: string; symbol: string }) =>
    request<BountySkipResponse>("/bounty/skip", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  board: (period: "weekly" | "alltime") =>
    request<BountyBoardEntry[]>(`/bounty/board?period=${period}`),

  history: (limit?: number) =>
    request<BountyPickResponse[]>(`/bounty/history?limit=${limit ?? 20}`),

  stats: () => request<BountyDetailedStats>("/bounty/stats"),

  allIrons: () => request<BountyIronFullDef[]>("/bounty/irons/all"),

  irons: () => request<BountyEquippedIron[]>("/bounty/irons"),

  ironOffering: () => request<BountyIronOffering>("/bounty/irons/offering"),

  pickIron: (ironId: string) =>
    request<BountyEquippedIron>("/bounty/irons/pick", {
      method: "POST",
      body: JSON.stringify({ iron_id: ironId }),
    }),

  reset: () =>
    request<BountyResetResponse>("/bounty/reset", {
      method: "POST",
    }),

  // P1-A: Run History
  runs: (limit?: number) =>
    request<BountyRunHistoryEntry[]>(`/bounty/runs?limit=${limit ?? 20}`),

  // P1-B: Badges
  badges: () => request<BountyBadge[]>("/bounty/badges"),
  badgeProgress: () => request<BountyBadgeProgress>("/bounty/badges/progress"),

  // P1-C: Titles
  titles: () => request<BountyTitle[]>("/bounty/titles"),
  equipTitle: (titleId: string) =>
    request<{ title_id: string; title_name: string }>("/bounty/titles/equip", {
      method: "POST",
      body: JSON.stringify({ title_id: titleId }),
    }),

  // P1-D: Streaks
  streak: () => request<BountyStreakInfo>("/bounty/streak"),

  // P2-A: Iron Combos
  activeCombos: () => request<BountyIronCombo[]>("/bounty/combos"),
  allCombos: () => request<BountyIronCombo[]>("/bounty/combos/all"),

  // P2-C: Settlement Analysis
  analysis: (windowId: string) =>
    request<BountySettlementAnalysis>(`/bounty/analysis/${windowId}`),

  // P2-D: Performance Analytics
  analytics: () => request<BountyPerformanceAnalytics>("/bounty/analytics"),

  // P3-A: Share Cards
  shareCard: (eventType: string) =>
    request<Record<string, any>>(`/bounty/share/${eventType}`),

  // P3-B: Activity Feed
  feed: (limit?: number) =>
    request<BountyActivityEvent[]>(`/bounty/feed?limit=${limit ?? 50}`),
};
