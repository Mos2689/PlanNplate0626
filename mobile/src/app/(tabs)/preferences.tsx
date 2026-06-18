// ProfileScreen — PlannPlate Profile design (visual-only redesign).
// Every store read, callback, route, side-effect, and modal
// from the previous implementation is preserved exactly.
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Platform, Linking, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Pencil,
  UtensilsCrossed,
  Leaf,
  Timer,
  Fish,
  Crown,
  ChevronRight,
  LogOut,
  RefreshCw,
  CreditCard,
  ExternalLink,
  Flame,
  TrendingUp,
  ListChecks,
  Sparkles,
  Users,
  Clock,
  Globe,
  Target,
  Package,
  Calendar,
  ShoppingCart,
  Compass,
  Shield,
  FileText,
  User,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useMealPlanStore, servingSizeFromHousehold } from '@/lib/store';
import { useAuthStore } from '@/lib/auth-store';
import { useSubscriptionStore, useAccountStatus, useIsPremium, useUserAvatar } from '@/lib/subscription-store';
import { restorePurchases } from '@/lib/revenuecatClient';
import { useColorScheme } from '@/lib/useColorScheme';
import { cn } from '@/lib/cn';
import { designTokens, elevation, getThemeColors } from '@/lib/design-tokens';
import { AccountManagementModal } from '@/components/AccountManagementModal';
import { UserAvatarDisplay } from '@/components/ProfileSetupModal';
import { EditProfileModal } from '@/components/EditProfileModal';
import { useBehaviorInsights } from '@/hooks/useBehaviorInsights';
import {
  formatUsualDay,
  formatUsualHour,
  formatGapDays,
} from '@/lib/behavior-insights';

const PRIVACY_POLICY_URL = 'https://www.plannplate.com.au/privacy-policy';
const TERMS_OF_USE_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

// ── Helpers ───────────────────────────────────────────────────────────
function clamp<T>(arr: T[] | undefined | null, n: number): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, n);
}

function joinSummary(parts: (string | number | undefined | null | false)[], empty: string): string {
  const filtered = parts.filter((x): x is string | number => x !== undefined && x !== null && x !== false && String(x).trim().length > 0);
  return filtered.length > 0 ? filtered.join(' · ') : empty;
}

function timeSummary(mealPrepTime?: string): string {
  switch (mealPrepTime) {
    case 'quick':
      return 'Quick weeknights · under 30 min';
    case 'moderate':
      return 'Moderate · 30–60 min';
    case 'elaborate':
      return 'Elaborate · longer cooks ok';
    default:
      return 'Not set';
  }
}

// Concise household labels for the cooks-for card (shorter than the
// preference-options labels so the headline stays one line).
const HOUSEHOLD_LABELS: Record<string, string> = {
  solo: 'Solo',
  couple: 'Couple',
  family_kids: 'Family',
  roommates: 'Roommates',
};

function householdSummary(prefs: any): string {
  const household: string | undefined = prefs?.household;
  // Serving count drives the "cooking for N"; fall back to the household
  // default when servingSize is missing.
  const servings: number =
    prefs?.servingSize && prefs.servingSize > 0
      ? prefs.servingSize
      : servingSizeFromHousehold(household as any);

  // Preferred path — derive the household word from the `household` enum so
  // editing "Who are you cooking for?" reflects here.
  const label = household ? HOUSEHOLD_LABELS[household] : undefined;
  if (label) return `${label} · cooking for ${servings}`;

  // Fallback (no household set) — size-only wording, unchanged behavior.
  if (!servings || servings <= 0) return 'Not set';
  if (servings === 1) return 'Solo · cooking for 1';
  if (servings === 2) return 'Couple · cooking for 2';
  return `Cooking for ${servings}`;
}

function prepStyleItalic(mealPrepTime?: string): string {
  switch (mealPrepTime) {
    case 'quick': return 'quick weeknights';
    case 'moderate': return 'balanced cooking';
    case 'elaborate': return 'weekend cooking';
    default: return 'flexible cooking';
  }
}

// ── Stat card (design-language ThisWeek tile) ─────────────────────────
interface StatTileProps {
  icon: React.ReactNode;
  tint: string;
  value: string | number;
  unit: string;
  hint: string;
  isDark: boolean;
  index: number;
  onPress?: () => void;
}

function StatTile({ icon, tint, value, unit, hint, isDark, index, onPress }: StatTileProps) {
  const colors = getThemeColors(isDark);
  const content = (
    <Animated.View
      entering={FadeInUp.delay(150 + index * 40).springify()}
      style={{
        flex: 1,
        paddingHorizontal: 12,
        paddingTop: 14,
        paddingBottom: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.hair,
        backgroundColor: colors.bg,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 9,
          backgroundColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text
          style={{
            fontFamily: designTokens.font.medium,
            fontSize: 22,
            color: colors.ink,
            letterSpacing: -0.44,
            lineHeight: 22,
          }}
        >
          {value}
        </Text>
        <Text
          style={{
            fontFamily: designTokens.font.medium,
            fontSize: 11.5,
            color: colors.ink2,
            letterSpacing: -0.06,
          }}
          numberOfLines={1}
        >
          {unit}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: designTokens.font.regular,
          fontSize: 11.5,
          color: colors.ink3,
          marginTop: 4,
        }}
        numberOfLines={1}
      >
        {hint}
      </Text>
    </Animated.View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={{ flex: 1 }}>
        {content}
      </Pressable>
    );
  }
  return content;
}

// ── Preference list row ───────────────────────────────────────────────
interface PrefRowProps {
  icon: React.ReactNode;
  tint: string;
  title: string;
  summary: string;
  last?: boolean;
  onPress: () => void;
  isDark: boolean;
}

