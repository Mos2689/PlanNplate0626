// Curated Meal Plans — list modal.
//
// Architecture: modal route ('presentation: modal' in _layout.tsx).
// Selecting a plan navigates to /curated-plan-detail?id=xxx (a card stack
// pushed on top of this modal), replacing the previous stacked-Modal-over-
// Modal confirmation + recipe-slider pattern. The detail page hosts the
// apply / conflict / success flow now.
//
// Visual language matches the redesigned plan-meals screen + QuickActions
// hero — olive eyebrow caps, italic on exactly ONE word per screen
// ("crafted"), sage CTA vocabulary, scale-on-press, designTokens everywhere
// (no more Nativewind divergence).
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DishImage } from '@/components/DishImage';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/lib/useColorScheme';
import { CURATED_MEAL_PLANS, type CuratedMealPlan } from '@/lib/curated-meal-plans';
import { designTokens, elevation } from '@/lib/design-tokens';
import { useMealPlanStore } from '@/lib/store';
import { deriveLivePlanStats, pickPersonalFit } from '@/lib/plan-stats';
import { SocialProofRow } from '@/components/PnPSpecials';
import {
  StickyScreenHeader,
  useStickyHeaderScroll,
} from '@/components/StickyScreenHeader';

// ───────────────────────────────────────────────────────────────────────────────
// SCREEN
// ───────────────────────────────────────────────────────────────────────────────

