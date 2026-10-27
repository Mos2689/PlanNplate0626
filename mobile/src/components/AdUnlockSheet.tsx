// AdUnlockSheet — every "Premium free for 7 days with a short video" moment.
//
// One bottom sheet, mounted once at the root, driven by useAdUnlockStore.sheet:
//   intro         after the paywall is closed        "Not ready to subscribe?"
//   renewal (A/D) gated tap / Profile after a week   "Your free week has ended"
//   extend  (B)   from the "ends tomorrow" banner    "Extend your free week"
//   success-* (C) after a plan / a shop, last 2 days "Nice work on your …"
//   confirm       after a successful unlock          "You're all set!"
//
// Every ad is started by a tap (AdMob rewarded-ad policy). If the first ad is
// shorter than ~30 s, the user sees progress and taps once more.
// From the 3rd unlock on, the subscription becomes the primary button.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { Play, Crown, X, Check } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';

import { designTokens, getThemeColors } from '@/lib/design-tokens';
import { useColorScheme } from '@/lib/useColorScheme';
import { track } from '@/lib/analytics';
import { getPackage } from '@/lib/revenuecatClient';
import { showRewardedAd } from '@/lib/rewarded-ad';
import { useAdUnlockStore, type AdSheetMode } from '@/lib/ad-unlock-store';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { useMealPlanStore } from '@/lib/store';
import {
  applyAdOutcome,
  leadWithSubscription,
  REQUIRED_WATCH_SECONDS,
  AD_UNLOCK_DAYS,
} from '@/lib/ad-unlock-logic';

type Phase = 'idle' | 'playing' | 'need-more' | 'granting' | 'unavailable' | 'closed-early';

const PROACTIVE_MODES: AdSheetMode[] = ['extend', 'success-plan', 'success-shop'];

const SHEET_BG_LIGHT = '#FCFBF4';
const TINT = 'rgba(84,100,69,0.09)';

