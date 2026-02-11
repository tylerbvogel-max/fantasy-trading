import React, { createContext, useContext, useState, useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import { useMode } from "./ModeContext";

interface SeasonContextValue {
  selectedSeasonId: string | null;
  setSelectedSeasonId: (id: string) => void;
  clearSelectedSeason: () => void;
}

const SeasonContext = createContext<SeasonContextValue>({
  selectedSeasonId: null,
  setSelectedSeasonId: () => {},
  clearSelectedSeason: () => {},
});

const SEASON_KEY = "selected_season_id";

export function SeasonProvider({ children }: { children: React.ReactNode }) {
  const [selectedSeasonId, setSeasonState] = useState<string | null>(null);
  const { mode } = useMode();

  // Load persisted season on mount
  useEffect(() => {
    SecureStore.getItemAsync(SEASON_KEY).then((stored) => {
      if (stored) setSeasonState(stored);
    });
  }, []);

  // Clear selection when mode changes
  useEffect(() => {
    setSeasonState(null);
    SecureStore.deleteItemAsync(SEASON_KEY);
  }, [mode]);

  const setSelectedSeasonId = (id: string) => {
    setSeasonState(id);
    SecureStore.setItemAsync(SEASON_KEY, id);
  };

  const clearSelectedSeason = () => {
    setSeasonState(null);
    SecureStore.deleteItemAsync(SEASON_KEY);
  };

  return (
    <SeasonContext.Provider
      value={{ selectedSeasonId, setSelectedSeasonId, clearSelectedSeason }}
    >
      {children}
    </SeasonContext.Provider>
  );
}

export function useSeason() {
  return useContext(SeasonContext);
}
