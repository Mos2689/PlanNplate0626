// PlanTuneSheet — temporary, per-generation preference overrides for
// the Plan Meals screen.
//
// Mirrors every editable field in EditProfileModal but, crucially,
// commits NOTHING to the persisted profile. The screen owns the
// override state; this sheet manages a draft copy and only calls
// `onChange` when the user explicitly taps "Use for this plan".
// Backdrop / drag / X dismissals discard the draft.
//
// Design rules (matching the rest of PnP):
//   • One italic word per surface — "Tune for this *plan*."
//   • Olive eyebrow + serifItalic accent in the title
//   • Cards: 18 radius, cream surface, hair border
//   • Chips: sage for tastes / cooking, olive for safety overlays
//   • Section cards always visible (no collapse chrome) — premium
//     surfaces don't hide their controls behind disclosure triangles
//     for a sheet the user opened specifically to tune.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import {
  X,
  AlertTriangle,
  CirclePlus,
  CircleMinus,
  Check,
  RotateCcw,
  Apple,
  ChefHat,
  Microwave,
  Compass,
  Wallet,
  Home,
  Pencil,
  // Brand rule (per the plan-meals header comment): "No Sparkles." The
  // commit CTA uses Check — the same affirmation icon the screen
  // already uses on meal-type pills, so the visual language is
  // consistent and free of generic-AI iconography.
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { designTokens } from '@/lib/design-tokens';
import type { UserPreferences, Household, WeeknightMinutes } from '@/lib/store';
import {
  DIETARY_OPTIONS,
  CUISINE_OPTIONS,
  ALLERGY_OPTIONS,
  SKILL_LEVELS,
  PREP_TIME_OPTIONS,
  HOUSEHOLD_OPTIONS,
  EQUIPMENT_OPTIONS,
  MEAL_HABIT_OPTIONS,
  ADVENTURE_LEVELS,
  GOAL_OPTIONS,
  WEEKNIGHT_MINUTE_OPTIONS,
} from '@/lib/preference-options';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.88);

// Sentinel symbol returned by handlers when a field should be REMOVED
// from the overrides object (i.e. revert to saved baseline). Using a
// real value to distinguish "user explicitly set this back to its
// baseline" from "user never touched this field".
const CLEAR = Symbol('clear-override');

export interface PlanTuneSheetProps {
  visible: boolean;
  // The user's persisted saved preferences. Used as the baseline for
  // every field — the draft starts here, "Reset" snaps back to it,
  // and the diff that becomes `overrides` is computed against it.
  basePreferences: UserPreferences;
  // Currently committed overrides (Partial). Re-seeds the draft on
  // each open so the sheet always reflects what's actually in effect.
  overrides: Partial<UserPreferences>;
  oneTimeNote: string;
  // Single-shot commit. Called only when the user taps "Use for this
  // plan". Backdrop / X / drag-down dismissals do not trigger this.
  onChange: (overrides: Partial<UserPreferences>, oneTimeNote: string) => void;
  onClose: () => void;
  isDark?: boolean;
}

// ─── Style tokens ──────────────────────────────────────────────────────────
function useTuneStyles(isDark: boolean) {
  return {
    surface: isDark ? '#161616' : designTokens.colors.cream,
    cardBg: isDark ? '#1f1f1f' : '#FFFFFF',
    cardBorder: isDark ? '#2a2a2a' : designTokens.colors.hair,
    hair2: isDark ? '#2a2a2a' : designTokens.colors.hair2,
    ink: isDark ? '#fff' : designTokens.colors.ink,
    ink2: isDark ? '#aaa' : designTokens.colors.ink2,
    ink3: isDark ? '#888' : designTokens.colors.ink3,
  };
}

// ─── Helper: equality for override-vs-baseline detection ───────────────────
// JSON.stringify is good enough for the primitive / array / object
// shapes that UserPreferences holds (no Maps, no Dates, no funcs).
function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

// Compute the minimal-diff overrides object given the draft + baseline.
// Anything that matches baseline is omitted, so `Object.keys(out).length`
// is a reliable "has overrides" signal on the screen side.
function diffOverrides(
  draft: UserPreferences,
  base: UserPreferences,
): Partial<UserPreferences> {
  const out: Partial<UserPreferences> = {};
  (Object.keys(draft) as Array<keyof UserPreferences>).forEach((k) => {
    if (!eq(draft[k], base[k])) {
      // @ts-expect-error narrow type per-key would need a switch — JSON-stable shapes only
      out[k] = draft[k];
    }
  });
  return out;
}

