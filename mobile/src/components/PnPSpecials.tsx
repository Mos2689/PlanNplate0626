// PnPSpecials — home-tab editorial section surfacing curated meal
// plans from the static catalog, now with three psychological signal
// tracks layered onto each card:
//
//   1. Authority — floating "EDITOR'S PICK" chip on the image (lead
//      cards only). Cream pill + olive tracked-caps type.
//   2. Social proof — star rating + cook count. The Airbnb / App
//      Store-grade primitive, with the user's own rating merging
//      live into the community number via deriveLivePlanStats.
//   3. Personal fit — "Fits your X" tail computed from the user's
//      saved preferences via pickPersonalFit. Each user sees a
//      different reason — the killer relevance hook.
//
// Card silhouette matches the catalog's standard plan card so the
// home preview reads as a faithful window into /curated-meal-plan.
//
// Brand rules preserved:
//   • One italic word per surface → "PnP *Specials*." in the header.
//   • Sage / olive accents only.
//   • FadeInDown stagger (80ms per index) so the section is its own
//     beat distinct from QuickActions above.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { DishImage } from '@/components/DishImage';
import { ChevronRight, Star } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { designTokens, elevation, getThemeColors } from '@/lib/design-tokens';
import type { CuratedMealPlan } from '@/lib/curated-meal-plans';
import type { CookingLog, MealSlot, UserPreferences, MealPlanRating } from '@/lib/store';
import { deriveLivePlanStats, pickPersonalFit, compactNumber } from '@/lib/plan-stats';

interface PnPSpecialsProps {
  plans: CuratedMealPlan[];
  // Live-stats inputs — passed in from the parent so the section
  // stays presentational (no store subscriptions of its own).
  mealPlanRatings: MealPlanRating[];
  cookingLogs: CookingLog[];
  mealSlots: MealSlot[];
  preferences: UserPreferences;
  onPlanPress?: (plan: CuratedMealPlan, index: number) => void;
  onSeeAllPress?: () => void;
  isDark?: boolean;
}

export function PnPSpecials({
  plans,
  mealPlanRatings,
  cookingLogs,
  mealSlots,
  preferences,
  onPlanPress,
  onSeeAllPress,
  isDark = false,
}: PnPSpecialsProps) {
  const colors = getThemeColors(isDark);

  if (!plans || plans.length === 0) return null;

  return (
    <View style={{ paddingBottom: 30, position: 'relative' }}>
      {/* Soft warm bleed behind the header. */}
      <LinearGradient
        colors={['rgba(228,109,70,0.06)', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.15, y: 1 }}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 280,
          height: 120,
        }}
        pointerEvents="none"
      />

      {/* Header — editorial-magazine signature carries the section's
          "specials" identity. */}
      <View
        style={{
          paddingHorizontal: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 16,
        }}
      >
        <View style={{ flex: 1, marginRight: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <View
              style={{
                width: 18,
                height: 1.5,
                backgroundColor: designTokens.colors.olive,
                borderRadius: 1,
              }}
            />
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 10.5,
                letterSpacing: 1.3,
                textTransform: 'uppercase',
                color: designTokens.colors.olive,
              }}
            >
              The Specials
            </Text>
          </View>
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 21,
              color: colors.ink,
              letterSpacing: -0.42,
            }}
          >
            PnP{' '}
            <Text
              style={{
                fontFamily: designTokens.font.serifItalic,
                fontStyle: 'italic',
                fontSize: 24,
                letterSpacing: -0.22,
              }}
            >
              Specials
            </Text>
            .
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 12.5,
              color: colors.ink3,
              marginTop: 3,
              lineHeight: 17,
            }}
          >
            Curated weeks, ready to drop into your plan.
          </Text>
        </View>
        {onSeeAllPress && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSeeAllPress();
            }}
            hitSlop={6}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 13,
                color: colors.ink2,
              }}
            >
              See all
            </Text>
            <ChevronRight size={14} color={designTokens.colors.ink2} strokeWidth={1.6} />
          </Pressable>
        )}
      </View>

      {/* Card stack */}
      <View style={{ paddingHorizontal: 16, gap: 14 }}>
        {plans.map((plan, index) => (
          <PnPSpecialCard
            key={plan.id}
            plan={plan}
            index={index}
            mealPlanRatings={mealPlanRatings}
            cookingLogs={cookingLogs}
            mealSlots={mealSlots}
            preferences={preferences}
            onPress={() => onPlanPress?.(plan, index)}
            isDark={isDark}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Per-plan card ─────────────────────────────────────────────────────────

interface PnPSpecialCardProps {
  plan: CuratedMealPlan;
  index: number;
  mealPlanRatings: MealPlanRating[];
  cookingLogs: CookingLog[];
  mealSlots: MealSlot[];
  preferences: UserPreferences;
  onPress: () => void;
  isDark: boolean;
}

function PnPSpecialCard({
  plan,
  index,
  mealPlanRatings,
  cookingLogs,
  mealSlots,
  preferences,
  onPress,
  isDark,
}: PnPSpecialCardProps) {
  const cardBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const inkPrimary = isDark ? '#fff' : designTokens.colors.ink;
  const inkSecondary = isDark ? '#aaa' : designTokens.colors.ink2;
  const inkTertiary = isDark ? '#888' : designTokens.colors.ink3;

  const days = parseInt(plan.duration.split('-')[0], 10);
  const headlineTag = (plan.tags[0] ?? 'Curated').toUpperCase();

  // Live-stats merge: seeded baseline + user's local rating/cook
  // activity. Always returns sensible defaults so the card can't crash.
  const stats = deriveLivePlanStats(plan, mealPlanRatings, cookingLogs, mealSlots);
  const personalFit = pickPersonalFit(plan, preferences);

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).springify()}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        accessibilityLabel={`${plan.name}, ${days}-day plan, ${plan.meals.length} recipes`}
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
            {/* Image — 16:9 hero. */}
            <View
              style={{
                width: '100%',
                aspectRatio: 16 / 9,
                backgroundColor: '#F4F0E8',
                position: 'relative',
              }}
            >
              <DishImage
                url={plan.imageUrl}
                blurhash={plan.blurhash}
                width={800}
                style={{ width: '100%', height: '100%' }}
              />

              {/* Editor's Pick chip — floats top-right on the image.
                  Restrained cream pill, olive tracked-caps type. Only
                  renders when the plan is explicitly flagged. */}
              {plan.editorsPick && (
                <View
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: 'rgba(246,242,233,0.94)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    shadowColor: '#000',
                    shadowOpacity: 0.18,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 2,
                  }}
                >
                  <View
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.olive,
                    }}
                  />
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 9.5,
                      letterSpacing: 1.1,
                      textTransform: 'uppercase',
                      color: designTokens.colors.olive,
                    }}
                  >
                    Editor's Pick
                  </Text>
                </View>
              )}
            </View>

            {/* Content section — matches the catalog's standard card
                spec: 16px padding, olive eyebrow caps, 17pt title,
                13pt description, social-proof + personal-fit meta. */}
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
                {headlineTag} · {days} DAYS
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

              {/* Social-proof + personal-fit meta row */}
              <SocialProofRow
                stats={stats}
                personalFit={personalFit}
                inkSecondary={inkSecondary}
                inkTertiary={inkTertiary}
              />
            </View>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── Shared social-proof row ─────────────────────────────────────────
