/**
 * API client for the Fantasy Trading backend.
 * All requests go through this module for consistent auth handling.
 */

import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

// Reads from app.json → expo.extra.apiUrl. Change there for prod.
const API_BASE: string =
  Constants.expoConfig?.extra?.apiUrl ?? "http://192.168.1.90:8000";

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
  active_seasons: SeasonSummary[];
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

// ── Seasons ──

export interface SeasonSummary {
  id: string;
  name: string;
  season_type: string;
  is_active: boolean;
  starting_cash: number;
  player_count: number;
  start_date: string;
  end_date: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  alias: string;
  total_value: number;
  percent_gain: number;
  holdings_count: number;
}

export const seasons = {
  list: () => request<SeasonSummary[]>("/seasons"),

  get: (id: string) => request<SeasonSummary>(`/seasons/${id}`),

  join: (id: string) =>
    request<{ player_season_id: string; message: string }>(
      `/seasons/${id}/join`,
      { method: "POST" }
    ),

  leaderboard: (id: string) =>
    request<LeaderboardEntry[]>(`/seasons/${id}/leaderboard`),
};

// ── Trading ──

export interface TradeRequest {
  season_id: string;
  stock_symbol: string;
  transaction_type: "BUY" | "SELL";
  shares: number;
}

export interface TradeResponse {
  transaction_id: string;
  stock_symbol: string;
  transaction_type: string;
  shares: number;
  price_per_share: number;
  total_amount: number;
  new_cash_balance: number;
  executed_at: string;
}

export interface TransactionHistory {
  id: string;
  stock_symbol: string;
  transaction_type: string;
  shares: number;
  price_per_share: number;
  total_amount: number;
  executed_at: string;
}

export interface TradeValidation {
  is_valid: boolean;
  stock_symbol: string;
  current_price: number;
  estimated_total: number;
  available_cash: number | null;
  available_shares: number | null;
  message: string;
}

export const trading = {
  execute: (data: TradeRequest) =>
    request<TradeResponse>("/trade", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  validate: (data: TradeRequest) =>
    request<TradeValidation>("/trade/validate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  history: (seasonId: string) =>
    request<TransactionHistory[]>(`/trade/history?season_id=${seasonId}`),
};

// ── Portfolio ──

export interface HoldingResponse {
  stock_symbol: string;
  stock_name: string;
  shares_owned: number;
  average_purchase_price: number;
  current_price: number;
  current_value: number;
  gain_loss: number;
  gain_loss_pct: number;
  weight_pct: number;
}

export interface PortfolioSummary {
  season_id: string;
  season_name: string;
  cash_balance: number;
  holdings_value: number;
  total_value: number;
  percent_gain: number;
  holdings: HoldingResponse[];
}

export const portfolio = {
  get: (seasonId: string) =>
    request<PortfolioSummary>(`/portfolio?season_id=${seasonId}`),

  history: (seasonId: string) =>
    request<{ date: string; total_value: number; percent_gain: number }[]>(
      `/portfolio/history?season_id=${seasonId}`
    ),
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
