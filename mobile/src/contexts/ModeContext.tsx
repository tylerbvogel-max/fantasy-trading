import React, { createContext, useContext, useState, useEffect } from "react";
import * as SecureStore from "expo-secure-store";

export type AppMode = "classroom" | "league" | "arena" | "bountyHunter";

interface ModeContextValue {
  mode: AppMode | null;
  isLoading: boolean;
  setMode: (mode: AppMode) => void;
  clearMode: () => void;
}

const ModeContext = createContext<ModeContextValue>({
  mode: null,
  isLoading: true,
  setMode: () => {},
  clearMode: () => {},
});

const MODE_KEY = "app_mode";

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync(MODE_KEY).then((stored) => {
      if (stored) {
        // Migrate legacy key
        const mode = stored === "timeAttack" ? "bountyHunter" : stored;
        setModeState(mode as AppMode);
        if (stored !== mode) SecureStore.setItemAsync(MODE_KEY, mode);
      }
      setIsLoading(false);
    });
  }, []);

  const setMode = (newMode: AppMode) => {
    setModeState(newMode);
    SecureStore.setItemAsync(MODE_KEY, newMode);
  };

  const clearMode = () => {
    setModeState(null);
    SecureStore.deleteItemAsync(MODE_KEY);
  };

  return (
    <ModeContext.Provider value={{ mode, isLoading, setMode, clearMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  return useContext(ModeContext);
}