// Renders `★ {avg} (you?) · {count} cooks · Fits your X`. Exported so
// the catalog screen can reuse the exact same renderer.

interface SocialProofRowProps {
  stats: ReturnType<typeof deriveLivePlanStats>;
  personalFit: string | null;
  inkSecondary: string;
  inkTertiary: string;
}

export function SocialProofRow({
  stats,
  personalFit,
  inkSecondary,
  inkTertiary,
}: SocialProofRowProps) {
  const hasRating = stats.rating.count > 0;
  if (!hasRating && stats.cookCount === 0 && !personalFit) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginTop: 12,
        gap: 6,
      }}
    >
      {/* Star + average rating */}
      {hasRating && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Star
            size={12}
            color={designTokens.colors.olive}
            fill={designTokens.colors.olive}
            strokeWidth={0}
          />
          <Text
            style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 12,
              color: inkSecondary,
              letterSpacing: -0.05,
            }}
          >
            {stats.rating.avg.toFixed(1)}
          </Text>
          {/* "(you)" pill if the user has personally rated */}
          {stats.userStars != null && (
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 10,
                color: designTokens.colors.olive,
                marginLeft: 2,
                letterSpacing: 0.1,
              }}
            >
              (you)
            </Text>
          )}
        </View>
      )}

      {/* Cook count */}
      {stats.cookCount > 0 && (
        <>
          {hasRating && <Dot inkTertiary={inkTertiary} />}
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 12,
              color: inkSecondary,
              letterSpacing: -0.05,
            }}
          >
            {compactNumber(stats.cookCount)} cooks
          </Text>
        </>
      )}

      {/* Personal fit tail */}
      {personalFit && (
        <>
          {(hasRating || stats.cookCount > 0) && <Dot inkTertiary={inkTertiary} />}
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 12,
              color: designTokens.colors.olive,
              letterSpacing: -0.05,
            }}
          >
            {personalFit}
          </Text>
        </>
      )}
    </View>
  );
}

function Dot({ inkTertiary }: { inkTertiary: string }) {
  return (
    <View
      style={{
        width: 2,
        height: 2,
        borderRadius: 999,
        backgroundColor: inkTertiary,
        opacity: 0.6,
      }}
    />
  );
}
