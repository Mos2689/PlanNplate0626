// Tab bar — matches the PlannPlate design language (Geist + ink/ink3 palette,
// hair2 hairline border, calm outline icons, active = ink with stroke 2, inactive = ink3 stroke 1.6).
import React from 'react';
import { Tabs } from 'expo-router';
import {
  CalendarHeart,
  BookOpen,
  ShoppingBasket,
  UserRound,
} from 'lucide-react-native';
import { useColorScheme } from '@/lib/useColorScheme';
import { designTokens } from '@/lib/design-tokens';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Active = ink (warm near-black), inactive = ink3 (muted tertiary) — matches every tab-bar
  // mockup in the design handoff (home.jsx / recipes.jsx / grocery.jsx / profile.jsx).
  const activeColor = isDark ? '#FFFFFF' : designTokens.colors.ink;
  const inactiveColor = isDark ? '#888888' : designTokens.colors.ink3;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarStyle: {
          backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
          borderTopColor: isDark ? '#2a2a2a' : designTokens.colors.hair2,
          borderTopWidth: 1,
          height: 85,
          paddingTop: 10,
          paddingBottom: 26,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontFamily: designTokens.font.medium,
          fontSize: 10.5,
          letterSpacing: -0.05,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Meal Plan',
          tabBarIcon: ({ color, focused }) => (
            <CalendarHeart
              size={22}
              color={color}
              strokeWidth={focused ? 2 : 1.6}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: 'Recipes',
          tabBarIcon: ({ color, focused }) => (
            <BookOpen
              size={22}
              color={color}
              strokeWidth={focused ? 2 : 1.6}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="grocery"
        options={{
          title: 'Grocery',
          tabBarIcon: ({ color, focused }) => (
            <ShoppingBasket
              size={22}
              color={color}
              strokeWidth={focused ? 2 : 1.6}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="preferences"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <UserRound
              size={22}
              color={color}
              strokeWidth={focused ? 2 : 1.6}
            />
          ),
        }}
      />
    </Tabs>
  );
}
