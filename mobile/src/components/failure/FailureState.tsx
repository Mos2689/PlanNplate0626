// FailureState — full-page failure surface.
//
// Used by the global ErrorBoundary and by screens whose whole content failed to
// load. Deliberately quiet: an icon, a headline, one supporting line, and the
// recovery action. No error codes, no diagnostics, no "unexpected exception"
// language — all of which the previous ErrorBoundary showed.
//
// Accessibility: the whole block is one announced group so a screen reader
// reads "heading, explanation, button" in order rather than three orphaned
// fragments, and the action meets the 44pt touch target minimum.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CloudOff, RefreshCw, Utensils } from 'lucide-react-native';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
import type { Failure } from '@/lib/failure';

interface FailureStateProps {
  failure: Failure;
  /** Runs when the user taps the primary action. */
  onAction: () => void;
  /** Optional secondary escape hatch, e.g. "Return home". */
  secondaryLabel?: string;
  onSecondary?: () => void;
  isDark?: boolean;
}

export function FailureState({
  failure,
  onAction,
  secondaryLabel,
  onSecondary,
  isDark = false,
}: FailureStateProps) {
  const colors = getThemeColors(isDark);
  const Icon =
    failure.category === 'offline' || failure.category === 'poor-connection'
      ? CloudOff
      : failure.category === 'unknown'
        ? Utensils
        : RefreshCw;

  return (
    <View
      style={[styles.container, { backgroundColor: colors.bg }]}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${failure.title}. ${failure.body}`}
    >
      <View style={styles.icon} importantForAccessibility="no-hide-descendants">
        <Icon size={26} color={designTokens.colors.notice} strokeWidth={1.7} />
      </View>

      <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">
        {failure.title}
      </Text>
      <Text style={[styles.body, { color: colors.ink2 }]}>{failure.body}</Text>

      <Pressable
        onPress={onAction}
        style={styles.primary}
        accessibilityRole="button"
        accessibilityLabel={failure.action.label}
      >
        <Text style={styles.primaryText}>{failure.action.label}</Text>
      </Pressable>

      {secondaryLabel && onSecondary && (
        <Pressable
          onPress={onSecondary}
          style={styles.secondary}
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel}
        >
          <Text style={[styles.secondaryText, { color: colors.ink2 }]}>{secondaryLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  icon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: designTokens.colors.noticeSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: designTokens.font.medium,
    fontSize: 20,
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontFamily: designTokens.font.regular,
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 28,
  },
  primary: {
    minHeight: 48,
    paddingHorizontal: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designTokens.colors.brand,
  },
  primaryText: {
    fontFamily: designTokens.font.semibold,
    fontSize: 15,
    color: designTokens.colors.cream,
  },
  secondary: {
    minHeight: 44,
    paddingHorizontal: 20,
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontFamily: designTokens.font.medium,
    fontSize: 14,
  },
});
