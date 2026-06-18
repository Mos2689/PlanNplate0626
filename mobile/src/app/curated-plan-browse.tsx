// Curated Plan Browse — full-screen per-day recipe browser.
//
// This screen replaces the previous PlanRecipeBrowser bottom-sheet
// (which was opened as a <Modal> from inside /curated-plan-detail and
// suffered from a persistent iOS layering bug — the Modal rendered
// BEHIND the parent curated-meal-plan modal because we were three layers
// deep in the iOS view-controller hierarchy).
//
// Now it's a real Expo Router route pushed on top of /curated-plan-detail
// as a card. Same nav stack = correct layering. No Modal layer = no
// iOS modal-presentation quirks.
//
// Visual language stays identical to the previous sheet:
//   • Olive eyebrow caps
//   • Italic on the LAST word of the plan name (one italic word per screen)
//   • Solid sage / olive icon discs (no pastel tints)
//   • Hero recipe imagery (16:9) at the top of each recipe card
//   • elevation.card depth + hairline borders
//   • Animated dot indicator (4 → 18 px on the active page)
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { DishImage } from '@/components/DishImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StickyScreenHeader,
  useStickyHeaderScroll,
} from '@/components/StickyScreenHeader';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronLeft,
  Coffee,
  Sun,
  Moon,
  Apple,
  Clock,
  Flame,
} from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/lib/useColorScheme';
import {
  CURATED_MEAL_PLANS,
  getScheduledMeals,
  type CuratedMealPlan,
  type CuratedMeal,
} from '@/lib/curated-meal-plans';
import { type CookingPreferences } from '@/lib/high-protein-plan';
import { designTokens, elevation } from '@/lib/design-tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ───────────────────────────────────────────────────────────────────────────────
// HELPERS (lifted from the previous PlanRecipeBrowser component)
// ───────────────────────────────────────────────────────────────────────────────

const MEAL_TYPE_ICON: Record<string, any> = {
  breakfast: Coffee,
  lunch: Sun,
  snack: Apple,
  dinner: Moon,
};

const MEAL_TYPE_ORDER: Record<string, number> = {
  breakfast: 0,
  lunch: 1,
  snack: 2,
  dinner: 3,
};

