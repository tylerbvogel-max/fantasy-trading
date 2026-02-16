import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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
import { ModeProvider, useMode } from './src/contexts/ModeContext';
import { SeasonProvider } from './src/contexts/SeasonContext';
import { WalkthroughProvider, useWalkthrough } from './src/contexts/WalkthroughContext';
import WalkthroughScreen from './src/screens/WalkthroughScreen';
import AuthScreen from './src/screens/AuthScreen';
import ModeSelectScreen from './src/screens/ModeSelectScreen';
import LeaderboardScreen from './src/screens/LeaderboardScreen';
import TradeScreen from './src/screens/TradeScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import StocksScreen from './src/screens/StocksScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import LearnScreen from './src/screens/LearnScreen';
import LessonScreen from './src/screens/LessonScreen';
import SeasonsScreen from './src/screens/SeasonsScreen';
import SeasonDetailScreen from './src/screens/SeasonDetailScreen';
import CreateSeasonScreen from './src/screens/CreateSeasonScreen';
import BountyHunterScreen from './src/screens/BountyHunterScreen';
import BountyBoardScreen from './src/screens/BountyBoardScreen';
import BountyStatsScreen from './src/screens/BountyStatsScreen';
import SwipeTestScreen from './src/screens/SwipeTestScreen';
import type { LearnStackParamList } from './src/screens/LearnScreen';
import type { SeasonsStackParamList } from './src/screens/SeasonsScreen';

const queryClient = new QueryClient();
const Tab = createBottomTabNavigator();
const LearnStack = createNativeStackNavigator<LearnStackParamList>();
const SeasonsStack = createNativeStackNavigator<SeasonsStackParamList>();

const tabIcons: Record<string, { focused: keyof typeof Ionicons.glyphMap; unfocused: keyof typeof Ionicons.glyphMap }> = {
  Home: { focused: 'trophy', unfocused: 'trophy-outline' },
  Seasons: { focused: 'calendar', unfocused: 'calendar-outline' },
  Trade: { focused: 'swap-horizontal', unfocused: 'swap-horizontal-outline' },
  Portfolio: { focused: 'briefcase', unfocused: 'briefcase-outline' },
  Learn: { focused: 'school', unfocused: 'school-outline' },
  Stocks: { focused: 'bar-chart', unfocused: 'bar-chart-outline' },
  Profile: { focused: 'person', unfocused: 'person-outline' },
  Bounty: { focused: 'skull', unfocused: 'skull-outline' },
  Stats: { focused: 'stats-chart', unfocused: 'stats-chart-outline' },
  Board: { focused: 'list', unfocused: 'list-outline' },
  Lab: { focused: 'flask', unfocused: 'flask-outline' },
};

function LearnStackNavigator() {
  return (
    <LearnStack.Navigator screenOptions={{ headerShown: false }}>
      <LearnStack.Screen name="LearnHome" component={LearnScreen} />
      <LearnStack.Screen name="Lesson" component={LessonScreen} />
    </LearnStack.Navigator>
  );
}

function SeasonsStackNavigator() {
  return (
    <SeasonsStack.Navigator screenOptions={{ headerShown: false }}>
      <SeasonsStack.Screen name="SeasonsHome" component={SeasonsScreen} />
      <SeasonsStack.Screen name="SeasonDetail" component={SeasonDetailScreen} />
      <SeasonsStack.Screen name="CreateSeason" component={CreateSeasonScreen} />
    </SeasonsStack.Navigator>
  );
}

function MainTabs() {
  const { mode } = useMode();

  const tintColor = mode === 'bountyHunter' ? Colors.orange : Colors.primary;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = tabIcons[route.name];
          const iconName = focused ? icons.focused : icons.unfocused;
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: tintColor,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.card,
          borderTopColor: Colors.border,
        },
      })}
    >
      {mode === 'bountyHunter' ? (
        <>
          <Tab.Screen name="Bounty" component={BountyHunterScreen} />
          <Tab.Screen name="Stats" component={BountyStatsScreen} />
          <Tab.Screen name="Board" component={BountyBoardScreen} />
          <Tab.Screen name="Lab" component={SwipeTestScreen} />
          <Tab.Screen name="Profile" component={ProfileScreen} />
        </>
      ) : (
        <>
          {mode === 'classroom' ? (
            <Tab.Screen name="Home" component={LeaderboardScreen} />
          ) : (
            <Tab.Screen name="Seasons" component={SeasonsStackNavigator} />
          )}
          <Tab.Screen name="Trade" component={TradeScreen} />
          <Tab.Screen name="Portfolio" component={PortfolioScreen} />
          {mode === 'classroom' && (
            <Tab.Screen name="Learn" component={LearnStackNavigator} />
          )}
          <Tab.Screen name="Stocks" component={StocksScreen} />
          <Tab.Screen name="Profile" component={ProfileScreen} />
        </>
      )}
    </Tab.Navigator>
  );
}

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { mode, isLoading: modeLoading } = useMode();
  const { showWalkthrough, isLoading: walkthroughLoading } = useWalkthrough();

  useEffect(() => {
    registerSignOutHandler(() => setIsAuthenticated(false));
    loadStoredToken().then((token) => {
      if (token) setIsAuthenticated(true);
      setIsLoading(false);
    });
  }, []);

  if (isLoading || modeLoading || walkthroughLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  if (!mode) {
    return <ModeSelectScreen />;
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
        <ModeProvider>
          <SeasonProvider>
            <WalkthroughProvider>
              <StatusBar style="light" />
              <AppContent />
            </WalkthroughProvider>
          </SeasonProvider>
        </ModeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
