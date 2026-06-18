// CookConfirmSheet — daily ritual to look back at yesterday's meals.
// Full-pager layout: one meal per page with hero image and a primary
// "I cooked it" button. Secondary options (Skipped / Made something else)
// reveal sub-flows inline. Auto-advances on completion, ends on a celebration page.
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Check, ArrowRight, Utensils } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { designTokens, elevation } from '@/lib/design-tokens';
import { PagerSheet, pressedStyle } from './PagerSheet';
import type { MealSlot, Recipe, CookStatus, SkipReason } from '@/lib/store';

const MEAL_LABEL: Record<MealSlot['mealType'], string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const SKIP_REASONS: Array<{ value: SkipReason; label: string }> = [
  { value: 'no_time', label: 'Out of time' },
  { value: 'didnt_feel_like', label: 'Just not feeling it' },
  { value: 'missing_ingredients', label: 'Missing stuff' },
  { value: 'takeout', label: 'Got takeout' },
  { value: 'leftovers', label: 'Leftovers won' },
];

interface SlotEntry {
  slot: MealSlot;
  recipe: Recipe | null;
}

interface SlotLog {
  status: CookStatus;
  skipReason?: SkipReason;
  actualMealEaten?: string;
}

type PageMode = 'choose' | 'skipping' | 'swapping' | 'done';

export interface CookConfirmSheetProps {
  visible: boolean;
  dateLabel: string;
  entries: SlotEntry[];
  isDark?: boolean;
  onClose: () => void;
  onSubmit: (
    logs: Array<{
      slotId: string;
      recipeId: string | null;
      status: CookStatus;
      skipReason?: SkipReason;
      actualMealEaten?: string;
    }>,
  ) => void;
}

