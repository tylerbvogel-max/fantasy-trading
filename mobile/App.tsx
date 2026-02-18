import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
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
import { loadStoredToken, registerSignOutHandler } from './src/api/client';
import { WalkthroughProvider, useWalkthrough } from './src/contexts/WalkthroughContext';
import { AudioProvider } from './src/contexts/AudioContext';
import WalkthroughScreen from './src/screens/WalkthroughScreen';
import AuthScreen from './src/screens/AuthScreen';
import BountyHunterScreen from './src/screens/BountyHunterScreen';
import BountyBoardScreen from './src/screens/BountyBoardScreen';
import BountyStatsScreen from './src/screens/BountyStatsScreen';
import ProfileScreen from './src/screens/ProfileScreen';

const queryClient = new QueryClient();
const Tab = createBottomTabNavigator();

const tabIcons: Record<string, { focused: keyof typeof Ionicons.glyphMap; unfocused: keyof typeof Ionicons.glyphMap }> = {
  Bounty: { focused: 'skull', unfocused: 'skull-outline' },
  Stats: { focused: 'stats-chart', unfocused: 'stats-chart-outline' },
  Board: { focused: 'list', unfocused: 'list-outline' },
  Profile: { focused: 'person', unfocused: 'person-outline' },
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
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
      })}
    >
      <Tab.Screen name="Bounty" component={BountyHunterScreen} />
      <Tab.Screen name="Stats" component={BountyStatsScreen} />
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
    loadStoredToken().then((token) => {
      if (token) setIsAuthenticated(true);
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
            <StatusBar style="light" />
            <AppContent />
          </AudioProvider>
        </WalkthroughProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
