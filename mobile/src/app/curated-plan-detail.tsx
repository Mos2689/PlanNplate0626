// Curated Plan Detail — the editorial deep-dive for a single curated plan.
//
// Architecture: opened as a regular stack-pushed card (presentation: 'card'
// in _layout.tsx) from the curated-meal-plan list modal. This replaces the
// stacked Modal-over-Modal confirmation pattern that previously lived
// inside curated-meal-plan.tsx — apply/conflict/success all happen here.
//
// Visual language matches the redesigned plan-meals screen + QuickActions
// hero so the whole "let the system pick" family reads as one product:
//   • Olive eyebrow caps
//   • Italic on exactly ONE word per screen (the last word of the plan name)
//   • Sage hero CTA with brandDeep shadow
//   • Scale-on-press + light haptics on every interactive
//   • elevation.card on cards
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
} from 'react-native';
import { DishImage } from '@/components/DishImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  UtensilsCrossed,
  Star,
} from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/lib/useColorScheme';
import { useMealPlanStore } from '@/lib/store';
import {
  CURATED_MEAL_PLANS,
  type CuratedMealPlan,
} from '@/lib/curated-meal-plans';
import { designTokens, elevation } from '@/lib/design-tokens';
import { PlanRatingPrompt } from '@/components/PlanRatingPrompt';
import { SocialProofRow } from '@/components/PnPSpecials';
import {
  countCookedFromPlan,
  deriveLivePlanStats,
  pickPersonalFit,
} from '@/lib/plan-stats';
import {
  StickyScreenHeader,
  useStickyHeaderScroll,
} from '@/components/StickyScreenHeader';

// ───────────────────────────────────────────────────────────────────────────────
// HELPERS
// ───────────────────────────────────────────────────────────────────────────────

// Split a title into "everything but last word" + "last word" so we can
// italicize only the last word (brand: one italic word per screen).
function splitForItalic(title: string): { head: string; tail: string } {
  const trimmed = title.trim();
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace === -1) return { head: '', tail: trimmed };
  return {
    head: trimmed.slice(0, lastSpace),
    tail: trimmed.slice(lastSpace + 1),
  };
}


// ───────────────────────────────────────────────────────────────────────────────
// SCREEN
// ───────────────────────────────────────────────────────────────────────────────

