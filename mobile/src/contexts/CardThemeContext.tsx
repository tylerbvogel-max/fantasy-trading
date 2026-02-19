import React, { createContext, useContext, useState, useEffect } from "react";
import * as SecureStore from "expo-secure-store";

interface CardThemeContextValue {
  lightCards: boolean;
  toggleLightCards: () => void;
  candleChart: boolean;
  toggleCandleChart: () => void;
}

const CardThemeContext = createContext<CardThemeContextValue>({
  lightCards: false,
  toggleLightCards: () => {},
  candleChart: false,
  toggleCandleChart: () => {},
});

const LIGHT_CARDS_KEY = "light_cards_enabled";
const CANDLE_CHART_KEY = "candle_chart_enabled";

export function CardThemeProvider({ children }: { children: React.ReactNode }) {
  const [lightCards, setLightCards] = useState(false);
  const [candleChart, setCandleChart] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(LIGHT_CARDS_KEY).then((stored) => {
      if (stored === "true") setLightCards(true);
    });
    SecureStore.getItemAsync(CANDLE_CHART_KEY).then((stored) => {
      if (stored === "true") setCandleChart(true);
    });
  }, []);

  const toggleLightCards = () => {
    const next = !lightCards;
    setLightCards(next);
    SecureStore.setItemAsync(LIGHT_CARDS_KEY, String(next));
  };

  const toggleCandleChart = () => {
    const next = !candleChart;
    setCandleChart(next);
    SecureStore.setItemAsync(CANDLE_CHART_KEY, String(next));
  };

  return (
    <CardThemeContext.Provider value={{ lightCards, toggleLightCards, candleChart, toggleCandleChart }}>
      {children}
    </CardThemeContext.Provider>
  );
}

export function useCardTheme() {
  return useContext(CardThemeContext);
}