function dayName(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

function lastWord(s: string): string {
  const t = s.trim();
  const i = t.lastIndexOf(' ');
  return i === -1 ? t : t.slice(i + 1);
}

// Parse a YYYY-MM-DD string (the format used by formatDateKey on the
// detail screen) into a Date. Falls back to "now" on bad input.
function parseDateKey(s: string | undefined): Date {
  if (!s) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return new Date();
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d;
}

// ───────────────────────────────────────────────────────────────────────────────
// DOT INDICATOR (lifted from PagerSheet — same Reanimated pattern)
// ───────────────────────────────────────────────────────────────────────────────

function Dot({
  index,
  scrollX,
}: {
  index: number;
  scrollX: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const input = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];
    const w = interpolate(scrollX.value, input, [4, 18, 4], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, input, [0.3, 1, 0.3], Extrapolation.CLAMP);
    return { width: w, opacity };
  });
  return (
    <Animated.View
      style={[
        {
          height: 4,
          borderRadius: 999,
          backgroundColor: designTokens.colors.olive,
        },
        style,
      ]}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SCREEN
// ───────────────────────────────────────────────────────────────────────────────

export default function CuratedPlanBrowseScreen() {
  const router = useRouter();
  const { id, start, duration, bfast, lunch, dinner, style, cookDays, recipesPerCookDay } =
    useLocalSearchParams<{
      id: string;
      start?: string;
      duration?: string;
      bfast?: string;
      lunch?: string;
      dinner?: string;
      style?: string;
      cookDays?: string;
      recipesPerCookDay?: string;
    }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const plan = useMemo<CuratedMealPlan | undefined>(
    () => CURATED_MEAL_PLANS.find((p) => p.id === id),
    [id],
  );

  // The detail screen passes ?start=YYYY-MM-DD so day labels reflect the
  // user's chosen start date. Defaults to today if omitted.
  const startDate = useMemo(() => parseDateKey(start), [start]);

  // The detail screen also passes the chosen Duration + cooking-style so the
  // browser shows exactly the schedule the user configured. Falls back to the
  // plan's own length / neutral prefs when the params are absent.
  const cookPrefs = useMemo<CookingPreferences>(() => {
    const parsedCookDays = (cookDays ?? '')
      .split('-')
      .map((n) => parseInt(n, 10))
      .filter((n) => !Number.isNaN(n));
    const rpc = recipesPerCookDay ? parseInt(recipesPerCookDay, 10) : NaN;
    // Habit values pass through verbatim (skip/cook/grab for breakfast,
    // leftovers/cook/buy for lunch & dinner); fall back to a cooked default
    // if a param is missing.
    const breakfast = (['skip', 'cook', 'grab'].includes(bfast ?? '')
      ? bfast
      : 'cook') as CookingPreferences['breakfast'];
    const lunchPref = (['leftovers', 'cook', 'buy'].includes(lunch ?? '')
      ? lunch
      : 'cook') as CookingPreferences['lunch'];
    const dinnerPref = (['leftovers', 'cook', 'buy'].includes(dinner ?? '')
      ? dinner
      : 'cook') as CookingPreferences['dinner'];
    return {
      breakfast,
      lunch: lunchPref,
      dinner: dinnerPref,
      style: style === 'batch' ? 'batch' : 'daily',
      batch: {
        cookDays: parsedCookDays.length ? parsedCookDays : [0, 3],
        recipesPerCookDay: !Number.isNaN(rpc) ? rpc : 2,
      },
    };
  }, [bfast, lunch, dinner, style, cookDays, recipesPerCookDay]);
  const startWeekday = useMemo(() => startDate.getDay(), [startDate]);
  const durationDays = useMemo(() => {
    const fromParam = duration ? parseInt(duration, 10) : NaN;
    if (!Number.isNaN(fromParam) && fromParam > 0) return fromParam;
    return plan ? parseInt(plan.duration.split('-')[0], 10) : 0;
  }, [duration, plan]);

  // ── Tokenized style helpers ──
  const surfaceBg = isDark ? '#1a1a1a' : designTokens.colors.cream;
  const cardBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const inkPrimary = isDark ? '#fff' : designTokens.colors.ink;
  const inkSecondary = isDark ? '#999' : designTokens.colors.ink2;
  const inkTertiary = isDark ? '#666' : designTokens.colors.ink3;

  const scrollX = useSharedValue(0);
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollX.value = e.nativeEvent.contentOffset.x;
    },
    [scrollX],
  );

  // Sticky compact header — fades in when the currently visible per-day page
  // is scrolled. Shared scrollY is wired into every per-day ScrollView via
  // renderDay below, so swiping between days picks up wherever that day's
  // scroll left off.
  const sticky = useStickyHeaderScroll();

  // Group meals by dayOffset and sort meal types in standard order. Meals are
  // resolved for the chosen duration + cooking style so the browser mirrors
  // exactly what Apply will schedule.
  const mealsByDay = useMemo(() => {
    if (!plan) return [] as { day: number; meals: CuratedMeal[] }[];
    const scheduled = getScheduledMeals(plan, durationDays, cookPrefs, startWeekday);
    const groups: Record<number, CuratedMeal[]> = {};
    scheduled.forEach((m) => {
      if (!groups[m.dayOffset]) groups[m.dayOffset] = [];
      groups[m.dayOffset].push(m);
    });
    return Object.keys(groups)
      .map(Number)
      .sort((a, b) => a - b)
      .map((day) => ({
        day,
        meals: groups[day]
          .slice()
          .sort(
            (a, b) =>
              (MEAL_TYPE_ORDER[a.mealType] ?? 99) -
              (MEAL_TYPE_ORDER[b.mealType] ?? 99),
          ),
      }));
  }, [plan, durationDays, cookPrefs, startWeekday]);

  // ── Plan not found fallback ──
  if (!plan) {
    return (
      <View style={{ flex: 1, backgroundColor: surfaceBg }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={{ width: 40, height: 40 }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: cardBg,
                  borderWidth: 1,
                  borderColor: cardBorder,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChevronLeft size={22} color={inkPrimary} strokeWidth={1.9} />
              </View>
            </Pressable>
          </View>
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
            }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 17,
                color: inkSecondary,
                textAlign: 'center',
              }}
            >
              We couldn't find that plan.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Render a single day page ──
  const renderDay = ({ item }: { item: { day: number; meals: CuratedMeal[] } }) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + item.day);
    const totalCal = item.meals.reduce((s, m) => s + (m.recipe.calories || 0), 0);
    const totalMin = item.meals.reduce(
      (s, m) => s + (m.recipe.cookTime || 0) + (m.recipe.prepTime || 0),
      0,
    );

    return (
      <Animated.ScrollView
        style={{ width: SCREEN_WIDTH }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 6 }}
        onScroll={sticky.scrollHandler}
        scrollEventThrottle={16}
      >
        {/* Day eyebrow + stats */}
        <View style={{ paddingBottom: 16 }}>
          <Text
            style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 11,
              letterSpacing: 1.3,
              textTransform: 'uppercase',
              color: designTokens.colors.olive,
              marginBottom: 8,
            }}
          >
            DAY {item.day + 1} OF {durationDays} · {dayName(date).toUpperCase()}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              gap: 16,
              alignItems: 'center',
              marginTop: 2,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 22,
                  color: inkPrimary,
                  letterSpacing: -0.44,
                }}
              >
                {item.meals.length}
              </Text>
              <Text
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 12.5,
                  color: inkTertiary,
                }}
              >
                {item.meals.length === 1 ? 'recipe' : 'recipes'}
              </Text>
            </View>
            {totalCal > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Flame size={12} color={designTokens.colors.olive} strokeWidth={1.9} />
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 12.5,
                    color: inkSecondary,
                  }}
                >
                  {totalCal} cal
                </Text>
              </View>
            )}
            {totalMin > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Clock size={12} color={inkTertiary} strokeWidth={1.9} />
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 12.5,
                    color: inkSecondary,
                  }}
                >
                  {totalMin} min
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Recipe cards */}
        <View style={{ gap: 12 }}>
          {item.meals.map((m, idx) => {
            const Icon = MEAL_TYPE_ICON[m.mealType] ?? Coffee;
            const discColor =
              m.mealType === 'dinner'
                ? designTokens.colors.olive
                : designTokens.colors.brand;
            const totalRecipeMin = (m.recipe.cookTime || 0) + (m.recipe.prepTime || 0);

            // Placeholder slot (e.g. "Grab & go" / "Leftover …") — no fresh
            // recipe, so render a compact, image-less card that reads as a
            // reminder and never contributes to the grocery list.
            if (m.placeholderLabel) {
              return (
                <View
                  key={`${item.day}-${m.mealType}-${idx}`}
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: cardBorder,
                    backgroundColor: cardBg,
                    padding: 14,
                    ...elevation.card,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        backgroundColor: discColor,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon size={14} color="#F6F2E9" strokeWidth={1.9} />
                    </View>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 11,
                        letterSpacing: 1.1,
                        textTransform: 'uppercase',
                        color: inkTertiary,
                      }}
                    >
                      {m.mealType}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 16,
                      color: inkPrimary,
                      letterSpacing: -0.25,
                      marginTop: 10,
                    }}
                  >
                    {m.placeholderLabel}
                  </Text>
                  {m.recipe.description ? (
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 13,
                        lineHeight: 19,
                        color: inkSecondary,
                        marginTop: 6,
                      }}
                      numberOfLines={2}
                    >
                      {m.recipe.description}
                    </Text>
                  ) : null}
                </View>
              );
            }

            return (
              <View
                key={`${item.day}-${m.mealType}-${idx}`}
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: cardBorder,
                  backgroundColor: cardBg,
                  overflow: 'hidden',
                  ...elevation.card,
                }}
              >
                {/* Hero image */}
                <View
                  style={{
                    width: '100%',
                    aspectRatio: 16 / 9,
                    backgroundColor: '#F4F0E8',
                  }}
                >
                  {m.recipe.imageUrl ? (
                    <DishImage
                      url={m.recipe.imageUrl}
                      blurhash={m.recipe.blurhash}
                      width={800}
                      style={{ width: '100%', height: '100%' }}
                      transition={150}
                    />
                  ) : null}
                </View>

                {/* Content */}
                <View style={{ padding: 14 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        backgroundColor: discColor,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon size={14} color="#F6F2E9" strokeWidth={1.9} />
                    </View>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 11,
                        letterSpacing: 1.1,
                        textTransform: 'uppercase',
                        color: inkTertiary,
                      }}
                    >
                      {m.mealType}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 16,
                      color: inkPrimary,
                      letterSpacing: -0.25,
                      marginTop: 10,
                    }}
                    numberOfLines={2}
                  >
                    {m.recipe.name}
                  </Text>
                  {m.recipe.description ? (
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 13,
                        lineHeight: 19,
                        color: inkSecondary,
                        marginTop: 6,
                      }}
                      numberOfLines={2}
                    >
                      {m.recipe.description}
                    </Text>
                  ) : null}

                  {(totalRecipeMin > 0 || m.recipe.calories) && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        marginTop: 10,
                      }}
                    >
                      {totalRecipeMin > 0 && (
                        <View
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        >
                          <Clock size={12} color={inkTertiary} strokeWidth={1.9} />
                          <Text
                            style={{
                              fontFamily: designTokens.font.medium,
                              fontSize: 12,
                              color: inkSecondary,
                            }}
                          >
                            {totalRecipeMin} min
                          </Text>
                        </View>
                      )}
                      {m.recipe.calories ? (
                        <View
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        >
                          <Flame
                            size={12}
                            color={designTokens.colors.olive}
                            strokeWidth={1.9}
                          />
                          <Text
                            style={{
                              fontFamily: designTokens.font.medium,
                              fontSize: 12,
                              color: inkSecondary,
                            }}
                          >
                            {m.recipe.calories} cal
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </Animated.ScrollView>
    );
  };

  // Title parts so we can italicize the LAST word of the plan name
  const head = plan.name.trim().slice(0, plan.name.trim().lastIndexOf(' '));
  const tail = lastWord(plan.name);

  return (
    <View style={{ flex: 1, backgroundColor: surfaceBg }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Back button */}
        <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            hitSlop={10}
            style={{ width: 40, height: 40 }}
          >
            {({ pressed }) => (
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: cardBg,
                  borderWidth: 1,
                  borderColor: cardBorder,
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                }}
              >
                <ChevronLeft size={22} color={inkPrimary} strokeWidth={1.9} />
              </View>
            )}
          </Pressable>
        </View>

        {/* Editorial header */}
        <View style={{ paddingHorizontal: 24, paddingTop: 6, paddingBottom: 10 }}>
          <Text
            style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 11,
              letterSpacing: 1.3,
              textTransform: 'uppercase',
              color: designTokens.colors.olive,
              marginBottom: 8,
            }}
          >
            RECIPE BROWSER · {durationDays} DAYS
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 26,
              color: inkPrimary,
              letterSpacing: -0.52,
            }}
          >
            Inside{' '}
            {head ? `${head} ` : ''}
            <Text
              style={{
                fontFamily: designTokens.font.serifItalic,
                fontStyle: 'italic',
                fontSize: 30,
                letterSpacing: -0.3,
              }}
            >
              {tail}
            </Text>
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 13.5,
              color: inkSecondary,
              marginTop: 8,
            }}
          >
            Swipe between days to see what's planned.
          </Text>
        </View>

        {/* Dot indicator */}
        {mealsByDay.length > 1 && (
          <View
            style={{
              flexDirection: 'row',
              gap: 6,
              paddingHorizontal: 24,
              paddingTop: 4,
              paddingBottom: 12,
              alignItems: 'center',
            }}
          >
            {mealsByDay.map((_, i) => (
              <Dot key={i} index={i} scrollX={scrollX} />
            ))}
          </View>
        )}

        {/* Horizontal pager */}
        <FlatList
          data={mealsByDay}
          renderItem={renderDay}
          keyExtractor={(it) => `day-${it.day}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
          removeClippedSubviews={false}
        />
      </SafeAreaView>

      {/* Sticky compact header — fades in when the per-day ScrollView scrolls
          past the editorial title block. Sits outside the SafeAreaView so it
          can paint into the status-bar inset. */}
      <StickyScreenHeader
        scrollY={sticky.scrollY}
        title={plan.name}
        onBack={() => router.back()}
      />
    </View>
  );
}
