import React, { createContext, useContext, useState, useEffect } from "react";
import * as SecureStore from "expo-secure-store";

const STORE_KEY = "walkthrough_seen_bountyHunter";

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

export function WalkthroughProvider({ children }: { children: React.ReactNode }) {
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync(STORE_KEY).then((seen) => {
      setShowWalkthrough(!seen);
      setIsLoading(false);
    });
  }, []);

  const completeWalkthrough = () => {
    setShowWalkthrough(false);
    SecureStore.setItemAsync(STORE_KEY, "true");
  };

  const resetWalkthrough = () => {
    SecureStore.deleteItemAsync(STORE_KEY);
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