// ─── Section card shell ────────────────────────────────────────────────────
function SectionCard({
  title,
  hint,
  Icon,
  iconTone = 'sage',
  isDark,
  children,
}: {
  title: string;
  hint?: string;
  Icon: any;
  iconTone?: 'sage' | 'olive';
  isDark: boolean;
  children: React.ReactNode;
}) {
  const s = useTuneStyles(isDark);
  const accent = iconTone === 'olive' ? designTokens.colors.olive : designTokens.colors.brand;
  return (
    <View
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: s.cardBorder,
        backgroundColor: s.cardBg,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            backgroundColor: `${accent}1A`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={15} color={accent} strokeWidth={1.9} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 14.5,
              color: s.ink,
              letterSpacing: -0.18,
            }}
          >
            {title}
          </Text>
          {hint ? (
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 11.5,
                color: s.ink3,
                marginTop: 2,
                letterSpacing: -0.05,
              }}
            >
              {hint}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

// ─── Reusable chip ─────────────────────────────────────────────────────────
function Chip({
  label,
  selected,
  tone = 'sage',
  onPress,
  isDark,
}: {
  label: string;
  selected: boolean;
  tone?: 'sage' | 'olive';
  onPress: () => void;
  isDark: boolean;
}) {
  const s = useTuneStyles(isDark);
  const bg = selected
    ? tone === 'olive'
      ? designTokens.colors.olive
      : designTokens.colors.brand
    : s.cardBg;
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 999,
            borderWidth: selected ? 0 : 1,
            borderColor: s.cardBorder,
            backgroundColor: bg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          }}
        >
          {selected && <Check size={12} color={designTokens.colors.cream} strokeWidth={2.4} />}
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 12.5,
              color: selected ? designTokens.colors.cream : s.ink2,
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ─── Reusable pill row (single-select, equal-width) ────────────────────────
function PillRow<T extends string | number>({
  options,
  value,
  onChange,
  isDark,
  tone = 'sage',
}: {
  options: Array<{ key: T; label: string }>;
  value: T | undefined;
  onChange: (v: T) => void;
  isDark: boolean;
  tone?: 'sage' | 'olive';
}) {
  const s = useTuneStyles(isDark);
  const accent = tone === 'olive' ? designTokens.colors.olive : designTokens.colors.brand;
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      {options.map((opt) => {
        const selected = value === opt.key;
        return (
          <Pressable
            key={String(opt.key)}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(opt.key);
            }}
            style={{ flex: 1, minWidth: 64 }}
          >
            {({ pressed }) => (
              <View
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  borderWidth: selected ? 0 : 1,
                  borderColor: s.cardBorder,
                  backgroundColor: selected ? accent : s.cardBg,
                  alignItems: 'center',
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                }}
              >
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 12.5,
                    color: selected ? designTokens.colors.cream : s.ink,
                    letterSpacing: -0.1,
                  }}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Main component ────────────────────────────────────────────────────────
export function PlanTuneSheet({
  visible,
  basePreferences,
  overrides,
  oneTimeNote,
  onChange,
  onClose,
  isDark = false,
}: PlanTuneSheetProps) {
  const s = useTuneStyles(isDark);

  // Draft state — re-seeded from props each time the sheet opens so
  // it always reflects the committed truth. Internal edits never leak
  // back to the screen until the user taps "Use for this plan".
  const [draft, setDraft] = useState<UserPreferences>(() => ({
    ...basePreferences,
    ...overrides,
  }));
  const [noteDraft, setNoteDraft] = useState<string>(oneTimeNote);
  const [allergyTouched, setAllergyTouched] = useState(false);

  useEffect(() => {
    if (visible) {
      setDraft({ ...basePreferences, ...overrides });
      setNoteDraft(oneTimeNote);
      setAllergyTouched(false);
    }
    // We only want to re-seed on open, not on every prop tick — that
    // would clobber the user's in-flight edits if the parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const setDraftField = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const toggleStringInList = (key: keyof UserPreferences, value: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = ((draft as any)[key] as string[] | undefined) ?? [];
    const next = current.includes(value)
      ? current.filter((x) => x !== value)
      : [...current, value];
    setDraftField(key, next as any);
  };

  const toggleStringInListNoHaptic = (key: keyof UserPreferences, value: string) => {
    const current = ((draft as any)[key] as string[] | undefined) ?? [];
    const next = current.includes(value)
      ? current.filter((x) => x !== value)
      : [...current, value];
    setDraftField(key, next as any);
  };

  const hasDraftDiff = useMemo(() => {
    const diff = diffOverrides(draft, basePreferences);
    return Object.keys(diff).length > 0 || noteDraft.trim().length > 0;
  }, [draft, basePreferences, noteDraft]);

  const handleReset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDraft({ ...basePreferences });
    setNoteDraft('');
    setAllergyTouched(false);
  };

  const handleCommit = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const diff = diffOverrides(draft, basePreferences);
    onChange(diff, noteDraft);
    onClose();
  };

  // Pantry staples — split chips by separator, allow free-text add.
  const [pantryInput, setPantryInput] = useState('');
  const addPantryStaple = () => {
    const raw = pantryInput.trim();
    if (!raw) return;
    const current = draft.pantryStaples ?? [];
    if (current.includes(raw)) {
      setPantryInput('');
      return;
    }
    setDraftField('pantryStaples', [...current, raw] as any);
    setPantryInput('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const removePantryStaple = (item: string) => {
    const current = draft.pantryStaples ?? [];
    setDraftField('pantryStaples', current.filter((x) => x !== item) as any);
    Haptics.selectionAsync();
  };

  // Weekly budget — string-buffered for natural numeric typing.
  const [budgetInput, setBudgetInput] = useState<string>(
    draft.weeklyBudget != null ? String(draft.weeklyBudget) : '',
  );
  useEffect(() => {
    setBudgetInput(draft.weeklyBudget != null ? String(draft.weeklyBudget) : '');
  }, [visible]); // re-seed on each open
  const commitBudget = () => {
    const n = parseFloat(budgetInput.replace(/[^0-9.]/g, ''));
    setDraftField('weeklyBudget', isFinite(n) && n > 0 ? n : null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}>
        {/* Backdrop — tap-to-dismiss, leaves draft unsaved */}
        <Pressable
          style={{ flex: 1 }}
          onPress={onClose}
          accessibilityLabel="Close tune sheet"
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View
            style={{
              maxHeight: SHEET_MAX_HEIGHT,
              backgroundColor: s.surface,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingTop: 8,
              shadowColor: '#000',
              shadowOpacity: 0.18,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: -6 },
              elevation: 16,
            }}
          >
            {/* Drag handle */}
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <View
                style={{
                  width: 38,
                  height: 4,
                  borderRadius: 999,
                  backgroundColor: s.hair2,
                }}
              />
            </View>

            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                paddingHorizontal: 22,
                paddingTop: 6,
                paddingBottom: 14,
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
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
                  Plan Overrides
                </Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 24,
                    color: s.ink,
                    letterSpacing: -0.45,
                  }}
                >
                  Tune for this{' '}
                  <Text
                    style={{
                      fontFamily: designTokens.font.serifItalic,
                      fontStyle: 'italic',
                      fontSize: 28,
                      letterSpacing: -0.3,
                    }}
                  >
                    plan
                  </Text>
                </Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 13,
                    lineHeight: 19,
                    color: s.ink2,
                    marginTop: 6,
                  }}
                >
                  Changes apply to this plan only — your saved preferences stay as they are.
                </Text>
              </View>

              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: s.cardBorder,
                  backgroundColor: s.cardBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={17} color={s.ink2} strokeWidth={1.9} />
              </Pressable>
            </View>

            {/* Allergy notice — appears the moment the allergy section is touched */}
            {allergyTouched && (
              <View
                style={{
                  marginHorizontal: 22,
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 14,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 10,
                  backgroundColor: 'rgba(228,109,70,0.08)',
                  borderWidth: 1,
                  borderColor: 'rgba(228,109,70,0.35)',
                }}
              >
                <AlertTriangle
                  size={16}
                  color={designTokens.colors.olive}
                  strokeWidth={1.9}
                  style={{ marginTop: 1 }}
                />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: designTokens.font.regular,
                    fontSize: 12.5,
                    lineHeight: 17,
                    color: s.ink2,
                  }}
                >
                  Allergies edited here apply to this plan only.{' '}
                  <Text style={{ fontFamily: designTokens.font.semibold, color: s.ink }}>
                    Your saved allergy profile stays unchanged.
                  </Text>
                </Text>
              </View>
            )}

            {/* Scroll body */}
            <ScrollView
              style={{ paddingHorizontal: 18 }}
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* ── COOKING ───────────────────────────────────────────── */}
              <SectionCard title="Cooking" hint="Servings, skill, and how long" Icon={ChefHat} isDark={isDark}>
                {/* Serving size stepper */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 14,
                  }}
                >
                  <Text style={{ fontFamily: designTokens.font.medium, fontSize: 13, color: s.ink2 }}>
                    Serving size
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setDraftField('servingSize', Math.max(1, draft.servingSize - 1));
                      }}
                      hitSlop={8}
                    >
                      <CircleMinus size={26} color={s.ink2} strokeWidth={1.6} />
                    </Pressable>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 18,
                        color: s.ink,
                        minWidth: 22,
                        textAlign: 'center',
                      }}
                    >
                      {draft.servingSize}
                    </Text>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setDraftField('servingSize', Math.min(12, draft.servingSize + 1));
                      }}
                      hitSlop={8}
                    >
                      <CirclePlus size={26} color={s.ink2} strokeWidth={1.6} />
                    </Pressable>
                  </View>
                </View>

                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12, color: s.ink3, marginBottom: 8 }}>
                  Skill
                </Text>
                <PillRow
                  options={SKILL_LEVELS.map((l) => ({ key: l.key, label: l.label }))}
                  value={draft.cookingSkillLevel}
                  onChange={(v) => setDraftField('cookingSkillLevel', v as any)}
                  isDark={isDark}
                />

                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12, color: s.ink3, marginTop: 14, marginBottom: 8 }}>
                  Prep time
                </Text>
                <PillRow
                  options={PREP_TIME_OPTIONS.map((l) => ({ key: l.key, label: l.label }))}
                  value={draft.mealPrepTime}
                  onChange={(v) => setDraftField('mealPrepTime', v as any)}
                  isDark={isDark}
                />
              </SectionCard>

              {/* ── DIET & SAFETY ─────────────────────────────────────── */}
              <SectionCard
                title="Diet & safety"
                hint="What goes in — and what doesn't"
                Icon={Apple}
                iconTone="olive"
                isDark={isDark}
              >
                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12, color: s.ink3, marginBottom: 8 }}>
                  Dietary restrictions
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {DIETARY_OPTIONS.map((d) => (
                    <Chip
                      key={d}
                      label={d}
                      selected={(draft.dietaryRestrictions ?? []).includes(d)}
                      onPress={() => toggleStringInList('dietaryRestrictions', d)}
                      isDark={isDark}
                    />
                  ))}
                </View>

                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12, color: s.ink3, marginTop: 14, marginBottom: 8 }}>
                  Allergies
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {ALLERGY_OPTIONS.map((a) => (
                    <Chip
                      key={a}
                      label={a}
                      tone="olive"
                      selected={(draft.allergies ?? []).includes(a)}
                      onPress={() => {
                        setAllergyTouched(true);
                        toggleStringInList('allergies', a);
                      }}
                      isDark={isDark}
                    />
                  ))}
                </View>
              </SectionCard>

              {/* ── TASTES ────────────────────────────────────────────── */}
              <SectionCard
                title="Tastes"
                hint="Cuisines and how adventurous"
                Icon={Compass}
                isDark={isDark}
              >
                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12, color: s.ink3, marginBottom: 8 }}>
                  Preferred cuisines
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {CUISINE_OPTIONS.map((c) => (
                    <Chip
                      key={c}
                      label={c}
                      selected={(draft.cuisinePreferences ?? []).includes(c)}
                      onPress={() => toggleStringInList('cuisinePreferences', c)}
                      isDark={isDark}
                    />
                  ))}
                </View>

                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12, color: s.ink3, marginTop: 14, marginBottom: 8 }}>
                  Adventure level
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  {ADVENTURE_LEVELS.map((level) => {
                    const active = (draft.adventureLevel ?? 3) >= level;
                    return (
                      <Pressable
                        key={level}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setDraftField('adventureLevel', level as any);
                        }}
                        hitSlop={6}
                        style={{ padding: 2 }}
                      >
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 999,
                            backgroundColor: active ? designTokens.colors.brand : 'transparent',
                            borderWidth: 1.5,
                            borderColor: active ? designTokens.colors.brand : s.cardBorder,
                          }}
                        />
                      </Pressable>
                    );
                  })}
                  <Text style={{ marginLeft: 6, fontFamily: designTokens.font.regular, fontSize: 12, color: s.ink3 }}>
                    {draft.adventureLevel === 1
                      ? 'Familiar'
                      : draft.adventureLevel === 2
                        ? 'Comfortable'
                        : draft.adventureLevel === 3
                          ? 'Curious'
                          : draft.adventureLevel === 4
                            ? 'Adventurous'
                            : draft.adventureLevel === 5
                              ? 'Daring'
                              : 'Curious'}
                  </Text>
                </View>
              </SectionCard>

              {/* ── HOUSEHOLD ─────────────────────────────────────────── */}
              <SectionCard
                title="Household"
                hint="Who's at the table"
                Icon={Home}
                isDark={isDark}
              >
                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12, color: s.ink3, marginBottom: 8 }}>
                  Cooking for
                </Text>
                <PillRow
                  options={HOUSEHOLD_OPTIONS.map((h) => ({ key: h.id, label: h.label }))}
                  value={draft.household}
                  onChange={(v) => setDraftField('household', v as Household)}
                  isDark={isDark}
                />

                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12, color: s.ink3, marginTop: 14, marginBottom: 6 }}>
                  Meal habits
                </Text>
                {(['breakfast', 'lunch', 'dinner'] as const).map((mealType, idx) => {
                  const currentHabits = draft.mealHabits ?? {
                    breakfast: 'cook',
                    lunch: 'leftovers',
                    dinner: 'cook',
                  };
                  return (
                    <View
                      key={mealType}
                      style={{
                        paddingTop: idx === 0 ? 6 : 10,
                        paddingBottom: 10,
                        borderTopWidth: idx === 0 ? 0 : 1,
                        borderTopColor: s.hair2,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 11,
                          letterSpacing: 0.5,
                          textTransform: 'uppercase',
                          color: s.ink3,
                          marginBottom: 6,
                        }}
                      >
                        {mealType}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {MEAL_HABIT_OPTIONS[mealType].map((opt) => {
                          const active = (currentHabits as any)[mealType] === opt.id;
                          return (
                            <Chip
                              key={opt.id}
                              label={opt.label}
                              selected={active}
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setDraftField('mealHabits', {
                                  ...currentHabits,
                                  [mealType]: opt.id,
                                } as any);
                              }}
                              isDark={isDark}
                            />
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </SectionCard>

              {/* ── KITCHEN ──────────────────────────────────────────── */}
              <SectionCard
                title="Kitchen"
                hint="Equipment + what's already in the pantry"
                Icon={Microwave}
                isDark={isDark}
              >
                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12, color: s.ink3, marginBottom: 8 }}>
                  Equipment
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {EQUIPMENT_OPTIONS.map((opt) => (
                    <Chip
                      key={opt.id}
                      label={opt.label}
                      selected={(draft.equipment ?? []).includes(opt.id)}
                      onPress={() => toggleStringInList('equipment', opt.id)}
                      isDark={isDark}
                    />
                  ))}
                </View>

                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12, color: s.ink3, marginTop: 14, marginBottom: 8 }}>
                  Pantry staples
                </Text>
                {(draft.pantryStaples ?? []).length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {(draft.pantryStaples ?? []).map((item) => (
                      <Pressable key={item} onPress={() => removePantryStaple(item)}>
                        <View
                          style={{
                            paddingLeft: 10,
                            paddingRight: 8,
                            paddingVertical: 6,
                            borderRadius: 999,
                            backgroundColor: designTokens.colors.brand,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: designTokens.font.medium,
                              fontSize: 12.5,
                              color: designTokens.colors.cream,
                            }}
                          >
                            {item}
                          </Text>
                          <X size={12} color={designTokens.colors.cream} strokeWidth={2.2} />
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 8,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: s.cardBorder,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                  }}
                >
                  <TextInput
                    value={pantryInput}
                    onChangeText={setPantryInput}
                    onSubmitEditing={addPantryStaple}
                    placeholder="Add an item — e.g. brown rice"
                    placeholderTextColor={s.ink3}
                    returnKeyType="done"
                    style={{
                      flex: 1,
                      fontFamily: designTokens.font.regular,
                      fontSize: 13,
                      color: s.ink,
                      paddingVertical: 8,
                    }}
                  />
                  {pantryInput.trim().length > 0 && (
                    <Pressable onPress={addPantryStaple} hitSlop={8}>
                      <CirclePlus
                        size={22}
                        color={designTokens.colors.brand}
                        strokeWidth={1.8}
                      />
                    </Pressable>
                  )}
                </View>
              </SectionCard>

              {/* ── GOALS & BUDGET ───────────────────────────────────── */}
              <SectionCard
                title="Goals & budget"
                hint="What this plan should optimize for"
                Icon={Wallet}
                isDark={isDark}
              >
                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12, color: s.ink3, marginBottom: 8 }}>
                  Goals
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {GOAL_OPTIONS.map((g) => (
                    <Chip
                      key={g.id}
                      label={g.label}
                      selected={(draft.goals ?? []).includes(g.id)}
                      onPress={() => toggleStringInList('goals', g.id)}
                      isDark={isDark}
                    />
                  ))}
                </View>

                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12, color: s.ink3, marginTop: 14, marginBottom: 8 }}>
                  Weeknight time per meal
                </Text>
                <PillRow<WeeknightMinutes>
                  options={WEEKNIGHT_MINUTE_OPTIONS.map((m) => ({ key: m, label: `${m} min` }))}
                  value={draft.weeknightMinutes}
                  onChange={(v) => setDraftField('weeknightMinutes', v)}
                  isDark={isDark}
                />

                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12, color: s.ink3, marginTop: 14, marginBottom: 8 }}>
                  Weekly grocery budget
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    borderWidth: 1,
                    borderColor: s.cardBorder,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                  }}
                >
                  <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 14, color: s.ink3 }}>$</Text>
                  <TextInput
                    value={budgetInput}
                    onChangeText={setBudgetInput}
                    onBlur={commitBudget}
                    keyboardType="decimal-pad"
                    placeholder="No limit"
                    placeholderTextColor={s.ink3}
                    style={{
                      flex: 1,
                      fontFamily: designTokens.font.regular,
                      fontSize: 14,
                      color: s.ink,
                      paddingVertical: 10,
                    }}
                  />
                  <Text style={{ fontFamily: designTokens.font.regular, fontSize: 12, color: s.ink3 }}>/ week</Text>
                </View>
              </SectionCard>

              {/* ── ONE-TIME NOTE ────────────────────────────────────── */}
              <SectionCard
                title="One-time note"
                hint="Anything else just for this plan"
                Icon={Pencil}
                iconTone="olive"
                isDark={isDark}
              >
                <TextInput
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  placeholder="e.g. cooking for a guest with mild peanut allergy, lean toward warming dishes"
                  placeholderTextColor={s.ink3}
                  multiline
                  numberOfLines={3}
                  style={{
                    borderWidth: 1,
                    borderColor: s.cardBorder,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingTop: 10,
                    paddingBottom: 12,
                    fontFamily: designTokens.font.regular,
                    fontSize: 13.5,
                    lineHeight: 19,
                    color: s.ink,
                    minHeight: 76,
                    textAlignVertical: 'top',
                  }}
                />
              </SectionCard>

              <View style={{ height: 12 }} />
            </ScrollView>

            {/* Sticky footer */}
            <View
              style={{
                flexDirection: 'row',
                gap: 10,
                paddingHorizontal: 18,
                paddingTop: 12,
                paddingBottom: Platform.OS === 'ios' ? 28 : 16,
                borderTopWidth: 1,
                borderTopColor: s.hair2,
                backgroundColor: s.surface,
              }}
            >
              <Pressable
                onPress={handleReset}
                disabled={!hasDraftDiff}
                style={{ flexBasis: 110 }}
              >
                {({ pressed }) => (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 14,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: s.cardBorder,
                      backgroundColor: s.cardBg,
                      opacity: hasDraftDiff ? 1 : 0.5,
                      transform: [{ scale: pressed && hasDraftDiff ? 0.98 : 1 }],
                    }}
                  >
                    <RotateCcw size={14} color={s.ink2} strokeWidth={1.9} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 13,
                        color: s.ink2,
                        letterSpacing: -0.1,
                      }}
                    >
                      Reset
                    </Text>
                  </View>
                )}
              </Pressable>

              <Pressable onPress={handleCommit} style={{ flex: 1 }}>
                {({ pressed }) => (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      paddingVertical: 14,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.brand,
                      shadowColor: designTokens.colors.brandDeep,
                      shadowOpacity: 0.24,
                      shadowRadius: 14,
                      shadowOffset: { width: 0, height: 6 },
                      elevation: 3,
                      transform: [{ scale: pressed ? 0.985 : 1 }],
                    }}
                  >
                    <Check size={16} color={designTokens.colors.cream} strokeWidth={2.4} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 14.5,
                        color: designTokens.colors.cream,
                        letterSpacing: -0.18,
                      }}
                    >
                      Use for this plan
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
