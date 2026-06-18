// WeeklyRatingSheet — Sunday slow-down ritual.
// Full-pager layout: one recipe per page with hero image + Vibe Slider.
// Single gesture captures stars + cook-again intent (derived from position).
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ArrowRight, Utensils } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { designTokens, elevation, getThemeColors } from '@/lib/design-tokens';
import { PagerSheet, pressedStyle } from './PagerSheet';
import {
  VibeSlider,
  deriveCookAgain,
  type VibePosition,
} from './VibeSlider';
import type { Recipe, CookAgainIntent } from '@/lib/store';

export interface WeeklyRatingSheetProps {
  visible: boolean;
  recipes: Recipe[];
  cookedRecipeIds?: Set<string>;
  isDark?: boolean;
  onClose: () => void;
  onSubmit: (
    ratings: Array<{
      recipeId: string;
      stars: 1 | 2 | 3 | 4 | 5;
      cookAgain?: CookAgainIntent;
    }>,
  ) => void;
}

export function WeeklyRatingSheet({
  visible,
  recipes,
  cookedRecipeIds,
  isDark = false,
  onClose,
  onSubmit,
}: WeeklyRatingSheetProps) {
  const [drafts, setDrafts] = useState<Record<string, VibePosition>>({});
  const [pageIndex, setPageIndex] = useState(0);

  const total = recipes.length;
  const isLastDataPage = total > 0 && pageIndex === total - 1;
  const isCompletion = pageIndex === total; // synthetic last page

  const ratedCount = useMemo(() => Object.keys(drafts).length, [drafts]);

  const handleVibeChange = useCallback((recipeId: string, pos: VibePosition) => {
    setDrafts((prev) => ({ ...prev, [recipeId]: pos }));
  }, []);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPageIndex((i) => Math.min(i + 1, total));
  }, [total]);

  const handleSkip = useCallback(() => {
    Haptics.selectionAsync();
    setPageIndex((i) => Math.min(i + 1, total));
  }, [total]);

  const handleSubmit = useCallback(() => {
    const out = Object.entries(drafts).map(([recipeId, pos]) => ({
      recipeId,
      stars: pos as 1 | 2 | 3 | 4 | 5,
      cookAgain: deriveCookAgain(pos),
    }));
    if (out.length === 0) {
      onClose();
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSubmit(out);
    setDrafts({});
    setPageIndex(0);
  }, [drafts, onSubmit, onClose]);

  const handleClose = useCallback(() => {
    setDrafts({});
    setPageIndex(0);
    onClose();
  }, [onClose]);

  // ─────── Build pages ───────

  const pages = useMemo(
    () =>
      recipes.map((recipe) => (
        <RecipePage
          key={recipe.id}
          recipe={recipe}
          wasCooked={cookedRecipeIds?.has(recipe.id) ?? false}
          value={drafts[recipe.id] ?? null}
          onChange={(pos) => handleVibeChange(recipe.id, pos)}
        />
      )),
    [recipes, cookedRecipeIds, drafts, handleVibeChange],
  );

  const completionPage = (
    <CompletionPage
      title="That's the whole week."
      subtitle="Next plan will lean on these."
      ratedCount={ratedCount}
    />
  );

  // ─────── Footer (context-aware) ───────

  const footer = ({ index, isCompletion: comp }: { index: number; isCompletion: boolean }) => {
    if (comp) {
      return (
        <Pressable onPress={handleSubmit} style={{ width: '100%' }}>
          {({ pressed }) => (
            <View style={[styles.primaryBtn, pressed && styles.btnPressed]}>
              <Text style={styles.primaryBtnText}>
                {ratedCount > 0 ? `Save ${ratedCount}` : 'Done'}
              </Text>
            </View>
          )}
        </Pressable>
      );
    }

    const currentRecipe = recipes[index];
    const hasRated = !!currentRecipe && !!drafts[currentRecipe.id];
    const isLast = index === total - 1;

    return (
      <View style={styles.footerRow}>
        <Pressable onPress={handleSkip} hitSlop={8}>
          {({ pressed }) => (
            <View style={[styles.skipBtn, pressed && styles.btnPressed]}>
              <Text style={styles.skipText}>Skip</Text>
            </View>
          )}
        </Pressable>

        <Pressable onPress={handleNext} disabled={!hasRated}>
          {({ pressed }) => (
            <View
              style={[
                styles.nextBtn,
                !hasRated && styles.nextBtnDisabled,
                pressed && hasRated && styles.btnPressed,
              ]}
            >
              <Text
                style={[
                  styles.nextBtnText,
                  !hasRated && styles.nextBtnTextDisabled,
                ]}
              >
                {isLast ? 'Wrap up' : 'Next'}
              </Text>
              <ArrowRight
                size={16}
                color={hasRated ? '#fff' : designTokens.colors.ink3}
                strokeWidth={1.8}
              />
            </View>
          )}
        </Pressable>
      </View>
    );
  };

  // Empty state — no recipes to rate
  if (recipes.length === 0) {
    return (
      <PagerSheet
        visible={visible}
        header={{
          eyebrow: 'Sunday slow-down',
          // Brand rule: ONE italic word per screen.
          title: 'How was your *week*?',
          subtitle: 'Nothing to look back on this time. Catch you next Sunday.',
        }}
        pages={[<EmptyPage key="empty" />]}
        onClose={handleClose}
        isDark={isDark}
        footer={
          <Pressable onPress={handleClose} style={{ width: '100%' }}>
            {({ pressed }) => (
              <View style={[styles.primaryBtn, pressed && styles.btnPressed]}>
                <Text style={styles.primaryBtnText}>Close</Text>
              </View>
            )}
          </Pressable>
        }
      />
    );
  }

  return (
    <PagerSheet
      visible={visible}
      header={{
        eyebrow: 'Sunday slow-down',
        // Brand rule: ONE italic word per screen.
        title: 'Which meals *stuck*?',
        subtitle: 'Drag the slider to lock in a vibe. Skip what didn’t.',
      }}
      pages={pages}
      completion={completionPage}
      currentIndex={pageIndex}
      onIndexChange={setPageIndex}
      onClose={handleClose}
      isDark={isDark}
      footer={footer}
    />
  );
}

