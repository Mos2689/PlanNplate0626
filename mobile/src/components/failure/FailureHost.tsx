// FailureHost — the single mounted surface that renders toasts, banners and
// dialogs driven by the failure store, plus the persistent offline banner.
//
// Mounted once in app/_layout.tsx beside PaywallSheet, following the same
// pattern: any module anywhere calls `presentFailure(...)` and this renders it,
// with no prop drilling and no per-screen error state.

import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutDown, FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { CloudOff, RefreshCw, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  resolveFailure,
  useConnectivity,
  useFailureStore,
  type Failure,
} from '@/lib/failure';

interface FailureHostProps {
  isDark?: boolean;
}

export function FailureHost({ isDark = false }: FailureHostProps) {
  const insets = useSafeAreaInsets();
  const colors = getThemeColors(isDark);

  const toast = useFailureStore((s) => s.toast);
  const banner = useFailureStore((s) => s.banner);
  const dialog = useFailureStore((s) => s.dialog);
  const retryHandler = useFailureStore((s) => s.retryHandler);
  const dismissToast = useFailureStore((s) => s.dismissToast);
  const dismissBanner = useFailureStore((s) => s.dismissBanner);
  const dismissDialog = useFailureStore((s) => s.dismissDialog);

  const isOnline = useConnectivity((s) => s.isOnline);
  const hasResolved = useConnectivity((s) => s.hasResolved);

  // Shared handler for every surface's primary action. Runs the retry the
  // presenter supplied, records the recovery, and clears the surface.
  const runAction = useCallback(
    async (failure: Failure, dismiss: () => void) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      dismiss();
      if (retryHandler) {
        resolveFailure(failure, 'retry');
        await retryHandler();
      } else {
        resolveFailure(failure, 'action');
      }
    },
    [retryHandler],
  );

  return (
    <>
      {/* ── Offline banner ────────────────────────────────────────────────
          Persistent while offline, above tab-level content. Gated on
          `hasResolved` so a cold start never flashes it before NetInfo has
          reported. */}
      {hasResolved && !isOnline && (
        <Animated.View
          entering={FadeInUp.duration(220)}
          exiting={FadeOutUp.duration(180)}
          pointerEvents="none"
          style={[styles.offline, { top: insets.top }]}
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel="You're offline. Your changes are saved on this device and will sync when you reconnect."
        >
          <CloudOff size={13} color={designTokens.colors.cream} strokeWidth={2} />
          <Text style={styles.offlineText}>
            You&rsquo;re offline &middot; changes are saved here
          </Text>
        </Animated.View>
      )}

      {/* ── Banner (warning) ─────────────────────────────────────────────── */}
      {banner && (
        <Animated.View
          entering={FadeInUp.duration(220)}
          exiting={FadeOutUp.duration(180)}
          style={[styles.banner, { top: insets.top + (hasResolved && !isOnline ? 34 : 8) }]}
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${banner.title}. ${banner.body}`}
        >
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>{banner.title}</Text>
            <Text style={styles.bannerBody} numberOfLines={2}>
              {banner.body}
            </Text>
          </View>

          {banner.action.kind !== 'dismiss' && (
            <Pressable
              onPress={() => runAction(banner, dismissBanner)}
              hitSlop={8}
              style={styles.bannerAction}
              accessibilityRole="button"
              accessibilityLabel={banner.action.label}
            >
              <RefreshCw size={13} color={designTokens.colors.noticeDeep} strokeWidth={2} />
              <Text style={styles.bannerActionText}>{banner.action.label}</Text>
            </Pressable>
          )}

          <Pressable
            onPress={dismissBanner}
            hitSlop={12}
            style={styles.bannerClose}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <X size={15} color={designTokens.colors.ink3} strokeWidth={2} />
          </Pressable>
        </Animated.View>
      )}

      {/* ── Toast (info) ──────────────────────────────────────────────────
          Mirrors SuccessToast's placement and motion so success and failure
          feel like the same system. */}
      {toast && (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOutDown.duration(180)}
          style={[styles.toast, { bottom: insets.bottom + 96, backgroundColor: colors.bg }]}
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${toast.title}. ${toast.body}`}
        >
          <View style={styles.toastDot} importantForAccessibility="no" />
          <View style={styles.toastText}>
            <Text style={[styles.toastTitle, { color: colors.ink }]}>{toast.title}</Text>
            <Text style={[styles.toastBody, { color: colors.ink2 }]} numberOfLines={2}>
              {toast.body}
            </Text>
          </View>
          {toast.action.kind !== 'dismiss' ? (
            <Pressable
              onPress={() => runAction(toast, dismissToast)}
              hitSlop={10}
              style={styles.toastAction}
              accessibilityRole="button"
              accessibilityLabel={toast.action.label}
            >
              <Text style={styles.toastActionText}>{toast.action.label}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={dismissToast}
              hitSlop={10}
              style={styles.toastAction}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <X size={15} color={designTokens.colors.ink3} strokeWidth={2} />
            </Pressable>
          )}
        </Animated.View>
      )}

      {/* ── Dialog (blocking) ─────────────────────────────────────────────
          Reuses ConfirmDialog so blocking failures look identical to every
          other decision the app asks for. */}
      {dialog && (
        <ConfirmDialog
          visible
          title={dialog.title}
          message={dialog.body}
          confirmLabel={dialog.action.label}
          cancelLabel="Not now"
          confirmColor={designTokens.colors.brand}
          isDark={isDark}
          onConfirm={() => runAction(dialog, dismissDialog)}
          onCancel={dismissDialog}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  offline: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 900,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: designTokens.colors.charcoal,
  },
  offlineText: {
    fontFamily: designTokens.font.medium,
    fontSize: 12,
    color: designTokens.colors.cream,
    letterSpacing: -0.05,
  },

  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 950,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 16,
    backgroundColor: designTokens.colors.noticeSurface,
    borderWidth: 1,
    borderColor: designTokens.colors.noticeBorder,
  },
  bannerText: { flex: 1, minWidth: 0 },
  bannerTitle: {
    fontFamily: designTokens.font.medium,
    fontSize: 13.5,
    color: designTokens.colors.notice,
  },
  bannerBody: {
    fontFamily: designTokens.font.regular,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
    color: designTokens.colors.ink2,
  },
  bannerAction: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  bannerActionText: {
    fontFamily: designTokens.font.semibold,
    fontSize: 12.5,
    color: designTokens.colors.noticeDeep,
  },
  bannerClose: {
    minWidth: 32,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 950,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: designTokens.colors.hair,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  toastDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: designTokens.colors.notice,
  },
  toastText: { flex: 1, minWidth: 0 },
  toastTitle: {
    fontFamily: designTokens.font.medium,
    fontSize: 13.5,
  },
  toastBody: {
    fontFamily: designTokens.font.regular,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  toastAction: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  toastActionText: {
    fontFamily: designTokens.font.semibold,
    fontSize: 13,
    color: designTokens.colors.brand,
  },
});
