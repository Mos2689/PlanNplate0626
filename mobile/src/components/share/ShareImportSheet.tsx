// The in-app share surface — Android's share target, and where an iOS share
// finishes once the app is opened.
//
// Presentational only: every decision about what happens next lives in
// app/share-import.tsx and lib/share/import-orchestrator.ts. That split is what
// lets the state machine be tested without a renderer.
//
// Deliberately not a miniature of the app. One card, one thing being decided,
// no tabs, no navigation, no settings — the user is mid-task in another app and
// wants to get back to it.
//
// Accessibility: each state is announced as it arrives (a screen reader would
// otherwise sit on "Save to PlanNplate" while the import ran), titles carry the
// header trait, every control clears 48pt, and the entrance animation is
// skipped when the user has asked for reduced motion.

import React, { useEffect } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { Check, CloudOff, Link2, Utensils } from 'lucide-react-native';
import { designTokens, getThemeColors, serifItalicFontStyle } from '@/lib/design-tokens';
import type { Failure } from '@/lib/failure';

/**
 * No `ready` state.
 *
 * The user already decided by picking PlanNplate in the share sheet; asking
 * again bought nothing and delayed the only thing they wanted. The import starts
 * the moment this opens, and the sheet reports progress instead of requesting
 * permission. A signed-out user still gets a decision point — `auth-required` —
 * because there the app genuinely cannot proceed.
 */
export type ShareSheetUiState =
  | { kind: 'loading' }
  | { kind: 'importing'; host?: string }
  | { kind: 'saved'; recipeName: string }
  | { kind: 'duplicate'; recipeName: string }
  | { kind: 'auth-required' }
  | { kind: 'failed'; failure: Failure };

interface ShareImportSheetProps {
  state: ShareSheetUiState;
  isDark: boolean;
  onCancel: () => void;
  onDone: () => void;
  onViewRecipe: () => void;
  onEditDetails: () => void;
  onSignIn: () => void;
  onRetry: () => void;
}

/** Title / body per state. Failure wording always comes from lib/failure/copy.ts. */
function contentFor(state: ShareSheetUiState): { title: string; body: string } {
  switch (state.kind) {
    case 'loading':
      return { title: 'Checking the recipe…', body: 'This should only take a moment.' };
    case 'importing':
      return {
        title: 'Saving your recipe…',
        body: 'We’re adding it to your recipe collection.',
      };
    case 'saved':
      return { title: 'Saved to PlanNplate', body: 'Your recipe is ready when you are.' };
    case 'duplicate':
      return {
        title: 'Already in PlanNplate',
        body: 'This recipe is already in your collection.',
      };
    case 'auth-required':
      return {
        title: 'Sign in to finish saving',
        body: 'We’ve kept this link for you. Sign in and we’ll add it to your recipes.',
      };
    case 'failed':
      return { title: state.failure.title, body: state.failure.body };
  }
}