function formatEnd(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function AdUnlockSheet() {
  const isDark = useColorScheme() === 'dark';
  const colors = getThemeColors(isDark);
  const sheet = useAdUnlockStore((s) => s.sheet);
  const unlockCount = useAdUnlockStore((s) => s.unlockCount);
  const unlockedUntil = useAdUnlockStore((s) => s.unlockedUntil);
  const closeSheet = useAdUnlockStore((s) => s.closeSheet);
  const openSheet = useAdUnlockStore((s) => s.openSheet);
  const grant = useAdUnlockStore((s) => s.grant);
  const snoozeProactive = useAdUnlockStore((s) => s.snoozeProactive);
  const maybePromptSuccess = useAdUnlockStore((s) => s.maybePromptSuccess);

  const [phase, setPhase] = useState<Phase>('idle');
  const progress = useAdUnlockStore((s) => s.sessionProgress);
  const setProgress = useAdUnlockStore((s) => s.setSessionProgress);
  const clearProgress = useAdUnlockStore((s) => s.clearSessionProgress);
  const [weekly, setWeekly] = useState<string | null>(null);

  // (C) A finished meal plan, in the last 2 days of a week.
  const genStage = useMealPlanStore((s) => s.pendingGeneration?.stage ?? null);
  const prevStage = useRef(genStage);
  useEffect(() => {
    if (prevStage.current !== 'done' && genStage === 'done') {
      const t = setTimeout(() => maybePromptSuccess('success-plan'), 1200);
      prevStage.current = genStage;
      return () => clearTimeout(t);
    }
    prevStage.current = genStage;
  }, [genStage, maybePromptSuccess]);

  // Fresh phase and the live weekly price each time a sheet opens.
  // Progress is NOT reset here — it lives in the store and persists across
  // sheet close/reopen within the same app session.
  useEffect(() => {
    if (!sheet || sheet === 'confirm') return;
    const stored = useAdUnlockStore.getState().sessionProgress;
    setPhase(stored.watchedSeconds > 0 ? 'need-more' : 'idle');
    let alive = true;
    getPackage('$rc_monthly').then((r) => {
      if (alive && r.ok) setWeekly(r.data?.product.pricePerWeekString ?? null);
    });
    return () => {
      alive = false;
    };
  }, [sheet]);

  const dismiss = useCallback(() => {
    if (phase === 'playing' || phase === 'granting') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (sheet && sheet !== 'confirm') {
      track('ad_unlock_prompt_dismissed', { mode: sheet });
      if (PROACTIVE_MODES.includes(sheet)) snoozeProactive();
    }
    closeSheet();
  }, [closeSheet, phase, sheet, snoozeProactive]);

  const goPremium = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    track('ad_unlock_prompt_dismissed', { mode: sheet, chose: 'subscription' });
    closeSheet();
    setTimeout(() => useSubscriptionStore.getState().openPaywallSheet('ad-sheet'), 350);
  }, [closeSheet, sheet]);

  const watch = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (progress.adsAttempted === 0) track('ad_unlock_started', { mode: sheet });
    setPhase('playing');

    const outcome = await showRewardedAd();
    if (outcome.kind === 'earned') {
      track('ad_unlock_ad_completed', { mode: sheet, seconds: Math.round(outcome.watchedSeconds) });
    }
    const decision = applyAdOutcome(progress, outcome);
    setProgress(decision.progress);

    if (decision.status === 'need-more') {
      setPhase(decision.progress.adsCompleted === 0 ? 'closed-early' : 'need-more');
      return;
    }
    if (decision.status === 'unavailable') {
      track('ad_unlock_unavailable', { mode: sheet });
      setPhase('unavailable');
      return;
    }

    setPhase('granting');
    await grant();
    track('ad_unlock_granted', {
      mode: sheet,
      seconds: Math.round(decision.progress.watchedSeconds),
      ads: decision.progress.adsCompleted,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase('idle');
    clearProgress();
    openSheet('confirm');
  }, [grant, openSheet, clearProgress, progress, sheet]);

  if (!sheet) return null;

  const busy = phase === 'playing' || phase === 'granting';
  const sheetBg = isDark ? '#1f1f1f' : SHEET_BG_LIGHT;
  const subscriptionFirst = sheet !== 'intro' && leadWithSubscription(unlockCount);
  const adLine = weekly ? `Go ad-free from ${weekly}/week.` : 'Go ad-free with Premium.';

  // ── Copy per mode ──
  let title = '';
  let body = '';
  if (sheet === 'intro') {
    title = 'Not ready to subscribe?';
    body = `Keep enjoying Premium for ${AD_UNLOCK_DAYS} days by watching a short sponsored video.`;
  } else if (sheet === 'renewal') {
    title = 'Your free week has ended';
    body = 'Keep planning without limits.';
  } else if (sheet === 'extend') {
    title = 'Extend your free week';
    body = `Your free Premium week ends soon. Watch a short video to add ${AD_UNLOCK_DAYS} more days.`;
  } else if (sheet === 'success-plan') {
    title = 'Nice work on your meal plan!';
    body = `Keep enjoying Premium free for ${AD_UNLOCK_DAYS} more days.`;
  } else if (sheet === 'success-shop') {
    title = 'Nice work on your shop!';
    body = `Keep enjoying Premium free for ${AD_UNLOCK_DAYS} more days.`;
  } else {
    title = 'You’re all set!';
    body = unlockedUntil
      ? `You now have Premium access until ${formatEnd(unlockedUntil)}. Enjoy all features at no cost.`
      : `You now have Premium access for ${AD_UNLOCK_DAYS} days. Enjoy all features at no cost.`;
  }

  const watched = Math.min(REQUIRED_WATCH_SECONDS, Math.round(progress.watchedSeconds));
  const remaining = Math.max(1, REQUIRED_WATCH_SECONDS - watched);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={dismiss} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <View style={[styles.sheet, { backgroundColor: sheetBg }]}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <Pressable
            onPress={dismiss}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={[styles.close, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EFECE4' }]}
          >
            <X size={17} color={colors.ink} strokeWidth={1.9} />
          </Pressable>

          <SheetLogo />

          <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
          <Text style={[styles.body, { color: colors.ink2 }]}>{body}</Text>

          {/* ── Second-ad progress ── */}
          {phase === 'need-more' ? (
            <View style={[styles.card, { backgroundColor: TINT }]}>
              <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 14, color: colors.ink }}>
                {watched}s of {REQUIRED_WATCH_SECONDS}s watched
              </Text>
              <View style={[styles.track, { backgroundColor: colors.hair }]}>
                <View
                  style={[
                    styles.fill,
                    { width: `${Math.round((watched / REQUIRED_WATCH_SECONDS) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={{ fontFamily: designTokens.font.regular, fontSize: 13, lineHeight: 18, color: colors.ink2, marginTop: 10 }}>
                Almost there — {remaining}s left to unlock your {AD_UNLOCK_DAYS} days.
              </Text>
            </View>
          ) : sheet === 'intro' ? (
            <Checklist
              items={['Unlock all Premium features', 'No payment required', 'Takes less than 30 seconds']}
              ink={colors.ink}
            />
          ) : sheet === 'confirm' ? (
            <Checklist
              items={[
                'Meal planning without limits',
                'Curated plans & collections',
                'Smart shopping lists',
                'Pantry-based recipes and more',
              ]}
              ink={colors.ink}
            />
          ) : null}

          {/* ── Actions ── */}
          <View style={{ marginTop: 18 }}>
            {sheet === 'confirm' ? (
              <PrimaryButton label="Start Exploring" onPress={closeSheet} />
            ) : sheet === 'intro' || phase === 'need-more' ? (
              <>
                <PrimaryButton
                  label={phase === 'need-more' ? `Watch ${remaining}s more` : 'Watch & Continue'}
                  icon="play"
                  busy={busy}
                  busyLabel={phase === 'granting' ? 'Unlocking…' : 'Loading video…'}
                  onPress={watch}
                />
                <Pressable onPress={dismiss} hitSlop={8} style={{ alignSelf: 'center', marginTop: 14, padding: 4 }}>
                  <Text style={{ fontFamily: designTokens.font.medium, fontSize: 14, color: colors.ink2 }}>
                    {phase === 'need-more' ? 'Cancel' : 'No thanks'}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                {subscriptionFirst ? (
                  <>
                    <PrimaryButton label="Go Premium" sub={adLine} icon="crown" onPress={goPremium} />
                    <OrDivider color={colors.ink3} />
                    <OutlineButton
                      label="Watch a short video"
                      sub={`Get ${AD_UNLOCK_DAYS} more days`}
                      icon="play"
                      busy={busy}
                      onPress={watch}
                      colors={colors}
                    />
                  </>
                ) : (
                  <>
                    <PrimaryButton
                      label="Watch a short video"
                      sub={`Get ${AD_UNLOCK_DAYS} more days`}
                      icon="play"
                      busy={busy}
                      busyLabel={phase === 'granting' ? 'Unlocking…' : 'Loading video…'}
                      onPress={watch}
                    />
                    <OrDivider color={colors.ink3} />
                    <OutlineButton label="Go Premium" sub={adLine} icon="crown" onPress={goPremium} colors={colors} />
                  </>
                )}
              </>
            )}

            {(phase === 'unavailable' || phase === 'closed-early') && (
              <Text style={{ textAlign: 'center', marginTop: 12, fontFamily: designTokens.font.regular, fontSize: 12.5, lineHeight: 17, color: designTokens.colors.olive }}>
                {phase === 'unavailable'
                  ? 'No video is available right now. Please try again in a little while.'
                  : 'The video was closed before the end, so it didn’t count. Tap to try again.'}
              </Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

const LOGO = require('../../assets/images/plannplate-logo.png');

function SheetLogo() {
  return (
    <View style={{ alignSelf: 'center', marginTop: 4, marginBottom: 8 }}>
      <Image source={LOGO} contentFit="contain" style={{ width: 56, height: 56 }} accessibilityLabel="PlanNplate" />
    </View>
  );
}

function Checklist({ items, ink }: { items: string[]; ink: string }) {
  return (
    <View style={[styles.card, { backgroundColor: TINT }]}>
      {items.map((label, i) => (
        <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: i === 0 ? 0 : 10 }}>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: designTokens.colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Check size={13} color="#FFFFFF" strokeWidth={3} />
          </View>
          <Text style={{ flex: 1, fontFamily: designTokens.font.regular, fontSize: 14, color: ink }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function PrimaryButton({
  label,
  sub,
  icon,
  busy,
  busyLabel,
  onPress,
}: {
  label: string;
  sub?: string;
  icon?: 'play' | 'crown';
  busy?: boolean;
  busyLabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button">
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            minHeight: 56,
            paddingVertical: 12,
            paddingHorizontal: 20,
            borderRadius: 18,
            backgroundColor: designTokens.colors.brand,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          }}
        >
          {busy ? (
            <>
              <ActivityIndicator color={designTokens.colors.cream} />
              <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 15.5, color: designTokens.colors.cream }}>
                {busyLabel ?? 'Loading…'}
              </Text>
            </>
          ) : (
            <>
              {icon && <ButtonIcon kind={icon} light />}
              <View style={{ alignItems: sub ? 'flex-start' : 'center' }}>
                <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 15.5, color: designTokens.colors.cream }}>
                  {label}
                </Text>
                {sub ? (
                  <Text style={{ fontFamily: designTokens.font.regular, fontSize: 12.5, color: 'rgba(250,247,240,0.8)', marginTop: 1 }}>
                    {sub}
                  </Text>
                ) : null}
              </View>
            </>
          )}
        </View>
      )}
    </Pressable>
  );
}

function OutlineButton({
  label,
  sub,
  icon,
  busy,
  onPress,
  colors,
}: {
  label: string;
  sub?: string;
  icon: 'play' | 'crown';
  busy?: boolean;
  onPress: () => void;
  colors: ReturnType<typeof getThemeColors>;
}) {
  return (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button">
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            minHeight: 60,
            paddingVertical: 12,
            paddingHorizontal: 18,
            borderRadius: 18,
            borderWidth: 1.5,
            borderColor: colors.hair,
            backgroundColor: colors.bg,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          }}
        >
          {busy ? <ActivityIndicator color={designTokens.colors.brand} /> : <ButtonIcon kind={icon} />}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 15, color: colors.ink }}>{label}</Text>
            {sub ? (
              <Text style={{ fontFamily: designTokens.font.regular, fontSize: 12.5, color: colors.ink2, marginTop: 1 }}>
                {sub}
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}

function ButtonIcon({ kind, light }: { kind: 'play' | 'crown'; light?: boolean }) {
  if (kind === 'crown') {
    return <Crown size={22} color={light ? designTokens.colors.cream : designTokens.colors.ink} strokeWidth={1.7} />;
  }
  return (
    <View
      style={{
        width: 30,
        height: 24,
        borderRadius: 6,
        backgroundColor: light ? '#FFFFFF' : designTokens.colors.brand,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Play
        size={12}
        color={light ? designTokens.colors.brand : '#FFFFFF'}
        fill={light ? designTokens.colors.brand : '#FFFFFF'}
        strokeWidth={1.8}
        style={{ marginLeft: 2 }}
      />
    </View>
  );
}

function OrDivider({ color }: { color: string }) {
  return (
    <Text style={{ textAlign: 'center', fontFamily: designTokens.font.medium, fontSize: 12.5, color, marginVertical: 10, letterSpacing: 0.6 }}>
      OR
    </Text>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 22,
    paddingBottom: 36,
  },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 40, height: 5, borderRadius: 999, backgroundColor: '#D8D4C9' },
  close: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  title: {
    fontFamily: designTokens.font.semibold,
    fontSize: 21,
    lineHeight: 27,
    letterSpacing: -0.4,
    textAlign: 'center',
    marginTop: 4,
  },
  body: {
    fontFamily: designTokens.font.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 8,
  },
  card: { borderRadius: 16, padding: 16, marginTop: 18 },
  track: { height: 6, borderRadius: 999, marginTop: 10, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999, backgroundColor: designTokens.colors.brand },
});
