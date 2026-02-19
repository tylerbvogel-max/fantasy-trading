import React, { createContext, useContext, useState, useEffect } from "react";
import * as SecureStore from "expo-secure-store";

interface CardThemeContextValue {
  lightCards: boolean;
  toggleLightCards: () => void;
}

const CardThemeContext = createContext<CardThemeContextValue>({
  lightCards: false,
  toggleLightCards: () => {},
});

const LIGHT_CARDS_KEY = "light_cards_enabled";

export function CardThemeProvider({ children }: { children: React.ReactNode }) {
  const [lightCards, setLightCards] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(LIGHT_CARDS_KEY).then((stored) => {
      if (stored === "true") setLightCards(true);
    });
  }, []);

  const toggleLightCards = () => {
    const next = !lightCards;
    setLightCards(next);
    SecureStore.setItemAsync(LIGHT_CARDS_KEY, String(next));
  };

  return (
    <CardThemeContext.Provider value={{ lightCards, toggleLightCards }}>
      {children}
    </CardThemeContext.Provider>
  );
}

export function useCardTheme() {
  return useContext(CardThemeContext);
}