function PrefRow({ icon, tint, title, summary, last, onPress, isDark }: PrefRowProps) {
  const colors = getThemeColors(isDark);
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.hair2,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          backgroundColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: designTokens.font.medium,
            fontSize: 14.5,
            color: colors.ink,
            letterSpacing: -0.145,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontFamily: designTokens.font.regular,
            fontSize: 12.5,
            color: colors.ink3,
            marginTop: 1,
          }}
          numberOfLines={1}
        >
          {summary}
        </Text>
      </View>
      <ChevronRight size={16} color={designTokens.colors.ink3} strokeWidth={1.7} />
    </Pressable>
  );
}

// ── Settings row ──────────────────────────────────────────────────────
interface SettingsRowProps {
  icon: React.ReactNode;
  label: string;
  summary?: string;
  last?: boolean;
  onPress: () => void;
  isDark: boolean;
}

function SettingsRow({ icon, label, summary, last, onPress, isDark }: SettingsRowProps) {
  const colors = getThemeColors(isDark);
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.hair2,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          backgroundColor: colors.pill,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: designTokens.font.regular,
            fontSize: 14,
            color: colors.ink,
            letterSpacing: -0.07,
          }}
        >
          {label}
        </Text>
        {summary ? (
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 12,
              color: colors.ink3,
              marginTop: 1,
            }}
            numberOfLines={1}
          >
            {summary}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={14} color={designTokens.colors.ink3} strokeWidth={1.7} />
    </Pressable>
  );
}