export function CookConfirmSheet({
  visible,
  dateLabel,
  entries,
  isDark = false,
  onClose,
  onSubmit,
}: CookConfirmSheetProps) {
  const orderedEntries = useMemo(() => {
    const order: MealSlot['mealType'][] = ['breakfast', 'lunch', 'dinner', 'snack'];
    return [...entries].sort(
      (a, b) => order.indexOf(a.slot.mealType) - order.indexOf(b.slot.mealType),
    );
  }, [entries]);

  const total = orderedEntries.length;
  const [logs, setLogs] = useState<Record<string, SlotLog>>({});
  const [modes, setModes] = useState<Record<string, PageMode>>({});
  const [pageIndex, setPageIndex] = useState(0);

  const isComplete = (l?: SlotLog) =>
    !!l && (l.status !== 'skipped' || !!l.skipReason);

  const loggedCount = orderedEntries.filter((e) => isComplete(logs[e.slot.id])).length;
  const allLogged = total > 0 && loggedCount === total;

  // ─────── Handlers ───────

  const advance = useCallback(() => {
    setPageIndex((i) => Math.min(i + 1, total));
  }, [total]);

  const setMode = (slotId: string, mode: PageMode) =>
    setModes((prev) => ({ ...prev, [slotId]: mode }));

  const handleCooked = (slotId: string, recipeId: string | null) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLogs((prev) => ({
      ...prev,
      [slotId]: { status: 'cooked' },
    }));
    setMode(slotId, 'done');
    setTimeout(advance, 320);
  };

  const handleStartSkip = (slotId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMode(slotId, 'skipping');
  };

  const handleStartSwap = (slotId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMode(slotId, 'swapping');
  };

  const handleSkipReason = (slotId: string, recipeId: string | null, reason: SkipReason) => {
    Haptics.selectionAsync();
    setLogs((prev) => ({
      ...prev,
      [slotId]: { status: 'skipped', skipReason: reason },
    }));
    setMode(slotId, 'done');
    setTimeout(advance, 320);
  };

  const handleSwapText = (slotId: string, text: string) =>
    setLogs((prev) => ({
      ...prev,
      [slotId]: {
        ...(prev[slotId] || { status: 'swapped' }),
        status: 'swapped',
        actualMealEaten: text,
      },
    }));

  const handleSwapConfirm = (slotId: string) => {
    Haptics.selectionAsync();
    setMode(slotId, 'done');
    // Ensure status is recorded even if user didn't type
    setLogs((prev) => ({
      ...prev,
      [slotId]: {
        status: 'swapped',
        actualMealEaten: prev[slotId]?.actualMealEaten ?? '',
      },
    }));
    setTimeout(advance, 320);
  };

  const handleSubmit = () => {
    const out = orderedEntries
      .filter((e) => isComplete(logs[e.slot.id]))
      .map((e) => ({
        slotId: e.slot.id,
        recipeId: e.slot.recipeId,
        status: logs[e.slot.id].status,
        skipReason: logs[e.slot.id].skipReason,
        actualMealEaten: logs[e.slot.id].actualMealEaten,
      }));
    if (out.length === 0) {
      handleClose();
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSubmit(out);
    setLogs({});
    setModes({});
    setPageIndex(0);
  };

  const handleClose = () => {
    setLogs({});
    setModes({});
    setPageIndex(0);
    onClose();
  };

  // ─────── Pages ───────

  const pages = useMemo(
    () =>
      orderedEntries.map((entry) => (
        <MealPage
          key={entry.slot.id}
          entry={entry}
          log={logs[entry.slot.id]}
          mode={modes[entry.slot.id] ?? 'choose'}
          onCooked={() => handleCooked(entry.slot.id, entry.slot.recipeId)}
          onStartSkip={() => handleStartSkip(entry.slot.id)}
          onStartSwap={() => handleStartSwap(entry.slot.id)}
          onSkipReason={(r) => handleSkipReason(entry.slot.id, entry.slot.recipeId, r)}
          onSwapText={(t) => handleSwapText(entry.slot.id, t)}
          onSwapConfirm={() => handleSwapConfirm(entry.slot.id)}
        />
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderedEntries, logs, modes],
  );

  const completionPage = (
    <CompletionPage
      title="That's the whole day."
      subtitle="Nice and honest — we’ll work that into tomorrow’s plan."
      loggedCount={loggedCount}
    />
  );

  // ─────── Footer ───────

  const footer = ({ isCompletion }: { isCompletion: boolean }) => {
    if (isCompletion) {
      return (
        <Pressable onPress={handleSubmit} style={{ width: '100%' }}>
          {({ pressed }) => (
            <View style={[styles.primaryBtn, pressed && styles.btnPressed]}>
              <Text style={styles.primaryBtnText}>
                {loggedCount > 0 ? `Save ${loggedCount}` : 'Done'}
              </Text>
            </View>
          )}
        </Pressable>
      );
    }

    return (
      <View style={styles.footerCenter}>
        <Text style={styles.footerHint}>Tap a choice above — we’ll move you along.</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 0 }}
    >
      <PagerSheet
        visible={visible}
        header={{
          eyebrow: `A look back · ${dateLabel}`,
          // Brand rule: ONE italic word per screen (the *kitchen* below).
          title: 'Yesterday in your *kitchen*.',
          subtitle: 'No judgment — just what really happened.',
        }}
        pages={pages}
        completion={completionPage}
        currentIndex={pageIndex}
        onIndexChange={setPageIndex}
        onClose={handleClose}
        isDark={isDark}
        footer={footer}
      />
    </KeyboardAvoidingView>
  );
}

// ─────────── Per-meal page ───────────

