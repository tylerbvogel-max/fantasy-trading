import React, { createContext, useContext, useState, useEffect } from "react";
import { useAudioPlayer } from "expo-audio";
import { setAudioModeAsync } from "expo-audio";
import * as SecureStore from "expo-secure-store";

interface AudioContextValue {
  musicEnabled: boolean;
  toggleMusic: () => void;
}

const AudioContext = createContext<AudioContextValue>({
  musicEnabled: true,
  toggleMusic: () => {},
});

const MUSIC_KEY = "music_enabled";

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [prefLoaded, setPrefLoaded] = useState(false);
  const player = useAudioPlayer(require("../../assets/audio/theme-music.mp3"));

  // Load persisted preference
  useEffect(() => {
    SecureStore.getItemAsync(MUSIC_KEY).then((stored) => {
      if (stored === "false") setMusicEnabled(false);
      setPrefLoaded(true);
    });
  }, []);

  // Configure audio mode + looping
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "duckOthers",
    });
    player.loop = true;
  }, [player]);

  // Play/pause based on preference (only after preference is loaded)
  useEffect(() => {
    if (!prefLoaded) return;

    if (musicEnabled) {
      player.play();
    } else {
      player.pause();
    }
  }, [musicEnabled, prefLoaded, player]);

  const toggleMusic = () => {
    const next = !musicEnabled;
    setMusicEnabled(next);
    SecureStore.setItemAsync(MUSIC_KEY, String(next));
  };

  return (
    <AudioContext.Provider value={{ musicEnabled, toggleMusic }}>
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  return useContext(AudioContext);
}