// ─────────── Per-recipe page ───────────

function RecipePage({
  recipe,
  wasCooked,
  value,
  onChange,
}: {
  recipe: Recipe;
  wasCooked: boolean;
  value: VibePosition | null;
  onChange: (pos: VibePosition) => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.page}>
      {/* Hero image */}
      <View style={[styles.hero, elevation.card]}>
        {recipe.imageUrl ? (
          <Image source={{ uri: recipe.imageUrl }} style={styles.heroImg} />
        ) : (
          <View style={[styles.heroImg, styles.heroFallback]}>
            <Utensils size={32} color={designTokens.colors.ink3} strokeWidth={1.4} />
          </View>
        )}
        {/* Subtle vignette overlay at bottom for legibility if title were over it */}
        <View pointerEvents="none" style={styles.heroShadow} />
      </View>

      {/* Eyebrow + name */}
      <View style={{ marginTop: 18 }}>
        <Text style={styles.recipeEyebrow}>
          {wasCooked ? 'You cooked this' : 'Was on the plan'}
        </Text>
        <Text style={styles.recipeName} numberOfLines={2}>
          {recipe.name}
        </Text>
      </View>

      {/* Vibe Slider */}
      <View style={{ marginTop: 22 }}>
        <VibeSlider value={value} onChange={onChange} />
      </View>
    </Animated.View>
  );
}

// ─────────── Completion page ───────────

function CompletionPage({
  title,
  subtitle,
  ratedCount,
}: {
  title: string;
  subtitle: string;
  ratedCount: number;
}) {
  return (
    <Animated.View entering={FadeIn.duration(280)} style={styles.completionPage}>
      <Text style={styles.completionTitle}>{title}</Text>
      <Text style={styles.completionSubtitle}>{subtitle}</Text>
      {ratedCount > 0 && (
        <Text style={styles.completionMeta}>
          {ratedCount} {ratedCount === 1 ? 'reflection' : 'reflections'} ready to save.
        </Text>
      )}
    </Animated.View>
  );
}

function EmptyPage() {
  return (
    <View style={styles.completionPage}>
      <Text style={styles.completionTitle}>Nothing to rate yet.</Text>
      <Text style={styles.completionSubtitle}>
        Cook a few meals this week, we’ll catch up next Sunday.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 24,
  },
  hero: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  heroImg: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#F4F0E8',
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroShadow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
    backgroundColor: 'transparent',
  },
  recipeEyebrow: {
    fontFamily: designTokens.font.semibold,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: designTokens.colors.olive,
  },
  recipeName: {
    fontFamily: designTokens.font.medium,
    fontSize: 24,
    letterSpacing: -0.35,
    color: designTokens.colors.ink,
    marginTop: 4,
    lineHeight: 28,
  },

  // Completion
  completionPage: {
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 24,
    alignItems: 'center',
  },
  completionTitle: {
    fontFamily: designTokens.font.medium,
    fontSize: 26,
    color: designTokens.colors.ink,
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 32,
  },
  completionSubtitle: {
    fontFamily: designTokens.font.regular,
    fontSize: 14,
    color: designTokens.colors.ink2,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 20,
  },
  completionMeta: {
    fontFamily: designTokens.font.medium,
    fontSize: 12.5,
    color: designTokens.colors.ink3,
    marginTop: 18,
    letterSpacing: 0.2,
  },

  // Footer
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  skipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  skipText: {
    fontFamily: designTokens.font.medium,
    fontSize: 14,
    color: designTokens.colors.ink2,
    letterSpacing: -0.14,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: designTokens.colors.olive,
    shadowColor: designTokens.colors.olive,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  nextBtnDisabled: {
    backgroundColor: '#EFEBE0',
    shadowOpacity: 0,
    elevation: 0,
  },
  nextBtnText: {
    fontFamily: designTokens.font.medium,
    fontSize: 15,
    color: '#fff',
    letterSpacing: -0.15,
    marginRight: 8,
  },
  nextBtnTextDisabled: {
    color: designTokens.colors.ink3,
  },
  primaryBtn: {
    backgroundColor: designTokens.colors.olive,
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: designTokens.colors.olive,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  primaryBtnText: {
    fontFamily: designTokens.font.medium,
    fontSize: 16,
    color: '#fff',
    letterSpacing: -0.16,
  },
  btnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
});
