// Tab bar — matches the PlannPlate design language (Geist + ink/ink3 palette,
// hair2 hairline border, calm outline icons, active = ink with stroke 2, inactive = ink3 stroke 1.6).
import React from 'react';
import { Tabs } from 'expo-router';
import {
  CalendarHeart,
  BookOpen,
  Sparkles,
  ShoppingBasket,
  UserRound,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/lib/useColorScheme';
import { designTokens } from '@/lib/design-tokens';
import { androidTokens, t } from '@/lib/platform-tokens';

// Recipes is the app's home. `index` (Meal Plan) stays the route behind the
// `/(tabs)` path — plenty of flows navigate there to show a freshly-built plan
// — but the navigator boots on Recipes, and every auth/onboarding handoff
// routes to `/(tabs)/recipes` explicitly.
export const unstable_settings = {
  initialRouteName: 'recipes',
};

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  // Under Android edge-to-edge the tab bar draws behind the system nav bar,
  // whose reserved height varies per device (gesture / 3-button / OEM panel).
  // Pad by the live inset so labels always clear it. iOS keeps its fixed
  // values via t(), so this is Android-only.
  const insets = useSafeAreaInsets();

  // Active = ink (warm near-black), inactive = ink3 (muted tertiary) — matches every tab-bar
  // mockup in the design handoff (home.jsx / recipes.jsx / grocery.jsx / profile.jsx).
  const activeColor = isDark ? '#FFFFFF' : designTokens.colors.ink;
  const inactiveColor = isDark ? '#888888' : designTokens.colors.ink3;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // PERF: freeze a tab's subtree while it's off-screen. Without this,
        // every store update re-rendered all five tab screens even though four
        // of them aren't visible — the meal plan, grocery and explore screens
        // are large enough that this alone made tab switches feel heavy.
        // State is preserved; the screen simply stops re-rendering until focused.
        freezeOnBlur: true,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarStyle: {
          backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
          borderTopColor: isDark ? '#2a2a2a' : designTokens.colors.hair2,
          borderTopWidth: 1,
          height: t(85, androidTokens.tabBar.contentHeight + insets.bottom),
          paddingTop: t(10, androidTokens.tabBar.paddingTop),
          paddingBottom: t(26, insets.bottom + androidTokens.tabBar.paddingBottomBase),
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
        name="inspired"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, focused }) => (
            <Sparkles
              size={22}
              color={color}
              strokeWidth={focused ? 2 : 1.6}
            />
          ),
        }}
      />
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