function MealPage({
  entry,
  log,
  mode,
  onCooked,
  onStartSkip,
  onStartSwap,
  onSkipReason,
  onSwapText,
  onSwapConfirm,
}: {
  entry: SlotEntry;
  log?: SlotLog;
  mode: PageMode;
  onCooked: () => void;
  onStartSkip: () => void;
  onStartSwap: () => void;
  onSkipReason: (r: SkipReason) => void;
  onSwapText: (t: string) => void;
  onSwapConfirm: () => void;
}) {
  const { slot, recipe } = entry;
  const isDone = mode === 'done';

  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.page}>
      {/* Hero image */}
      <View style={[styles.hero, elevation.card]}>
        {recipe?.imageUrl ? (
          <Image source={{ uri: recipe.imageUrl }} style={styles.heroImg} />
        ) : (
          <View style={[styles.heroImg, styles.heroFallback]}>
            <Utensils size={32} color={designTokens.colors.ink3} strokeWidth={1.4} />
          </View>
        )}
        {/* Success check overlay when done */}
        {isDone && (
          <Animated.View
            entering={FadeIn.duration(180)}
            style={styles.successOverlay}
          >
            <View style={styles.successBadge}>
              <Check size={20} color="#fff" strokeWidth={3} />
            </View>
          </Animated.View>
        )}
      </View>

      {/* Eyebrow + name */}
      <View style={{ marginTop: 18 }}>
        <Text style={styles.mealEyebrow}>
          {MEAL_LABEL[slot.mealType]} · was on the plan
        </Text>
        <Text style={styles.mealName} numberOfLines={2}>
          {recipe?.name ?? slot.customMealName ?? 'A planned meal'}
        </Text>
      </View>

      {/* Mode: choose */}
      {mode === 'choose' && (
        <View style={{ marginTop: 28, width: '100%' }}>
          {/* Primary CTA: olive pill — matches the app's "cooked" semantic
              (mealStatus.cooked = #E46D46 in design tokens).
              Uses children-as-function pattern so the visible button is a
              regular View — guaranteed to render its background + flexDirection. */}
          <Pressable onPress={onCooked} style={{ width: '100%' }}>
            {({ pressed }) => (
              <View style={[styles.primaryCooked, pressed && styles.btnPressed]}>
                <View style={styles.primaryCheckBadge}>
                  <Check size={14} color={designTokens.colors.olive} strokeWidth={3} />
                </View>
                <Text style={styles.primaryCookedText}>I cooked it</Text>
              </View>
            )}
          </Pressable>

          {/* Secondary: outlined white pills, side-by-side. Same pattern. */}
          <View style={styles.secondaryRow}>
            <Pressable
              onPress={onStartSkip}
              style={styles.secondaryPressable}
            >
              {({ pressed }) => (
                <View style={[styles.secondaryPill, pressed && styles.btnPressed]}>
                  <Text style={styles.secondaryPillText}>Wasn’t feeling it</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={onStartSwap}
              style={styles.secondaryPressable}
            >
              {({ pressed }) => (
                <View style={[styles.secondaryPill, pressed && styles.btnPressed]}>
                  <Text style={styles.secondaryPillText}>Made something else</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {/* Mode: skipping (reasons) */}
      {mode === 'skipping' && (
        <Animated.View entering={FadeIn.duration(220)} style={{ marginTop: 22 }}>
          <Text style={styles.subPrompt}>What got in the way?</Text>
          <View style={styles.chipsWrap}>
            {SKIP_REASONS.map((r, i) => (
              <Animated.View
                key={r.value}
                entering={FadeInDown.delay(i * 40).springify()}
              >
                <Pressable onPress={() => onSkipReason(r.value)}>
                  {({ pressed }) => (
                    <View style={[styles.chip, pressed && styles.btnPressed]}>
                      <Text style={styles.chipText}>{r.label}</Text>
                    </View>
                  )}
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </Animated.View>
      )}

      {/* Mode: swapping (text input) */}
      {mode === 'swapping' && (
        <Animated.View entering={FadeIn.duration(220)} style={{ marginTop: 22 }}>
          <Text style={styles.subPrompt}>What ended up on your plate?</Text>
          <TextInput
            placeholder="e.g. cheese toast & a beer"
            placeholderTextColor={designTokens.colors.ink3}
            value={log?.actualMealEaten ?? ''}
            onChangeText={onSwapText}
            returnKeyType="done"
            onSubmitEditing={onSwapConfirm}
            style={styles.swapInput}
            autoFocus
          />
          <Pressable
            onPress={onSwapConfirm}
            style={{ width: '100%' }}
          >
            {({ pressed }) => (
              <View style={[styles.swapConfirmBtn, pressed && styles.btnPressed]}>
                <Text style={styles.swapConfirmText}>Got it</Text>
                <ArrowRight size={15} color="#fff" strokeWidth={1.8} />
              </View>
            )}
          </Pressable>
        </Animated.View>
      )}

      {/* Mode: done (journal entry) */}
      {mode === 'done' && (
        <Animated.View
          entering={FadeIn.duration(280)}
          style={{ marginTop: 22, alignItems: 'center' }}
        >
          <Text style={styles.journalText}>"{journalSentence(log)}"</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

// ─────────── Completion ───────────

function CompletionPage({
  title,
  subtitle,
  loggedCount,
}: {
  title: string;
  subtitle: string;
  loggedCount: number;
}) {
  return (
    <Animated.View entering={FadeIn.duration(280)} style={styles.completionPage}>
      <Text style={styles.completionTitle}>{title}</Text>
      <Text style={styles.completionSubtitle}>{subtitle}</Text>
      {loggedCount > 0 && (
        <Text style={styles.completionMeta}>
          {loggedCount} {loggedCount === 1 ? 'meal' : 'meals'} ready to save.
        </Text>
      )}
    </Animated.View>
  );
}

// ─────────── helpers ───────────

function journalSentence(log?: SlotLog): string {
  if (!log) return '';
  if (log.status === 'cooked') return 'I cooked it.';
  if (log.status === 'skipped') {
    const reason = log.skipReason ? SKIP_REASONS.find((r) => r.value === log.skipReason)?.label.toLowerCase() : '';
    return reason ? `Skipped — ${reason}.` : 'Skipped it.';
  }
  const what = (log.actualMealEaten ?? '').trim();
  return what ? `Had ${what} instead.` : 'Had something else.';
}

// ─────────── styles ───────────

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
    position: 'relative',
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
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(228,109,70,0.18)', // olive tint — matches the "cooked" semantic
  },
  successBadge: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: designTokens.colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.thumb,
  },

  mealEyebrow: {
    fontFamily: designTokens.font.semibold,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: designTokens.colors.olive,
  },
  mealName: {
    fontFamily: designTokens.font.medium,
    fontSize: 24,
    letterSpacing: -0.35,
    color: designTokens.colors.ink,
    marginTop: 4,
    lineHeight: 28,
  },

  // Choose state — primary "I cooked it" CTA.
  // Olive is the brand's "cooked" semantic color (mealStatus.cooked = #E46D46).
  // Applied to a plain View (inside Pressable's children-as-function) so the
  // background and flexDirection always render — no Pressable style quirks.
  primaryCooked: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designTokens.colors.olive,
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 999,
    shadowColor: designTokens.colors.olive,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  primaryCheckBadge: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  primaryCookedText: {
    fontFamily: designTokens.font.medium,
    fontSize: 17,
    color: '#fff',
    letterSpacing: -0.17,
  },
  btnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  // Secondary actions — outlined cream pills, side by side
  secondaryRow: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 10,
  },
  secondaryPressable: {
    flex: 1,
  },
  secondaryPill: {
    width: '100%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: designTokens.colors.hair,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryPillText: {
    fontFamily: designTokens.font.medium,
    fontSize: 13,
    color: designTokens.colors.ink,
    letterSpacing: -0.13,
  },

  // Skip chips
  subPrompt: {
    fontFamily: designTokens.font.medium,
    fontSize: 15,
    color: designTokens.colors.ink2,
    marginBottom: 14,
    textAlign: 'center',
    letterSpacing: -0.15,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: designTokens.colors.hair,
    backgroundColor: '#fff',
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    fontFamily: designTokens.font.medium,
    fontSize: 12.5,
    color: designTokens.colors.ink,
    letterSpacing: -0.13,
  },

  // Swap input
  swapInput: {
    borderWidth: 1,
    borderColor: designTokens.colors.hair,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: designTokens.font.regular,
    fontSize: 14,
    color: designTokens.colors.ink,
    backgroundColor: '#fff',
  },
  swapConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: designTokens.colors.olive,
    shadowColor: designTokens.colors.olive,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  swapConfirmText: {
    fontFamily: designTokens.font.medium,
    fontSize: 14.5,
    color: '#fff',
    letterSpacing: -0.14,
    marginRight: 8,
  },

  // Done state — quoted journal entry (no italic per brand rule;
  // distinctness comes from color + quote marks + size)
  journalText: {
    fontFamily: designTokens.font.medium,
    fontSize: 18,
    color: designTokens.colors.brandDeep,
    lineHeight: 24,
    textAlign: 'center',
    letterSpacing: -0.18,
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
  footerCenter: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  footerHint: {
    fontFamily: designTokens.font.regular,
    fontSize: 12.5,
    color: designTokens.colors.ink3,
    letterSpacing: 0.1,
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
});