export default function CuratedPlanDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const addRecipe = useMealPlanStore((s) => s.addRecipe);
  const addMealToSlot = useMealPlanStore((s) => s.addMealToSlot);

  // ── Rating prompt — store reads + commit ──
  // The prompt only mounts once the user has actually cooked ≥2 meals
  // from THIS plan (joining cookingLogs ↔ mealSlots.curatedPlanId).
  // Once rated, the prompt is replaced by a small personal-rating
  // summary line so the user always sees that their voice landed.
  const mealPlanRatings = useMealPlanStore((s) => s.mealPlanRatings) || [];
  const cookingLogs = useMealPlanStore((s) => s.cookingLogs) || [];
  const mealSlots = useMealPlanStore((s) => s.mealSlots) || [];
  const preferences = useMealPlanStore((s) => s.preferences);
  const ratePlan = useMealPlanStore((s) => s.ratePlan);

  const plan = useMemo<CuratedMealPlan | undefined>(
    () => CURATED_MEAL_PLANS.find((p) => p.id === id),
    [id],
  );

  // Derived: how many of this plan's meals has the user cooked?
  // Drives the prompt-gate (≥2) and the prompt's headline copy.
  const cookedFromThisPlan = useMemo(
    () => (plan ? countCookedFromPlan(plan.id, cookingLogs, mealSlots) : 0),
    [plan, cookingLogs, mealSlots],
  );

  // Existing user rating for THIS plan (if any). Drives the
  // prompt-vs-personal-summary fork.
  const existingRating = useMemo(
    () => (plan ? mealPlanRatings.find((r) => r.planId === plan.id) : undefined),
    [plan, mealPlanRatings],
  );

  // This is the landing page: it only previews the plan. All planning
  // choices (duration, cooking style, start date) and the Apply action live
  // on the dedicated setup screen (curated-plan-setup.tsx).

  // ── Tokenized style helpers ──
  const surfaceBg = isDark ? '#1a1a1a' : '#FFFFFF';
  const cardBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const hair2 = isDark ? '#2a2a2a' : designTokens.colors.hair2;
  const inkPrimary = isDark ? '#fff' : designTokens.colors.ink;
  const inkSecondary = isDark ? '#888' : designTokens.colors.ink2;
  const inkTertiary = isDark ? '#666' : designTokens.colors.ink3;

  const eyebrowStyle = {
    fontFamily: designTokens.font.semibold,
    fontSize: 11,
    letterSpacing: 1.3,
    textTransform: 'uppercase' as const,
    color: designTokens.colors.olive,
  };

  // ── Derived ── (landing previews the plan's default base week)
  const durationDays = plan ? parseInt(plan.duration.split('-')[0], 10) : 0;
  const previewMeals = plan?.meals ?? [];

  // Stat card uses unique recipes (not total slots) + true average calories.
  const recipeCount = useMemo(
    () => new Set(previewMeals.map((m) => m.recipe.name)).size,
    [previewMeals],
  );
  const avgCalories = useMemo(() => {
    if (durationDays <= 0) return 0;
    const total = previewMeals.reduce((s, m) => s + (m.recipe.calories || 0), 0);
    return Math.round(total / durationDays);
  }, [previewMeals, durationDays]);
  const vibe = plan?.tags?.[0] ?? 'Balanced';

  // ── Navigate to the planning/setup screen ──
  const goToSetup = useCallback(() => {
    if (!plan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/curated-plan-setup?id=${plan.id}` as any);
  }, [plan, router]);

  // Sticky compact header scroll plumbing — must run before any conditional
  // returns below so React keeps hook order stable.
  const stickyScroll = useStickyHeaderScroll();

  // ── Early return: plan not found ──
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
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
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

  // ── Render ──
  const titleSplit = splitForItalic(plan.name);

  return (
    <View style={{ flex: 1, backgroundColor: surfaceBg }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <Animated.ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
          onScroll={stickyScroll.scrollHandler}
          scrollEventThrottle={16}
        >
          {/* Back button */}
          <Animated.View
            entering={FadeInDown.springify()}
            style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}
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

          {/* Full-bleed hero image */}
          <Animated.View entering={FadeInDown.delay(60).springify()}>
            <View
              style={{
                marginHorizontal: 16,
                borderRadius: 24,
                overflow: 'hidden',
                aspectRatio: 16 / 9,
                backgroundColor: '#F4F0E8',
                ...elevation.card,
                position: 'relative',
              }}
            >
              <DishImage
                url={plan.imageUrl}
                blurhash={plan.blurhash}
                width={1200}
                style={{ width: '100%', height: '100%' }}
              />

              {/* Editor's Pick chip — floats top-right on the hero
                  image, identical chrome to the PnPSpecials listing
                  cards so the badge feels like a continuous identity
                  signal as the user navigates listing → detail. */}
              {plan.editorsPick && (
                <View
                  style={{
                    position: 'absolute',
                    top: 14,
                    right: 14,
                    paddingHorizontal: 11,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: 'rgba(246,242,233,0.94)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    shadowColor: '#000',
                    shadowOpacity: 0.2,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 3,
                  }}
                >
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.olive,
                    }}
                  />
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 10,
                      letterSpacing: 1.15,
                      textTransform: 'uppercase',
                      color: designTokens.colors.olive,
                    }}
                  >
                    Editor's Pick
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Editorial title block */}
          <Animated.View
            entering={FadeInDown.delay(120).springify()}
            style={{ paddingHorizontal: 24, paddingTop: 22 }}
          >
            <Text style={[eyebrowStyle, { marginBottom: 10 }]}>
              CURATED PLAN · {durationDays} DAYS
            </Text>
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 28,
                color: inkPrimary,
                letterSpacing: -0.56,
              }}
            >
              {titleSplit.head ? `${titleSplit.head} ` : ''}
              <Text
                style={{
                  fontFamily: designTokens.font.serifItalic,
                  fontStyle: 'italic',
                  fontSize: 32,
                  letterSpacing: -0.32,
                }}
              >
                {titleSplit.tail}
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
              {plan.description}
            </Text>

            {/* Social-proof + personal-fit row — same renderer as
                the listing cards so the signals carry over verbatim
                from PnPSpecials → /curated-meal-plan → here. Gives
                the user a consistent "why this plan" cue at every
                surface of the funnel. */}
            <View style={{ marginTop: 14 }}>
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
            </View>
          </Animated.View>

          {/* Rating moment — sage card with star row + cook-again
              pills if the user has cooked ≥2 meals from this plan
              and hasn't yet rated. Once rated, a small personal
              summary line replaces it so the user always sees their
              voice was heard. */}
          {cookedFromThisPlan >= 2 && !existingRating && (
            <View style={{ marginTop: 18, paddingHorizontal: 8 }}>
              <PlanRatingPrompt
                planName={plan.name}
                cookedCount={cookedFromThisPlan}
                isDark={isDark}
                onSubmit={(stars, cookAgain) =>
                  ratePlan({
                    planId: plan.id,
                    stars,
                    cookAgain,
                    ratedAt: new Date().toISOString(),
                  })
                }
              />
            </View>
          )}

          {existingRating && (
            <Animated.View
              entering={FadeIn.duration(220)}
              style={{
                marginHorizontal: 24,
                marginTop: 18,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Star
                size={14}
                color={designTokens.colors.olive}
                fill={designTokens.colors.olive}
                strokeWidth={0}
              />
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 12.5,
                  color: inkSecondary,
                  letterSpacing: -0.05,
                }}
              >
                You rated this {existingRating.stars}/5
                {existingRating.cookAgain
                  ? ` · Will cook again: ${existingRating.cookAgain}`
                  : ''}
              </Text>
            </Animated.View>
          )}

          {/* Inset box — plan-document highlights (budget, servings, macros)
              when available; otherwise the generic stat grid. */}
          <Animated.View
            entering={FadeInDown.delay(180).springify()}
            style={{ paddingHorizontal: 24, marginTop: 20 }}
          >
            {plan.highlights && plan.highlights.length > 0 ? (
              <View
                style={{
                  padding: 16,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: cardBorder,
                  backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
                  gap: 10,
                }}
              >
                {plan.highlights.map((line, i) => (
                  <View
                    key={i}
                    style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}
                  >
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 999,
                        backgroundColor: designTokens.colors.olive,
                        marginTop: 7,
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 13.5,
                        color: inkSecondary,
                        lineHeight: 19,
                        letterSpacing: -0.1,
                        flex: 1,
                      }}
                    >
                      {line}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View
                style={{
                  flexDirection: 'row',
                  padding: 16,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: cardBorder,
                  backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
                }}
              >
                {[
                  { value: recipeCount, label: 'recipes' },
                  { value: durationDays, label: 'days' },
                  { value: avgCalories, label: 'cal/day' },
                  { value: vibe, label: 'vibe' },
                ].map((stat, i, arr) => (
                  <View
                    key={stat.label}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingHorizontal: 4,
                      borderRightWidth: i < arr.length - 1 ? 1 : 0,
                      borderRightColor: hair2,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: typeof stat.value === 'string' ? 14 : 22,
                        color: inkPrimary,
                        letterSpacing: -0.4,
                      }}
                      numberOfLines={1}
                    >
                      {stat.value}
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 11,
                        color: inkTertiary,
                        marginTop: 4,
                        letterSpacing: 0.2,
                      }}
                      numberOfLines={1}
                    >
                      {stat.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>

          {/* Tag chips */}
          {plan.tags.length > 0 && (
            <Animated.View
              entering={FadeInDown.delay(220).springify()}
              style={{
                paddingHorizontal: 24,
                marginTop: 14,
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              {plan.tags.map((t) => (
                <View
                  key={t}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: cardBorder,
                    backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 12,
                      color: inkSecondary,
                      letterSpacing: -0.05,
                    }}
                  >
                    {t}
                  </Text>
                </View>
              ))}
            </Animated.View>
          )}

          {/* What's inside + day-by-day browse intentionally omitted — the
              full schedule is previewed on the setup screen after the user
              picks duration + cooking style. */}
        </Animated.ScrollView>

        {/* Sticky bottom CTA */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 24,
            paddingTop: 14,
            paddingBottom: 28,
            backgroundColor: surfaceBg,
            borderTopWidth: 1,
            borderTopColor: hair2,
          }}
        >
          <Pressable onPress={goToSetup} style={{ width: '100%' }}>
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  paddingVertical: 18,
                  borderRadius: 999,
                  backgroundColor: designTokens.colors.brand,
                  shadowColor: designTokens.colors.brandDeep,
                  shadowOpacity: 0.22,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 4,
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                }}
              >
                <UtensilsCrossed
                  size={20}
                  color={designTokens.colors.cream}
                  strokeWidth={1.85}
                />
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 16,
                    color: designTokens.colors.cream,
                    letterSpacing: -0.25,
                  }}
                >
                  Plan &amp; apply
                </Text>
                <ChevronRight
                  size={18}
                  color={designTokens.colors.cream}
                  strokeWidth={1.9}
                />
              </View>
            )}
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Sticky compact header — fades in once the user scrolls past the
          editorial title block. Outside SafeAreaView so it can paint into
          the status-bar inset itself. */}
      <StickyScreenHeader
        scrollY={stickyScroll.scrollY}
        title={plan.name}
        onBack={() => router.back()}
      />
    </View>
  );
}
