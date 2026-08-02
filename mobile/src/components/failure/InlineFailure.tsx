// InlineFailure — the quietest surface, for failures attached to a specific
// control (a form field, a single row) rather than the screen.
//
// This is what the auth screens use. They previously rendered a raw string from
// auth-store straight into a red <Text>, which is how Supabase's own wording
// reached users. Now they render a Failure, so the copy comes from the
// catalogue and the raw cause can't be reached.
//
// `accessibilityLiveRegion="polite"` means a screen reader announces the
// message when it appears without stealing focus from the field the user is
// still editing.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { designTokens } from '@/lib/design-tokens';
import type { Failure } from '@/lib/failure';

interface InlineFailureProps {
  failure: Failure | null;
  /** Optional action. Omit for pure validation, where the fix is in the field. */
  onAction?: () => void;
  /** Hide the supporting line where space is tight (e.g. under a text input). */
  compact?: boolean;
}

export function InlineFailure({ failure, onAction, compact = false }: InlineFailureProps) {
  if (!failure) return null;

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={compact ? failure.title : `${failure.title}. ${failure.body}`}
    >
      {/* A shape, not just a hue — the state must survive colour blindness
          and greyscale. */}
      <View style={styles.dot} importantForAccessibility="no" />
      <View style={styles.text}>
        <Text style={styles.title}>{failure.title}</Text>
        {!compact && <Text style={styles.body}>{failure.body}</Text>}
        {onAction && (
          <Pressable
            onPress={onAction}
            hitSlop={12}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel={failure.action.label}
          >
            <Text style={styles.actionText}>{failure.action.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: designTokens.colors.noticeSurface,
    borderWidth: 1,
    borderColor: designTokens.colors.noticeBorder,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    backgroundColor: designTokens.colors.notice,
  },
  text: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: designTokens.font.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: designTokens.colors.notice,
  },
  body: {
    fontFamily: designTokens.font.regular,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 2,
    color: designTokens.colors.ink2,
  },
  action: {
    minHeight: 32,
    justifyContent: 'center',
    marginTop: 4,
  },
  actionText: {
    fontFamily: designTokens.font.semibold,
    fontSize: 13,
    color: designTokens.colors.noticeDeep,
    textDecorationLine: 'underline',
  },
});