export default function CuratedMealPlanScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Store reads for the social-proof + personal-fit signals on each
  // card. Same data the home-tab section uses — kept in sync via the
  // shared deriveLivePlanStats / pickPersonalFit helpers.
  const mealPlanRatings = useMealPlanStore((s) => s.mealPlanRatings) || [];
  const cookingLogs = useMealPlanStore((s) => s.cookingLogs) || [];
  const mealSlots = useMealPlanStore((s) => s.mealSlots) || [];
  const preferences = useMealPlanStore((s) => s.preferences);

  const visiblePlans = CURATED_MEAL_PLANS;

  // ── Token-driven style helpers ──
  const surfaceBg = isDark ? '#1a1a1a' : '#FFFFFF';
  const cardBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const inkPrimary = isDark ? '#fff' : designTokens.colors.ink;
  const inkSecondary = isDark ? '#888' : designTokens.colors.ink2;
  const inkTertiary = isDark ? '#666' : designTokens.colors.ink3;

  const goToDetail = (plan: CuratedMealPlan) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/curated-plan-detail?id=${plan.id}` as any);
  };

  // Sticky compact header — fades in once the user scrolls past the
  // editorial title block at the top.
  const { scrollY, scrollHandler } = useStickyHeaderScroll();

  // Split out the featured (first) plan from the rest so we can render
  // it with hero treatment. If the filter has zero results we render the
  // empty state instead.
  const featured = visiblePlans[0];
  const rest = visiblePlans.slice(1);

  return (
    <View style={{ flex: 1, backgroundColor: surfaceBg }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <Animated.ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 36 }}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        >
          {/* ─── Index 0: Back button + editorial header ─── */}
          <View>
            <Animated.View
              entering={FadeInDown.springify()}
              style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 }}
            >
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
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(80).springify()}
              style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 18 }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 11,
                  letterSpacing: 1.3,
                  textTransform: 'uppercase',
                  color: designTokens.colors.olive,
                  marginBottom: 10,
                }}
              >
                CURATED · {CURATED_MEAL_PLANS.length} PLANS
              </Text>
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 28,
                  color: inkPrimary,
                  letterSpacing: -0.56,
                }}
              >
                Plans we've{' '}
                <Text
                  style={{
                    fontFamily: designTokens.font.serifItalic,
                    fontStyle: 'italic',
                    fontSize: 32,
                    letterSpacing: -0.32,
                  }}
                >
                  crafted
                </Text>
              </Text>
              <Text
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 14.5,
                  lineHeight: 22,
                  color: inkSecondary,
                  marginTop: 10,
                }}
              >
                Recipe-tested by our team, shaped to what you've already shared.
              </Text>
            </Animated.View>
          </View>

          {/* ─── Cards ─── */}
          <View style={{ paddingTop: 18 }}>
            {/* Featured hero card (first plan, 4:3 image, EDITOR'S PICK eyebrow) */}
            {featured && (
              <Animated.View
                key={`featured-${featured.id}`}
                entering={FadeInDown.delay(60).springify()}
                style={{ paddingHorizontal: 16, marginBottom: 16 }}
              >
                <Pressable
                  onPress={() => goToDetail(featured)}
                  style={{ width: '100%' }}
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        borderRadius: 24,
                        borderWidth: 1,
                        borderColor: cardBorder,
                        backgroundColor: cardBg,
                        overflow: 'hidden',
                        ...elevation.card,
                        transform: [{ scale: pressed ? 0.985 : 1 }],
                      }}
                    >
                      <View
                        style={{
                          width: '100%',
                          aspectRatio: 4 / 3,
                          backgroundColor: '#F4F0E8',
                        }}
                      >
                        <DishImage
                          url={featured.imageUrl}
                          blurhash={featured.blurhash}
                          width={1000}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </View>
                      <View style={{ padding: 18 }}>
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
                          EDITOR'S PICK · {parseInt(featured.duration.split('-')[0], 10)} DAYS
                        </Text>
                        <Text
                          style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 22,
                            color: inkPrimary,
                            letterSpacing: -0.4,
                          }}
                        >
                          {featured.name}
                        </Text>
                        <Text
                          style={{
                            fontFamily: designTokens.font.regular,
                            fontSize: 13.5,
                            lineHeight: 20,
                            color: inkSecondary,
                            marginTop: 8,
                          }}
                          numberOfLines={2}
                        >
                          {featured.description}
                        </Text>

                        {/* Tag chips */}
                        <View
                          style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            gap: 6,
                            marginTop: 14,
                          }}
                        >
                          {featured.tags.map((t) => (
                            <View
                              key={t}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: cardBorder,
                                backgroundColor: isDark
                                  ? '#181814'
                                  : designTokens.colors.cream,
                              }}
                            >
                              <Text
                                style={{
                                  fontFamily: designTokens.font.medium,
                                  fontSize: 11.5,
                                  color: inkSecondary,
                                  letterSpacing: -0.05,
                                }}
                              >
                                {t}
                              </Text>
                            </View>
                          ))}
                        </View>

                        {/* Meta line — social proof + personal fit
                            replaces the old "X recipes · cal/day"
                            stat dump. Same helpers as PnPSpecials so
                            the home tab and catalog stay in sync. */}
                        <SocialProofRow
                          stats={deriveLivePlanStats(
                            featured,
                            mealPlanRatings,
                            cookingLogs,
                            mealSlots,
                          )}
                          personalFit={pickPersonalFit(featured, preferences)}
                          inkSecondary={inkSecondary}
                          inkTertiary={inkTertiary}
                        />
                        <Text
                          style={{
                            fontFamily: designTokens.font.regular,
                            fontSize: 12,
                            color: inkTertiary,
                            marginTop: 8,
                            letterSpacing: -0.05,
                          }}
                        >
                          {featured.meals.length} recipes · ~
                          {Math.round(
                            featured.totalCalories /
                              parseInt(featured.duration.split('-')[0], 10),
                          )}{' '}
                          cal/day
                        </Text>
                      </View>
                    </View>
                  )}
                </Pressable>
              </Animated.View>
            )}

            {/* Standard cards (image-on-top, content below) */}
            {rest.map((plan, idx) => {
              const days = parseInt(plan.duration.split('-')[0], 10);
              const avgCal = Math.round(plan.totalCalories / days);
              return (
                <Animated.View
                  key={plan.id}
                  entering={FadeInDown.delay(120 + idx * 60).springify()}
                  style={{ paddingHorizontal: 16, marginBottom: 14 }}
                >
                  <Pressable
                    onPress={() => goToDetail(plan)}
                    style={{ width: '100%' }}
                  >
                    {({ pressed }) => (
                      <View
                        style={{
                          borderRadius: 22,
                          borderWidth: 1,
                          borderColor: cardBorder,
                          backgroundColor: cardBg,
                          overflow: 'hidden',
                          ...elevation.card,
                          transform: [{ scale: pressed ? 0.985 : 1 }],
                        }}
                      >
                        <View
                          style={{
                            width: '100%',
                            aspectRatio: 16 / 9,
                            backgroundColor: '#F4F0E8',
                          }}
                        >
                          <DishImage
                            url={plan.imageUrl}
                            blurhash={plan.blurhash}
                            width={800}
                            style={{ width: '100%', height: '100%' }}
                          />
                        </View>
                        <View style={{ padding: 16 }}>
                          <Text
                            style={{
                              fontFamily: designTokens.font.semibold,
                              fontSize: 11,
                              letterSpacing: 1.3,
                              textTransform: 'uppercase',
                              color: designTokens.colors.olive,
                              marginBottom: 6,
                            }}
                          >
                            {(plan.tags[0] ?? 'Curated').toUpperCase()} · {days} DAYS
                          </Text>
                          <Text
                            style={{
                              fontFamily: designTokens.font.semibold,
                              fontSize: 17,
                              color: inkPrimary,
                              letterSpacing: -0.25,
                            }}
                            numberOfLines={1}
                          >
                            {plan.name}
                          </Text>
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
                            {plan.description}
                          </Text>

                          {/* Social-proof + personal-fit row drives
                              the main meta line; the recipes/calorie
                              detail moves below as fine-print. */}
                          <SocialProofRow
                            stats={deriveLivePlanStats(
                              plan,
                              mealPlanRatings,
                              cookingLogs,
                              mealSlots,
                            )}
                            personalFit={pickPersonalFit(plan, preferences)}
                            inkSecondary={inkSecondary}
                            inkTertiary={inkTertiary}
                          />
                          <Text
                            style={{
                              fontFamily: designTokens.font.regular,
                              fontSize: 11.5,
                              color: inkTertiary,
                              marginTop: 6,
                              letterSpacing: -0.05,
                            }}
                          >
                            {plan.meals.length} recipes · ~{avgCal} cal/day
                          </Text>
                        </View>
                      </View>
                    )}
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </Animated.ScrollView>
      </SafeAreaView>

      {/* Sticky compact header overlays the scroll view; fades in past the
          editorial title block. Outside SafeAreaView so it can paint into
          the status-bar inset itself. */}
      <StickyScreenHeader
        scrollY={scrollY}
        title="Plans we've crafted"
        onBack={() => router.back()}
      />
    </View>
  );
}