export function ShareImportSheet({
  state,
  isDark,
  onCancel,
  onDone,
  onViewRecipe,
  onEditDetails,
  onSignIn,
  onRetry,
}: ShareImportSheetProps) {
  const colors = getThemeColors(isDark);
  const reduceMotion = useReducedMotion();
  const { title, body } = contentFor(state);

  // Announce every transition. Without this a screen reader stays on the state
  // it read when the sheet opened, so a blind user would never hear "Saved".
  useEffect(() => {
    if (!title) return;
    AccessibilityInfo.announceForAccessibility(`${title}. ${body}`);
  }, [title, body]);

  const isBusy = state.kind === 'loading' || state.kind === 'importing';
  const StatusIcon =
    state.kind === 'saved' || state.kind === 'duplicate'
      ? Check
      : state.kind === 'failed' &&
          (state.failure.category === 'offline' || state.failure.category === 'poor-connection')
        ? CloudOff
        : state.kind === 'failed'
          ? Utensils
          : Link2;

  const isPositive = state.kind === 'saved' || state.kind === 'duplicate';
  const isNegative = state.kind === 'failed';

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(21, 20, 15, 0.28)',
      }}
    >
      <Pressable
        style={{ flex: 1 }}
        onPress={isBusy ? undefined : onCancel}
        accessibilityRole="button"
        accessibilityLabel="Close"
        accessibilityHint="Dismisses without saving"
      />

      <Animated.View
        entering={reduceMotion ? undefined : FadeInDown.springify().damping(18)}
        style={{
          backgroundColor: isDark ? colors.surface : designTokens.colors.cream,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderWidth: 1,
          borderColor: colors.hair,
          paddingHorizontal: 24,
          paddingTop: 20,
          paddingBottom: 34,
          gap: 20,
        }}
        accessibilityViewIsModal
      >
        {/* Identity */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              backgroundColor: designTokens.colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            importantForAccessibility="no-hide-descendants"
          >
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 14,
                color: designTokens.colors.cream,
              }}
            >
              P
            </Text>
          </View>
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 14,
              color: colors.ink2,
            }}
          >
            Plan
            <Text
              style={{
                fontFamily: designTokens.font.serifItalic,
                fontStyle: serifItalicFontStyle,
                fontSize: 16,
              }}
            >
              N
            </Text>
            plate
          </Text>
        </View>

        {/* State */}
        <View
          style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}
          accessible
          accessibilityRole={isNegative ? 'alert' : 'text'}
          accessibilityLabel={`${title}. ${body}`}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isNegative
                ? designTokens.colors.noticeSurface
                : isDark
                  ? colors.surfaceMuted
                  : '#FFFFFF',
              borderWidth: 1,
              borderColor: isNegative ? designTokens.colors.noticeBorder : colors.hair,
            }}
            importantForAccessibility="no-hide-descendants"
          >
            {isBusy ? (
              <ActivityIndicator size="small" color={designTokens.colors.brand} />
            ) : (
              <StatusIcon
                size={19}
                strokeWidth={1.8}
                color={
                  isNegative
                    ? designTokens.colors.notice
                    : isPositive
                      ? designTokens.colors.brand
                      : colors.ink3
                }
              />
            )}
          </View>

          <View style={{ flex: 1, gap: 6 }}>
            <Text
              accessibilityRole="header"
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 19,
                letterSpacing: -0.38,
                color: colors.ink,
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 14,
                lineHeight: 20,
                color: colors.ink2,
              }}
            >
              {body}
            </Text>
            {state.kind === 'importing' && state.host ? (
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 12.5,
                  color: colors.ink3,
                  marginTop: 2,
                }}
              >
                {state.host}
              </Text>
            ) : null}
            {(state.kind === 'saved' || state.kind === 'duplicate') && state.recipeName ? (
              <Text
                numberOfLines={2}
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 13.5,
                  color: colors.ink,
                  marginTop: 2,
                }}
              >
                {state.recipeName}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Actions */}
        <View style={{ gap: 10 }}>
          {/* Nothing to offer while it's working — a Cancel here would only
              invite the user to abandon something that takes a few seconds. */}
          {state.kind === 'saved' && (
            <>
              <PrimaryAction label="View recipe" onPress={onViewRecipe} />
              <SecondaryAction label="Edit details" onPress={onEditDetails} color={colors.ink2} />
              <SecondaryAction label="Done" onPress={onDone} color={colors.ink3} />
            </>
          )}

          {state.kind === 'duplicate' && (
            <>
              <PrimaryAction label="View recipe" onPress={onViewRecipe} />
              <SecondaryAction label="Done" onPress={onDone} color={colors.ink2} />
            </>
          )}

          {state.kind === 'auth-required' && (
            <>
              <PrimaryAction label="Sign in" onPress={onSignIn} />
              <SecondaryAction label="Not now" onPress={onDone} color={colors.ink2} />
            </>
          )}

          {state.kind === 'failed' && (
            <>
              {state.failure.retryable ? (
                <PrimaryAction label={state.failure.action.label} onPress={onRetry} />
              ) : (
                <PrimaryAction label={state.failure.action.label} onPress={onEditDetails} />
              )}
              <SecondaryAction label="Cancel" onPress={onCancel} color={colors.ink2} />
            </>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

/** Terracotta, reserved for the one action we want taken. */
function PrimaryAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        backgroundColor: pressed
          ? designTokens.colors.oliveDeep
          : designTokens.colors.olive,
      })}
    >
      <Text
        style={{
          fontFamily: designTokens.font.semibold,
          fontSize: 15,
          color: designTokens.colors.cream,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SecondaryAction({
  label,
  onPress,
  color,
}: {
  label: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: designTokens.font.medium, fontSize: 14.5, color }}>
        {label}
      </Text>
    </Pressable>
  );
}
