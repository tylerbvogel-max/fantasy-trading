import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from './src/utils/theme';
import { loadStoredToken, registerSignOutHandler } from './src/api/client';
import AuthScreen from './src/screens/AuthScreen';
import LeaderboardScreen from './src/screens/LeaderboardScreen';
import TradeScreen from './src/screens/TradeScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import StocksScreen from './src/screens/StocksScreen';
import ProfileScreen from './src/screens/ProfileScreen';

const queryClient = new QueryClient();
const Tab = createBottomTabNavigator();

const tabIcons: Record<string, { focused: keyof typeof Ionicons.glyphMap; unfocused: keyof typeof Ionicons.glyphMap }> = {
  Home: { focused: 'trophy', unfocused: 'trophy-outline' },
  Trade: { focused: 'swap-horizontal', unfocused: 'swap-horizontal-outline' },
  Portfolio: { focused: 'briefcase', unfocused: 'briefcase-outline' },
  Stocks: { focused: 'bar-chart', unfocused: 'bar-chart-outline' },
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
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.card,
          borderTopColor: Colors.border,
        },
      })}
    >
      <Tab.Screen name="Home" component={LeaderboardScreen} />
      <Tab.Screen name="Trade" component={TradeScreen} />
      <Tab.Screen name="Portfolio" component={PortfolioScreen} />
      <Tab.Screen name="Stocks" component={StocksScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    registerSignOutHandler(() => setIsAuthenticated(false));
    loadStoredToken().then((token) => {
      if (token) setIsAuthenticated(true);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {isAuthenticated ? (
          <NavigationContainer>
            <MainTabs />
          </NavigationContainer>
        ) : (
          <AuthScreen onAuthenticated={() => setIsAuthenticated(true)} />
        )}
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
