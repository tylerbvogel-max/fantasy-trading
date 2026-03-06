import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Animated } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import {
  SpaceGrotesk_300Light,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { Colors } from './src/utils/theme';
import Constants from 'expo-constants';
import { loadStoredToken, persistToken, registerSignOutHandler } from './src/api/client';
import { WalkthroughProvider, useWalkthrough } from './src/contexts/WalkthroughContext';
import { AudioProvider } from './src/contexts/AudioContext';
import { CardThemeProvider } from './src/contexts/CardThemeContext';
import WalkthroughScreen from './src/screens/WalkthroughScreen';
import AuthScreen from './src/screens/AuthScreen';
import BountyHunterScreen from './src/screens/BountyHunterScreen';
import BountyBoardScreen from './src/screens/BountyBoardScreen';
import BountyStatsScreen from './src/screens/BountyStatsScreen';
import IronCollectionScreen from './src/screens/IronCollectionScreen';
import ProfileScreen from './src/screens/ProfileScreen';

const queryClient = new QueryClient();
const Tab = createBottomTabNavigator();

const tabIcons: Record<string, { focused: keyof typeof Ionicons.glyphMap; unfocused: keyof typeof Ionicons.glyphMap }> = {
  Stats: { focused: 'stats-chart', unfocused: 'stats-chart-outline' },
  Irons: { focused: 'hardware-chip', unfocused: 'hardware-chip-outline' },
  Bounty: { focused: 'skull', unfocused: 'skull-outline' },
  Board: { focused: 'list', unfocused: 'list-outline' },
  Profile: { focused: 'person', unfocused: 'person-outline' },
};

// Colors the Bounty tab cycles through
const CYCLE_COLORS = [
  Colors.orange,
  Colors.accent,
  Colors.primary,
  Colors.green,
  Colors.yellow,
];

function BountyTabIcon({ focused }: { focused: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: CYCLE_COLORS.length,
        duration: CYCLE_COLORS.length * 2000,
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const color = anim.interpolate({
    inputRange: CYCLE_COLORS.map((_, i) => i),
    outputRange: CYCLE_COLORS,
  });

  return (
    <Animated.View
      style={{
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: Colors.card,
        borderWidth: 2,
        borderColor: color,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        // Subtle glow via shadow
        shadowColor: Colors.orange,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: focused ? 0.6 : 0.3,
        shadowRadius: 8,
        elevation: 8,
      }}
    >
      <Animated.Text style={{ color }}>
        <Ionicons name={focused ? 'skull' : 'skull-outline'} size={28} />
      </Animated.Text>
    </Animated.View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          if (route.name === 'Bounty') {
            return <BountyTabIcon focused={focused} />;
          }
          const icons = tabIcons[route.name];
          const iconName = focused ? icons.focused : icons.unfocused;
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: Colors.orange,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.card,
          borderTopColor: Colors.border,
        },
        ...(route.name === 'Bounty' ? { tabBarLabel: () => null } : {}),
      })}
    >
      <Tab.Screen name="Stats" component={BountyStatsScreen} />
      <Tab.Screen name="Irons" component={IronCollectionScreen} />
      <Tab.Screen name="Bounty" component={BountyHunterScreen} />
      <Tab.Screen name="Board" component={BountyBoardScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { showWalkthrough, isLoading: walkthroughLoading } = useWalkthrough();

  useEffect(() => {
    registerSignOutHandler(() => setIsAuthenticated(false));
    loadStoredToken().then(async (token) => {
      if (token) {
        setIsAuthenticated(true);
        setIsLoading(false);
        return;
      }
      // Auto-login: fetch dev token from backend
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5000);
        const res = await fetch(
          (Constants.expoConfig?.extra?.apiUrl ?? "https://fantasy-trading-api.onrender.com") + "/auth/dev-token",
          { signal: controller.signal }
        );
        if (res.ok) {
          const data = await res.json();
          await persistToken(data.token);
          setIsAuthenticated(true);
        }
      } catch (_) {
        // backend unreachable — fall through to auth screen
      }
      setIsLoading(false);
    });
  }, []);

  if (isLoading || walkthroughLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  if (showWalkthrough) {
    return <WalkthroughScreen />;
  }

  return (
    <NavigationContainer>
      <MainTabs />
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_300Light,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <WalkthroughProvider>
          <AudioProvider>
            <CardThemeProvider>
              <StatusBar style="light" />
              <AppContent />
            </CardThemeProvider>
          </AudioProvider>
        </WalkthroughProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
