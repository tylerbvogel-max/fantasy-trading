import React, { createContext, useContext, useState, useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import { useMode } from "./ModeContext";

interface WalkthroughContextValue {
  showWalkthrough: boolean;
  isLoading: boolean;
  completeWalkthrough: () => void;
  resetWalkthrough: () => void;
}

const WalkthroughContext = createContext<WalkthroughContextValue>({
  showWalkthrough: false,
  isLoading: true,
  completeWalkthrough: () => {},
  resetWalkthrough: () => {},
});

function getStoreKey(mode: string): string {
  const normalized = mode === "arena" ? "league" : mode;
  return `walkthrough_seen_${normalized}`;
}

export function WalkthroughProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useMode();
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!mode) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    SecureStore.getItemAsync(getStoreKey(mode)).then((seen) => {
      setShowWalkthrough(!seen);
      setIsLoading(false);
    });
  }, [mode]);

  const completeWalkthrough = () => {
    if (!mode) return;
    setShowWalkthrough(false);
    SecureStore.setItemAsync(getStoreKey(mode), "true");
  };

  const resetWalkthrough = () => {
    if (!mode) return;
    SecureStore.deleteItemAsync(getStoreKey(mode));
    setShowWalkthrough(true);
  };

  return (
    <WalkthroughContext.Provider value={{ showWalkthrough, isLoading, completeWalkthrough, resetWalkthrough }}>
      {children}
    </WalkthroughContext.Provider>
  );
}

export function useWalkthrough() {
  return useContext(WalkthroughContext);
}
