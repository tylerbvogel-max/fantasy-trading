// ── Historical Stock Data Fetcher ──
// Fetches 2 weeks of hourly OHLC data for top 25 stocks
// Falls back to synthetic Brownian motion data if live APIs unavailable

import https from 'https';
import http from 'http';

// Top 25 stocks by market cap / liquidity
const TOP_25_STOCKS = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'BRK.B', 'JNJ', 'V',
  'WMT', 'JPM', 'PG', 'MA', 'HD', 'DIS', 'NFLX', 'BAC', 'ASML', 'KO',
  'CSCO', 'CRM', 'ABT', 'TMO', 'XOM'
];

// Synthetic price generator using Brownian motion
function generateSyntheticHourly(symbol, startPrice = 100, volatility = 0.02, numCandles = 336) {
  // 336 = 2 weeks × 7 days × ~10 trading hours/day (approx)
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < numCandles; i++) {
    const randomWalk = (Math.random() - 0.5) * 2; // -1 to 1
    const change = price * volatility * randomWalk;
    
    const open = price;
    const close = Math.max(price * 0.95, price + change); // prevent going to zero
    const high = Math.max(open, close) * (1 + Math.abs(volatility * (Math.random() - 0.5)));
    const low = Math.min(open, close) * (1 - Math.abs(volatility * (Math.random() - 0.5)));
    const volume = Math.floor(1000000 + Math.random() * 4000000);

    candles.push({
      t: Math.floor(Date.now() / 1000) - ((numCandles - i - 1) * 3600), // hourly
      o: parseFloat(open.toFixed(2)),
      h: parseFloat(high.toFixed(2)),
      l: parseFloat(low.toFixed(2)),
      c: parseFloat(close.toFixed(2)),
      v: volume,
    });

    price = close;
  }

  return candles;
}

// Try to fetch from Finnhub (requires API key, falls back to synthetic)
async function fetchFinnhubData(symbol, apiKey = null) {
  if (!apiKey) return null; // Finnhub requires key

  return new Promise((resolve) => {
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=60&from=0&to=${Math.floor(Date.now()/1000)}&token=${apiKey}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.o && json.o.length > 0) {
            return resolve(json.o.map((_, i) => ({
              t: json.t[i],
              o: json.o[i],
              h: json.h[i],
              l: json.l[i],
              c: json.c[i],
              v: json.v ? json.v[i] : 1000000,
            })));
          }
        } catch (e) {}
        resolve(null);
      });
    }).on('error', () => resolve(null));
  });
}

// Fetch from Alpha Vantage (limited free tier, good fallback)
async function fetchAlphaVantageData(symbol, apiKey = null) {
  if (!apiKey) return null;

  return new Promise((resolve) => {
    const url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${symbol}&interval=60min&apikey=${apiKey}&outputsize=full`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          // Parse Alpha Vantage response format
          resolve(null); // TODO: parse if needed
        } catch (e) {}
        resolve(null);
      });
    }).on('error', () => resolve(null));
  });
}

// Main function: fetch or synthesize data for all stocks
export async function getHistoricalData(options = {}) {
  const {
    stocks = TOP_25_STOCKS,
    days = 14,
    hoursPerDay = 8, // trading hours (approximate)
    finnhubKey = process.env.FINNHUB_KEY || null,
    alphaVantageKey = process.env.ALPHA_VANTAGE_KEY || null,
    useSynthetic = true, // default to synthetic if APIs fail
  } = options;

  const numCandles = days * hoursPerDay;
  const data = {};

  console.log(`\n📊 Fetching historical hourly OHLC for ${stocks.length} stocks (${days} days)...`);

  for (const symbol of stocks) {
    // Try live APIs first
    let candles = null;

    if (finnhubKey) {
      candles = await fetchFinnhubData(symbol, finnhubKey);
      if (candles) {
        console.log(`✅ ${symbol} — Finnhub`);
        data[symbol] = candles;
        continue;
      }
    }

    if (alphaVantageKey) {
      candles = await fetchAlphaVantageData(symbol, alphaVantageKey);
      if (candles) {
        console.log(`✅ ${symbol} — AlphaVantage`);
        data[symbol] = candles;
        continue;
      }
    }

    // Fall back to synthetic
    if (useSynthetic) {
      candles = generateSyntheticHourly(symbol, 100 + Math.random() * 200, 0.02, numCandles);
      console.log(`🔄 ${symbol} — Synthetic (Brownian motion)`);
      data[symbol] = candles;
    }
  }

  console.log(`\n✨ Data ready: ${Object.keys(data).length}/${stocks.length} stocks\n`);
  return data;
}

// Helper: get price movement direction for a window
export function getPriceDirection(candles) {
  if (!candles || candles.length === 0) return null;
  const open = candles[0].o;
  const close = candles[candles.length - 1].c;
  if (close > open) return 'rise';
  if (close < open) return 'fall';
  return 'neutral';
}

// Helper: get candles for a time window
export function getCandlesInWindow(stockData, startIdx, endIdx) {
  return stockData.slice(startIdx, Math.min(endIdx + 1, stockData.length));
}

export default { getHistoricalData, getPriceDirection, getCandlesInWindow };