// ── Cooking DNA chip (computed from existing cookingDNA memo) ─────────
function DNAChip({ label, isDark }: { label: string; isDark: boolean }) {
  const colors = getThemeColors(isDark);
  return (
    <View
      style={{
        paddingVertical: 6,
        paddingHorizontal: 11,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.hair,
        // Theme-aware so chips stay readable in dark mode — `cream`
        // (#FAF7F0) made white-on-cream tags invisible.
        backgroundColor: colors.surfaceMuted,
      }}
    >
      <Text
        style={{
          fontFamily: designTokens.font.medium,
          fontSize: 12,
          color: colors.ink,
          letterSpacing: -0.06,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = getThemeColors(isDark);
  const router = useRouter();

  // ── Refs (preserved) ───────────────────────────────────────────
  const mainScrollRef = useRef<ScrollView>(null);

  // ── Store reads (preserved) ────────────────────────────────────
  const preferences = useMealPlanStore((s) => s.preferences);
  const recipes = useMealPlanStore((s) => s.recipes);
  const mealSlots = useMealPlanStore((s) => s.mealSlots);
  const groceryItems = useMealPlanStore((s) => s.groceryItems);
  const savedGroceryLists = useMealPlanStore((s) => s.savedGroceryLists);
  const clearAllData = useMealPlanStore((s) => s.clearAllData);

  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);

  const accountStatus = useAccountStatus();
  const isPremium = useIsPremium();
  const userAvatar = useUserAvatar();
  const deleteAccount = useSubscriptionStore((s) => s.deleteAccount);
  const openPaywallSheet = useSubscriptionStore((s) => s.openPaywallSheet);
  const syncWithRevenueCat = useSubscriptionStore((s) => s.syncWithRevenueCat);
  const [isRestoring, setIsRestoring] = useState(false);

  // ── Local state (preserved) ────────────────────────────────────
  const [modalType, setModalType] = useState<'delete' | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);

  // Behavior intelligence (planning habit, cooking momentum, taste signals)
  const insights = useBehaviorInsights();

  // ── stats memo (preserved verbatim — same body, same deps) ─────
  const stats = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const mealsThisWeek = mealSlots.filter((slot) => {
      if (!slot.recipeId) return false;
      const slotDate = new Date(slot.date);
      return slotDate >= weekStart && slotDate <= weekEnd;
    }).length;

    const caloriesThisWeek = mealSlots.reduce((total, slot) => {
      if (!slot.recipeId) return total;
      const slotDate = new Date(slot.date);
      if (slotDate < weekStart || slotDate > weekEnd) return total;
      const recipe = recipes.find((r) => r.id === slot.recipeId);
      return total + (recipe?.calories || 0);
    }, 0);

    let weeklyStreak = 0;
    let checkDate = new Date(weekStart);
    const currentWeekHasMeals = mealSlots.some((slot) => {
      if (!slot.recipeId) return false;
      const slotDate = new Date(slot.date);
      return slotDate >= weekStart && slotDate <= weekEnd;
    });

    if (currentWeekHasMeals) {
      weeklyStreak = 1;
      checkDate.setDate(checkDate.getDate() - 7);
      while (true) {
        const prevWeekStart = new Date(checkDate);
        const prevWeekEnd = new Date(checkDate);
        prevWeekEnd.setDate(prevWeekStart.getDate() + 6);
        prevWeekEnd.setHours(23, 59, 59, 999);
        const weekHasMeals = mealSlots.some((slot) => {
          if (!slot.recipeId) return false;
          const slotDate = new Date(slot.date);
          return slotDate >= prevWeekStart && slotDate <= prevWeekEnd;
        });
        if (weekHasMeals) {
          weeklyStreak++;
          checkDate.setDate(checkDate.getDate() - 7);
        } else {
          break;
        }
        if (weeklyStreak > 52) break;
      }
    }

    const savedListsCount = groceryItems.length > 0 ? 1 : 0;

    return {
      weeklyStreak,
      mealsThisWeek,
      caloriesThisWeek,
      savedListsCount,
    };
  }, [mealSlots, recipes, groceryItems]);

  // ── cookingDNA memo (preserved verbatim) ───────────────────────
  const cookingDNA = useMemo(() => {
    const tags: Array<{ icon: React.ReactNode; label: string; variant?: 'default' | 'highlight' }> = [];

    if (preferences.dietaryRestrictions.includes('Vegetarian') || preferences.dietaryRestrictions.includes('Vegan')) {
      tags.push({
        icon: <Leaf size={16} color={isDark ? '#a6b594' : '#6a7d56'} />,
        label: 'Plant-Based',
      });
    }
    if (preferences.mealPrepTime === 'quick') {
      tags.push({
        icon: <Timer size={16} color="#f97316" />,
        label: 'Quick',
      });
    }
    if (
      preferences.dietaryRestrictions.includes('Vegetarian') === false &&
      preferences.allergies.includes('Fish') === false &&
      preferences.allergies.includes('Shellfish') === false
    ) {
      if (preferences.cuisinePreferences.includes('Japanese') || preferences.cuisinePreferences.includes('Mediterranean')) {
        tags.push({
          icon: <Fish size={16} color="#3b82f6" />,
          label: 'Pesca',
        });
      }
    }
    if (preferences.cookingSkillLevel === 'advanced') {
      tags.push({
        icon: <Crown size={16} color="#fff" />,
        label: "Chef's Mode",
        variant: 'highlight',
      });
    }
    if (tags.length === 0) {
      tags.push({
        icon: <UtensilsCrossed size={16} color={isDark ? '#a6b594' : '#6a7d56'} />,
        label: 'Home Cook',
      });
    }
    return tags;
  }, [preferences, isDark]);

  // ── totalMealsPlanned + userTitle (preserved verbatim) ─────────
  const totalMealsPlanned = useMemo(() => {
    return mealSlots.filter((slot) => slot.recipeId).length;
  }, [mealSlots]);

  const userTitle = useMemo(() => {
    if (preferences.profileSubtitle) {
      return preferences.profileSubtitle;
    }
    if (totalMealsPlanned > 100) return 'Professional Chef & Home Planner';
    if (totalMealsPlanned > 50) return 'Experienced Home Cook';
    if (totalMealsPlanned > 20) return 'Aspiring Chef';
    return 'Home Cook';
  }, [totalMealsPlanned, preferences.profileSubtitle]);

  // ── Callbacks (preserved verbatim) ─────────────────────────────
  const handleManageSubscription = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'ios') {
      Linking.openURL('https://apps.apple.com/account/subscriptions');
    } else if (Platform.OS === 'android') {
      Linking.openURL('https://play.google.com/store/account/subscriptions');
    }
  }, []);

  const handleLogout = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await logout();
    router.replace('/login');
  }, [logout, router]);

  const handleAccountAction = useCallback(async () => {
    if (!currentUser?.id) return;
    let success = false;
    if (modalType === 'delete') {
      success = await deleteAccount(currentUser.id);
      if (success) {
        clearAllData();
        await logout();
        router.replace('/login');
      }
    }
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalType(null);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [currentUser?.id, modalType, deleteAccount, clearAllData, logout, router]);

  // ── Derived display strings (purely visual) ────────────────────
  const firstName = currentUser?.name?.split(' ')[0] || currentUser?.name || 'User';
  const householdLine = householdSummary(preferences);
  const prefRowSummaries = {
    household: householdLine,
    time: timeSummary(preferences.mealPrepTime),
    diet: joinSummary(
      [
        ...clamp(preferences.dietaryRestrictions, 2),
        preferences.allergies.length > 0 ? `No ${clamp(preferences.allergies, 2).join(', ').toLowerCase()}` : null,
      ],
      'No restrictions set',
    ),
    cuisines:
      clamp(preferences.cuisinePreferences, 3).join(', ') || 'No favourites yet',
    goals: joinSummary(
      [
        ...clamp<string>(((preferences as any).goals || []) as string[], 2),
        ...clamp<string>(((preferences as any).priorities || []) as string[], 2),
      ],
      'Set your goals',
    ),
    pantry: (() => {
      const eqCount = ((preferences as any).equipment || []).length;
      const psCount = (preferences.pantryStaples || []).length;
      if (eqCount === 0 && psCount === 0) return 'Not set';
      const parts: string[] = [];
      if (eqCount > 0) parts.push(`${eqCount} equipment`);
      if (psCount > 0) parts.push(`${psCount} pantry staple${psCount === 1 ? '' : 's'}`);
      return parts.join(' · ');
    })(),
  };
  const totalCount = stats.weeklyStreak + stats.mealsThisWeek + stats.caloriesThisWeek;

  const openEditProfile = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowEditProfile(true);
  }, []);

  // Restore Purchases path that does NOT require seeing the paywall first.
  // A paid user who lands here as non-premium (reinstall, cleared data,
  // first launch on a new device) can recover entitlement directly.
  const handleRestore = useCallback(async () => {
    if (isRestoring) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRestoring(true);
    try {
      const result = await restorePurchases();
      if (result.ok) {
        if (currentUser?.id) {
          await syncWithRevenueCat(currentUser.id);
        }
        const restoredPremium = useSubscriptionStore.getState().isPremium;
        Alert.alert(
          restoredPremium ? 'Restored' : 'No purchases found',
          restoredPremium
            ? 'Your purchases have been restored.'
            : "We didn't find any purchases on this store account.",
        );
      } else {
        Alert.alert(
          'Restore Failed',
          'Unable to restore purchases. Please try again.',
        );
      }
    } finally {
      setIsRestoring(false);
    }
  }, [isRestoring, currentUser?.id, syncWithRevenueCat]);

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#1a1a1a' : colors.bg }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          ref={mainScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          {/* ── Profile header ──────────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.delay(50).springify()}
            style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 22 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {/* Avatar with optional premium badge */}
              <View style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
                <UserAvatarDisplay size={64} avatarUrl={userAvatar} name={currentUser?.name || 'User'} />
                {isPremium ? (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      openPaywallSheet('profile-banner');
                    }}
                    style={{
                      position: 'absolute',
                      right: -2,
                      bottom: 0,
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.olive,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2.5,
                      borderColor: colors.bg,
                    }}
                  >
                    <Crown size={11} color="#F4C76A" strokeWidth={2} />
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      openPaywallSheet('profile-banner');
                    }}
                    style={{
                      position: 'absolute',
                      right: -2,
                      bottom: 0,
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      backgroundColor: colors.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2.5,
                      borderColor: colors.bg,
                    }}
                  >
                    <Crown size={11} color={designTokens.colors.ink3} strokeWidth={2} />
                  </Pressable>
                )}
              </View>
              {/* Name + subtitle */}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontFamily: designTokens.font.serifItalic,
                    fontStyle: 'italic',
                    fontSize: 30,
                    color: colors.ink,
                    letterSpacing: -0.6,
                    lineHeight: 32,
                  }}
                  numberOfLines={1}
                >
                  {firstName}
                </Text>
                <View
                  style={{
                    marginTop: 4,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 13.5,
                      color: colors.ink2,
                    }}
                    numberOfLines={1}
                  >
                    {userTitle}
                  </Text>
                  <View
                    style={{
                      width: 2,
                      height: 2,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.ink3,
                    }}
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    {isPremium ? (
                      <>
                        <Crown size={11} color={designTokens.colors.olive} strokeWidth={2} />
                        <Text
                          style={{
                            fontFamily: designTokens.font.medium,
                            fontSize: 13.5,
                            color: designTokens.colors.olive,
                            letterSpacing: -0.065,
                          }}
                        >
                          Premium
                        </Text>
                      </>
                    ) : (
                      <Text
                        style={{
                          fontFamily: designTokens.font.regular,
                          fontSize: 13.5,
                          color: colors.ink3,
                        }}
                      >
                        Free
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </View>
            {/* Edit cooking profile button */}
            <Pressable
              onPress={openEditProfile}
              style={{
                marginTop: 16,
                width: '100%',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingHorizontal: 16,
                paddingVertical: 13,
                borderRadius: 14,
                backgroundColor: designTokens.colors.ink,
              }}
            >
              <Pencil size={15} color={designTokens.colors.cream} strokeWidth={1.8} />
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 14.5,
                  color: designTokens.colors.cream,
                  letterSpacing: -0.145,
                }}
              >
                Edit cooking profile
              </Text>
            </Pressable>
            {/* Restore Purchases — non-premium only. Gives a paid user who
                ended up locally non-premium (reinstall, switched device, etc.)
                a recovery path that doesn't require the paywall first. */}
            {!isPremium && (
              <Pressable
                onPress={handleRestore}
                disabled={isRestoring}
                style={{
                  marginTop: 10,
                  alignSelf: 'center',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  opacity: isRestoring ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 13,
                    color: colors.ink2,
                    letterSpacing: -0.13,
                    textDecorationLine: 'underline',
                  }}
                >
                  {isRestoring ? 'Restoring…' : 'Restore purchases'}
                </Text>
              </Pressable>
            )}
          </Animated.View>

          {/* ── Cooking profile card ────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.delay(100).springify()}
            style={{ paddingHorizontal: 16, paddingBottom: 22 }}
          >
            <View
              style={{
                borderRadius: 22,
                paddingHorizontal: 18,
                paddingTop: 18,
                paddingBottom: 16,
                backgroundColor: colors.bg,
                borderWidth: 1,
                borderColor: colors.hair,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 11,
                  letterSpacing: 1.1,
                  textTransform: 'uppercase',
                  color: designTokens.colors.brand,
                }}
              >
                PlannPlate cooks for
              </Text>
              <Text
                style={{
                  marginTop: 6,
                  fontFamily: designTokens.font.medium,
                  fontSize: 22,
                  color: colors.ink,
                  letterSpacing: -0.44,
                  lineHeight: 28,
                }}
              >
                {householdLine} · {prepStyleItalic(preferences.mealPrepTime)}
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  fontFamily: designTokens.font.regular,
                  fontSize: 13,
                  color: colors.ink2,
                }}
                numberOfLines={1}
              >
                {prefRowSummaries.diet}
              </Text>
              {/* Chip row — derived from cookingDNA memo (visual only) */}
              {cookingDNA.length > 0 && (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginTop: 14,
                  }}
                >
                  {cookingDNA.slice(0, 4).map((tag, idx) => (
                    <DNAChip key={idx} label={tag.label} isDark={isDark} />
                  ))}
                </View>
              )}
              {/* Adjust pill — opens EditProfileModal */}
              <Pressable
                onPress={openEditProfile}
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  // Theme-aware pill so the white "Adjust" label stays
                  // readable in dark mode (was static hair2 = #F4F2EB).
                  backgroundColor: colors.pill,
                }}
              >
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 12.5,
                    color: colors.ink,
                    letterSpacing: -0.0625,
                  }}
                >
                  Adjust
                </Text>
              </Pressable>
            </View>
          </Animated.View>

          {/* ── This week ──────────────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.delay(150).springify()}
            style={{ paddingHorizontal: 16, paddingBottom: 22 }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 12,
                paddingHorizontal: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 18,
                  color: colors.ink,
                  letterSpacing: -0.36,
                }}
              >
                This week
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <StatTile
                icon={<Calendar size={14} color={designTokens.colors.brand} strokeWidth={1.8} />}
                tint="#E8ECDF"
                value={stats.mealsThisWeek}
                unit={stats.mealsThisWeek === 1 ? 'planned' : 'planned'}
                hint="this week"
                isDark={isDark}
                index={0}
              />
              <StatTile
                icon={<Flame size={14} color={designTokens.colors.olive} strokeWidth={1.8} />}
                tint="#F2E0D9"
                value={stats.weeklyStreak}
                unit={stats.weeklyStreak === 1 ? 'wk streak' : 'wk streak'}
                hint="planning"
                isDark={isDark}
                index={1}
              />
              <StatTile
                icon={<TrendingUp size={14} color="#7A6A3A" strokeWidth={1.8} />}
                tint={designTokens.colors.cream}
                value={stats.caloriesThisWeek.toLocaleString()}
                unit="cal"
                hint="this week"
                isDark={isDark}
                index={2}
              />
            </View>
          </Animated.View>

          {/* ── Your rhythm — behavior intelligence ─────────────── */}
          {/*
            Three-card editorial section, intentionally distinct from the
            "This week" stat tiles above. Hero (full-width) = Planning
            Habit with a 7-day mini-calendar visualization where the mode
            day-of-week is filled olive — the signature moment. Row 2 =
            Momentum (progress bar + streak chip) + Taste Signals (ranked
            cuisine list + speed). All press feedback / haptics / sizing
            tuned to read as "patterns we've noticed", not generic stats.
          */}
          <Animated.View
            entering={FadeInDown.delay(180).springify()}
            style={{ paddingHorizontal: 16, paddingBottom: 24 }}
          >
            {/* Editorial section header — olive eyebrow + title */}
            <View style={{ paddingHorizontal: 4, marginBottom: 14 }}>
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 10.5,
                  letterSpacing: 1.3,
                  textTransform: 'uppercase',
                  color: designTokens.colors.olive,
                  marginBottom: 6,
                }}
              >
                PATTERNS WE'VE NOTICED
              </Text>
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 22,
                  color: colors.ink,
                  letterSpacing: -0.44,
                }}
              >
                Your rhythm
              </Text>
            </View>

            {/* ── HERO — Planning Habit with week visualization ── */}
            <View
              style={{
                borderRadius: 22,
                borderWidth: 1,
                borderColor: colors.hair,
                backgroundColor: colors.bg,
                paddingHorizontal: 18,
                paddingTop: 18,
                paddingBottom: 18,
                marginBottom: 10,
                ...elevation.card,
                overflow: 'hidden',
              }}
            >
              {/* Decorative top-left olive accent bar — subtle brand mark */}
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 36,
                  height: 3,
                  backgroundColor: designTokens.colors.olive,
                  borderBottomRightRadius: 3,
                }}
                pointerEvents="none"
              />

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Calendar size={11} color={designTokens.colors.olive} strokeWidth={2} />
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 10.5,
                      letterSpacing: 1.1,
                      textTransform: 'uppercase',
                      color: designTokens.colors.olive,
                    }}
                  >
                    Planning habit
                  </Text>
                </View>
                {insights.planningHabit.eventCount >= 1 &&
                  insights.planningHabit.lastPlanGapDays !== null && (
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 999,
                        // Theme-aware so the "N ago" pill doesn't show white
                        // text on a cream background in dark mode.
                        backgroundColor: colors.pill,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 10.5,
                          color: colors.ink2,
                          letterSpacing: -0.05,
                        }}
                      >
                        {formatGapDays(insights.planningHabit.lastPlanGapDays)} ago
                      </Text>
                    </View>
                  )}
              </View>

              {/* Last-7-days planning strip — oldest left, today right.
                  A pill fills olive when the user fired at least one PnP
                  Picks plan on that local calendar date. Today's pill also
                  carries a brand-coloured ring so the strip is anchored
                  in time even when today hasn't been planned yet. */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 18,
                  paddingHorizontal: 2,
                }}
              >
                {insights.planningHabit.last7Days.map((day) => {
                  const filled = day.planned;
                  // Today gets a ring even when not planned; once planned,
                  // the olive fill takes over and we drop the ring to avoid
                  // a busy double-stroke.
                  const showTodayRing = day.isToday && !filled;
                  return (
                    <View
                      key={day.dateKey}
                      style={{
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 999,
                          borderWidth: filled ? 0 : 1,
                          borderColor: showTodayRing
                            ? designTokens.colors.brand
                            : designTokens.colors.hair,
                          backgroundColor: filled
                            ? designTokens.colors.brand
                            : colors.bg,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 12,
                            color: filled
                              ? designTokens.colors.cream
                              : showTodayRing
                                ? designTokens.colors.brand
                                : designTokens.colors.ink3,
                            letterSpacing: 0.2,
                          }}
                        >
                          {day.dayLetter}
                        </Text>
                      </View>
                      {filled && (
                        <View
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: 999,
                            backgroundColor: designTokens.colors.olive,
                          }}
                        />
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Headline + sub */}
              {insights.planningHabit.eventCount >= 3 &&
              insights.planningHabit.usualDayOfWeek !== null ? (
                <>
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 20,
                      color: colors.ink,
                      letterSpacing: -0.4,
                    }}
                  >
                    {formatUsualDay(insights.planningHabit.usualDayOfWeek)}
                    {insights.planningHabit.usualHour !== null
                      ? ` · ${formatUsualHour(insights.planningHabit.usualHour)}`
                      : ''}
                  </Text>
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 12.5,
                      color: colors.ink3,
                      marginTop: 4,
                    }}
                  >
                    {insights.planningHabit.averageGapDays !== null
                      ? `${insights.planningHabit.eventCount} plans · avg ${Math.round(insights.planningHabit.averageGapDays)} days apart`
                      : `${insights.planningHabit.eventCount} plans so far`}
                  </Text>
                </>
              ) : (
                <>
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 16,
                      color: colors.ink,
                      letterSpacing: -0.2,
                    }}
                  >
                    Finding your rhythm…
                  </Text>
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 12.5,
                      color: colors.ink3,
                      marginTop: 4,
                    }}
                  >
                    {insights.planningHabit.eventCount === 0
                      ? 'Plan a few weeks and your pattern will appear here.'
                      : `${insights.planningHabit.eventCount} of 3 plans logged — keep going.`}
                  </Text>
                </>
              )}
            </View>

            {/* ── ROW 2 — Momentum (left) + Taste Signals (right) ── */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {/* ── Momentum card with progress bar ── */}
              <View
                style={{
                  flex: 1,
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: colors.hair,
                  backgroundColor: colors.bg,
                  padding: 16,
                  ...elevation.card,
                  justifyContent: 'space-between',
                }}
              >
                <View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 14,
                    }}
                  >
                    <Flame size={11} color={designTokens.colors.olive} strokeWidth={2} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 10.5,
                        letterSpacing: 1.1,
                        textTransform: 'uppercase',
                        color: designTokens.colors.olive,
                      }}
                    >
                      Momentum
                    </Text>
                  </View>

                  {insights.cooking.plannedThisWeek > 0 ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <Text
                          style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 36,
                            color: colors.ink,
                            letterSpacing: -0.72,
                            lineHeight: 38,
                          }}
                        >
                          {insights.cooking.cookedThisWeek}
                        </Text>
                        <Text
                          style={{
                            fontFamily: designTokens.font.medium,
                            fontSize: 16,
                            color: colors.ink3,
                            marginLeft: 4,
                          }}
                        >
                          / {insights.cooking.plannedThisWeek}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontFamily: designTokens.font.regular,
                          fontSize: 12,
                          color: colors.ink3,
                          marginTop: 2,
                        }}
                      >
                        cooked this week
                      </Text>

                      {/* Progress bar */}
                      <View
                        style={{
                          height: 5,
                          borderRadius: 999,
                          backgroundColor: designTokens.colors.hair,
                          overflow: 'hidden',
                          marginTop: 14,
                        }}
                      >
                        <View
                          style={{
                            height: '100%',
                            width: `${Math.min(
                              100,
                              Math.round(
                                (insights.cooking.cookedThisWeek /
                                  insights.cooking.plannedThisWeek) *
                                  100,
                              ),
                            )}%`,
                            borderRadius: 999,
                            backgroundColor: designTokens.colors.brand,
                          }}
                        />
                      </View>
                    </>
                  ) : (
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 13,
                        lineHeight: 18,
                        color: colors.ink2,
                      }}
                    >
                      No meals planned this week.
                    </Text>
                  )}
                </View>

                {/* Streak chip — cream pill with olive Flame */}
                {insights.cooking.currentStreakDays > 0 ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignSelf: 'flex-start',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: 'rgba(228, 109, 70, 0.10)',
                      marginTop: 14,
                    }}
                  >
                    <Flame size={11} color={designTokens.colors.olive} strokeWidth={2} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 11.5,
                        color: designTokens.colors.olive,
                        letterSpacing: -0.05,
                      }}
                    >
                      {insights.cooking.currentStreakDays}-day streak
                    </Text>
                  </View>
                ) : insights.cooking.plannedThisWeek > 0 ? (
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 11.5,
                      color: colors.ink3,
                      marginTop: 14,
                    }}
                  >
                    New week — let's start one.
                  </Text>
                ) : null}
              </View>

              {/* ── Taste Signals card with ranked cuisine list ── */}
              <View
                style={{
                  flex: 1,
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: colors.hair,
                  backgroundColor: colors.bg,
                  padding: 16,
                  ...elevation.card,
                  justifyContent: 'space-between',
                }}
              >
                <View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 14,
                    }}
                  >
                    <Target size={11} color={designTokens.colors.olive} strokeWidth={2} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 10.5,
                        letterSpacing: 1.1,
                        textTransform: 'uppercase',
                        color: designTokens.colors.olive,
                      }}
                    >
                      Taste
                    </Text>
                  </View>

                  {insights.taste.topCuisines.length > 0 ? (
                    <>
                      {/* Top cuisine — hero treatment */}
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 20,
                          color: colors.ink,
                          letterSpacing: -0.4,
                          lineHeight: 24,
                        }}
                        numberOfLines={1}
                      >
                        {insights.taste.topCuisines[0].name}
                      </Text>
                      <Text
                        style={{
                          fontFamily: designTokens.font.regular,
                          fontSize: 12,
                          color: colors.ink3,
                          marginTop: 2,
                        }}
                      >
                        {insights.taste.topCuisines[0].count}{' '}
                        {insights.taste.topCuisines[0].count === 1
                          ? 'dish'
                          : 'dishes'}
                      </Text>

                      {/* Runners-up — small ranked rows */}
                      {insights.taste.topCuisines.slice(1).length > 0 && (
                        <View style={{ marginTop: 12, gap: 6 }}>
                          {insights.taste.topCuisines.slice(1).map((c) => (
                            <View
                              key={c.name}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <Text
                                style={{
                                  fontFamily: designTokens.font.medium,
                                  fontSize: 12.5,
                                  color: colors.ink2,
                                  letterSpacing: -0.1,
                                  flex: 1,
                                }}
                                numberOfLines={1}
                              >
                                {c.name}
                              </Text>
                              <Text
                                style={{
                                  fontFamily: designTokens.font.regular,
                                  fontSize: 11.5,
                                  color: colors.ink3,
                                  marginLeft: 6,
                                }}
                              >
                                {c.count}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </>
                  ) : (
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 13,
                        lineHeight: 18,
                        color: colors.ink2,
                      }}
                    >
                      Cook a few more meals to see your taste.
                    </Text>
                  )}
                </View>

                {/* Speed preference footer */}
                {insights.taste.preferredSpeed && (
                  <View
                    style={{
                      marginTop: 14,
                      paddingTop: 12,
                      borderTopWidth: 1,
                      borderTopColor: colors.hair2,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Clock
                      size={11}
                      color={designTokens.colors.ink3}
                      strokeWidth={2}
                    />
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 11.5,
                        color: colors.ink2,
                        letterSpacing: -0.05,
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {insights.taste.preferredSpeed === 'quick'
                        ? 'Quick'
                        : insights.taste.preferredSpeed === 'moderate'
                          ? 'Moderate'
                          : insights.taste.preferredSpeed === 'elaborate'
                            ? 'Elaborate'
                            : 'Mixed'}
                      {insights.taste.avgPrepMinutes !== null
                        ? ` · ~${insights.taste.avgPrepMinutes} min`
                        : ''}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </Animated.View>

          {/* ── Shopping shortcut ──────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            style={{ paddingHorizontal: 16, paddingBottom: 22 }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 18,
                color: colors.ink,
                letterSpacing: -0.36,
                marginBottom: 12,
                paddingHorizontal: 4,
              }}
            >
              Shopping
            </Text>
            <View>
              <View
                style={{
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: colors.hair,
                  backgroundColor: colors.bg,
                    overflow: 'hidden',
                  }}
                >
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      router.push(`/(tabs)/grocery?showSavedLists=${Date.now()}`);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 11,
                        backgroundColor: '#E8ECDF',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <ShoppingCart size={16} color={designTokens.colors.brand} strokeWidth={1.8} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 14.5,
                          color: colors.ink,
                          letterSpacing: -0.145,
                        }}
                      >
                        {groceryItems.length} item{groceryItems.length === 1 ? '' : 's'} in current list
                      </Text>
                      <Text
                        style={{
                          fontFamily: designTokens.font.regular,
                          fontSize: 12.5,
                          color: colors.ink3,
                          marginTop: 1,
                        }}
                        numberOfLines={1}
                      >
                        From your meal plan ·{' '}
                        {groceryItems.filter((g) => g.isChecked).length} in basket
                      </Text>
                    </View>
                    <View
                      style={{
                        paddingHorizontal: 11,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: colors.pill,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 12,
                          color: colors.ink,
                          letterSpacing: -0.06,
                        }}
                      >
                        Continue
                      </Text>
                    </View>
                  </Pressable>
                  <View style={{ height: 1, backgroundColor: colors.hair2 }} />
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      router.push(`/(tabs)/grocery?showSavedLists=${Date.now()}`);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 11,
                        backgroundColor: colors.pill,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <ListChecks size={16} color={designTokens.colors.ink2} strokeWidth={1.7} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 14.5,
                          color: colors.ink,
                          letterSpacing: -0.145,
                        }}
                      >
                        Saved shopping lists
                      </Text>
                      <Text
                        style={{
                          fontFamily: designTokens.font.regular,
                          fontSize: 12.5,
                          color: colors.ink3,
                          marginTop: 1,
                        }}
                        numberOfLines={1}
                      >
                        {savedGroceryLists.length} list
                        {savedGroceryLists.length === 1 ? '' : 's'} saved
                      </Text>
                    </View>
                    <ChevronRight size={16} color={designTokens.colors.ink3} strokeWidth={1.7} />
                  </Pressable>
              </View>
            </View>
          </Animated.View>

          {/* ── Cooking preferences ────────────────────────────── */}
          {/*
            TEMPORARILY HIDDEN — user request. The block is preserved
            verbatim inside `false && ( ... )` so it stays untouched in
            source and is trivial to re-enable later by flipping the
            guard back to `true`. Behavior unchanged when flipped on.
          */}
          {false && (
            <Animated.View
              entering={FadeInDown.delay(250).springify()}
              style={{ paddingHorizontal: 16, paddingBottom: 22 }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 18,
                  color: colors.ink,
                  letterSpacing: -0.36,
                  marginBottom: 12,
                  paddingHorizontal: 4,
                }}
              >
                Cooking preferences
              </Text>
              <View
                style={{
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: colors.hair,
                  backgroundColor: colors.bg,
                  overflow: 'hidden',
                }}
              >
                <PrefRow
                  icon={<Users size={16} color={designTokens.colors.brand} strokeWidth={1.7} />}
                  tint="#E8ECDF"
                  title="Household"
                  summary={prefRowSummaries.household}
                  onPress={openEditProfile}
                  isDark={isDark}
                />
                <PrefRow
                  icon={<Clock size={16} color={designTokens.colors.olive} strokeWidth={1.7} />}
                  tint="#F2E0D9"
                  title="Time"
                  summary={prefRowSummaries.time}
                  onPress={openEditProfile}
                  isDark={isDark}
                />
                <PrefRow
                  icon={<Leaf size={16} color="#6E7250" strokeWidth={1.7} />}
                  tint="#EEEEE3"
                  title="Diet & allergies"
                  summary={prefRowSummaries.diet}
                  onPress={openEditProfile}
                  isDark={isDark}
                />
                <PrefRow
                  icon={<Globe size={16} color="#4B6A86" strokeWidth={1.7} />}
                  tint="#E1E8EE"
                  title="Cuisines"
                  summary={prefRowSummaries.cuisines}
                  onPress={openEditProfile}
                  isDark={isDark}
                />
                <PrefRow
                  icon={<Target size={16} color="#A77B3B" strokeWidth={1.7} />}
                  tint={designTokens.colors.cream}
                  title="Goals"
                  summary={prefRowSummaries.goals}
                  onPress={openEditProfile}
                  isDark={isDark}
                />
                <PrefRow
                  icon={<Package size={16} color="#7A6A3A" strokeWidth={1.7} />}
                  tint="#F4EBDB"
                  title="Pantry & equipment"
                  summary={prefRowSummaries.pantry}
                  onPress={openEditProfile}
                  isDark={isDark}
                  last
                />
              </View>
            </Animated.View>
          )}

          {/* ── Premium card (only when premium) ───────────────── */}
          {isPremium && (
            <Animated.View
              entering={FadeInDown.delay(300).springify()}
              style={{ paddingHorizontal: 16, paddingBottom: 22 }}
            >
              <View
                style={{
                  backgroundColor: designTokens.colors.brand,
                  borderRadius: 20,
                  paddingHorizontal: 16,
                  paddingTop: 16,
                  paddingBottom: 14,
                  overflow: 'hidden',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 11,
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.1)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Crown size={16} color={designTokens.colors.olive} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 11,
                        letterSpacing: 1.1,
                        textTransform: 'uppercase',
                        color: 'rgba(246,242,233,0.65)',
                      }}
                    >
                      PlannPlate Premium
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 15,
                        color: '#F6F2E9',
                        letterSpacing: -0.15,
                        marginTop: 2,
                      }}
                      numberOfLines={1}
                    >
                      AI planning & smart grocery active
                    </Text>
                  </View>
                  <Pressable
                    onPress={handleManageSubscription}
                    style={{
                      paddingHorizontal: 13,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor: '#F6F2E9',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 12.5,
                        color: designTokens.colors.brandDeep,
                        letterSpacing: -0.0625,
                      }}
                    >
                      Manage
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          )}

          {/* ── Settings ─────────────────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.delay(350).springify()}
            style={{ paddingHorizontal: 16, paddingBottom: 22 }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 18,
                color: colors.ink,
                letterSpacing: -0.36,
                marginBottom: 12,
                paddingHorizontal: 4,
              }}
            >
              Settings
            </Text>
            <View
              style={{
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.hair,
                backgroundColor: colors.bg,
                overflow: 'hidden',
              }}
            >
              <SettingsRow
                icon={<User size={14} color={designTokens.colors.ink2} strokeWidth={1.7} />}
                label="Account"
                summary={currentUser?.email || 'Not set'}
                onPress={openEditProfile}
                isDark={isDark}
              />
              <SettingsRow
                icon={<CreditCard size={14} color={designTokens.colors.ink2} strokeWidth={1.7} />}
                label="Manage subscription"
                onPress={handleManageSubscription}
                isDark={isDark}
              />

              <SettingsRow
                icon={<Shield size={14} color={designTokens.colors.ink2} strokeWidth={1.7} />}
                label="Privacy policy"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  Linking.openURL(PRIVACY_POLICY_URL).catch(() => {
                    Alert.alert('Error', 'Unable to open Privacy Policy.');
                  });
                }}
                isDark={isDark}
              />
              <SettingsRow
                icon={<FileText size={14} color={designTokens.colors.ink2} strokeWidth={1.7} />}
                label="Terms of use"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  Linking.openURL(TERMS_OF_USE_URL).catch(() => {
                    Alert.alert('Error', 'Unable to open Terms of Use.');
                  });
                }}
                isDark={isDark}
              />
              <SettingsRow
                icon={<LogOut size={14} color={designTokens.colors.ink2} strokeWidth={1.7} />}
                label="Sign out"
                onPress={handleLogout}
                isDark={isDark}
                last
              />
            </View>
          </Animated.View>

          {/* ── Fresh Start ─────────────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.delay(400).springify()}
            style={{ paddingHorizontal: 16, paddingBottom: 22 }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setModalType('delete');
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 14,
                paddingVertical: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.hair,
                backgroundColor: colors.bg,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  backgroundColor: 'rgba(228,109,70,0.10)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <RefreshCw size={14} color={designTokens.colors.olive} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 14,
                    color: colors.ink,
                    letterSpacing: -0.07,
                  }}
                >
                  Fresh Start
                </Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12,
                    color: colors.ink2,
                    marginTop: 1,
                  }}
                >
                  Reset recipes, plans, and preferences.
                </Text>
              </View>
              <ChevronRight size={14} color={designTokens.colors.ink3} strokeWidth={1.7} />
            </Pressable>
            <Text
              style={{
                textAlign: 'center',
                marginTop: 14,
                fontFamily: designTokens.font.regular,
                fontSize: 11,
                color: colors.ink3,
                letterSpacing: 0.22,
              }}
            >
              PlannPlate
            </Text>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      {/* Account Management Modal (preserved) */}
      <AccountManagementModal
        visible={modalType !== null}
        modalType={modalType}
        onClose={() => setModalType(null)}
        onConfirm={handleAccountAction}
        isPaused={false}
      />

      {/* Edit Profile Modal (preserved) */}
      <EditProfileModal
        visible={showEditProfile}
        onClose={() => setShowEditProfile(false)}
      />
    </View>
  );
}
