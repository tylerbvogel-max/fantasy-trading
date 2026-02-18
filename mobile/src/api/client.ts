/**
 * API client for the Bounty Hunter backend.
 * All requests go through this module for consistent auth handling.
 */

import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

// Reads from app.json → expo.extra.apiUrl. Change there for prod.
const API_BASE: string =
  Constants.expoConfig?.extra?.apiUrl ?? "https://fantasy-trading-api.onrender.com";

const TOKEN_KEY = "auth_token";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export async function persistToken(token: string): Promise<void> {
  authToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function loadStoredToken(): Promise<string | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    authToken = token;
  }
  return token;
}

export async function clearStoredToken(): Promise<void> {
  authToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
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

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    // If the backend rejects our token, sign out automatically
    if (response.status === 401 && authToken) {
      await signOut();
    }
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// ── Auth ──

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

export interface UserProfile {
  id: string;
  alias: string;
  is_admin: boolean;
  created_at: string;
}

export const auth = {
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
}

export interface BountyEquippedIron {
  iron_id: string;
  name: string;
  rarity: string;
  description: string;
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
  equipped_irons: BountyEquippedIron[];
  pending_offering: boolean;
}

export interface SpyCandlePoint {
  timestamp: number;
  close: number;
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
  confidence_label: string;
  message: string;
  symbol: string;
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
}

export const bounty = {
  status: () => request<BountyStatus>("/bounty/status"),

  predict: (data: { bounty_window_id: string; prediction: string; confidence: number; symbol: string }) =>
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
};
