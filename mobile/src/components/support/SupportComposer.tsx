// SupportComposer — the sheet where support actually happens.
//
// Mounted once in app/_layout.tsx beside PaywallSheet and FailureHost, and
// raised from anywhere with `openSupportComposer({ intent, feature })`. Roughly
// nine in ten support interactions should start and end here; the Help screen
// exists mostly to point at it.
//
// The design argument for a sheet rather than a screen: someone reporting a bug
// is interrupted, not navigating. A sheet keeps the thing they were doing
// visible behind it and returns them to it, rather than pushing them somewhere
// they then have to find their way back from.
//
// Three states, one component: composing → sending → sent. The confirmation
// replaces the content in place rather than pushing a success screen, because a
// success screen is a destination and this isn't a journey.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  FadeIn,
  FadeOut,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Check, ImagePlus, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { designTokens, easing, getThemeColors } from '@/lib/design-tokens';
import { useColorScheme } from '@/lib/useColorScheme';
import { presentFailure } from '@/lib/failure';
import { supportCopy, confirmationBody } from '@/lib/support/copy';
import { describeDiagnostics } from '@/lib/support/diagnostics-policy';
import { replyAddress } from '@/lib/support/diagnostics';
import { signedAttachmentUrl, submitSupportRequest } from '@/lib/support/api';
import { pickScreenshot, uploadScreenshot } from '@/lib/support/attachments';
import { supportAnalytics } from '@/lib/support/analytics';
import { useSupportComposer } from '@/lib/support/store';

/** Characters after which question/idea also offer a screenshot. */
const SCREENSHOT_HINT_THRESHOLD = 40;

type Phase = 'composing' | 'sending' | 'sent';

export function SupportComposer() {
  const isDark = useColorScheme() === 'dark';
  const colors = getThemeColors(isDark);

  const isOpen = useSupportComposer((s) => s.isOpen);
  const request = useSupportComposer((s) => s.request);
  const diagnostics = useSupportComposer((s) => s.diagnostics);
  const draft = useSupportComposer((s) => s.draft);
  const attachments = useSupportComposer((s) => s.attachments);
  const setDraft = useSupportComposer((s) => s.setDraft);
  const addAttachment = useSupportComposer((s) => s.addAttachment);
  const removeAttachment = useSupportComposer((s) => s.removeAttachment);
  const close = useSupportComposer((s) => s.close);
  const reset = useSupportComposer((s) => s.reset);

  const [phase, setPhase] = useState<Phase>('composing');
  const [uploading, setUploading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const intent = request?.intent ?? 'bug';
  const intentCopy = supportCopy.intents[intent];
  const canSend = draft.trim().length > 0 && phase === 'composing';

  // Screenshot is offered up front for bugs. For questions and ideas it only
  // appears once there's something written, because most of those don't need
  // one and an unused affordance is just noise above the send button.
  const offerScreenshot =
    intent === 'bug' || draft.trim().length >= SCREENSHOT_HINT_THRESHOLD;

  // ── Reset transient UI whenever the sheet opens ──────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setPhase('composing');
    setShowDetails(false);
    // Autofocus after the sheet's slide-in; focusing during the animation
    // fights the transition on Android and drops the keyboard on iOS.
    const t = setTimeout(() => inputRef.current?.focus(), 320);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const handleClose = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    // A sent message is done with; a draft is kept so a re-open resumes it.
    if (phase === 'sent') reset();
    close();
  }, [phase, reset, close]);

  const handleAttach = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const picked = await pickScreenshot();
    if (!picked.ok) {
      presentFailure(picked.failure);
      return;
    }
    if (!picked.value) return; // Backed out — not a failure.

    setUploading(true);
    const uploaded = await uploadScreenshot(picked.value);
    setUploading(false);

    if (!uploaded.ok) {
      presentFailure(uploaded.failure);
      return;
    }

    addAttachment(uploaded.value);
    supportAnalytics.screenshotAttached({ intent });
  }, [addAttachment, intent]);

  const handleSend = useCallback(async () => {
    if (!request || !canSend) return;

    const message = draft.trim();
    setPhase('sending');
    inputRef.current?.blur();

    const result = await submitSupportRequest({
      intent: request.intent,
      message,
      feature: request.feature,
      context: (diagnostics ?? {}) as unknown as Record<string, unknown>,
      attachments,
    });

    if (!result.ok) {
      // Back to composing with every word intact. The draft lives in the
      // store precisely so this path costs the user nothing.
      setPhase('composing');
      supportAnalytics.submitFailed({ intent: request.intent, category: result.failure.category });
      presentFailure(
        {
          ...result.failure,
          title: supportCopy.sendFailed.title,
          body: supportCopy.sendFailed.body,
          action: { kind: 'retry', label: supportCopy.sendFailed.action },
        },
        handleSend,
      );
      return;
    }

    supportAnalytics.submitted({
      intent: request.intent,
      feature: request.feature,
      chars: message.length,
      hasAttachment: attachments.length > 0,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase('sent');

    // Let the confirmation land, then get out of the way. Someone who wants to
    // read it twice can — any tap cancels the timer via handleClose.
    dismissTimer.current = setTimeout(() => {
      reset();
      close();
    }, 4200);
  }, [request, canSend, draft, diagnostics, attachments, reset, close]);

  if (!request) return null;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <Pressable
          onPress={handleClose}
          style={{ flex: 1, backgroundColor: 'rgba(21,20,15,0.45)', justifyContent: 'flex-end' }}
          accessibilityLabel={supportCopy.composer.close}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.bg,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              paddingTop: 10,
              paddingBottom: 28,
              paddingHorizontal: 22,
            }}
          >
            {/* Grabber */}
            <View
              style={{
                alignSelf: 'center',
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.hair,
                marginBottom: 18,
              }}
              importantForAccessibility="no"
            />

            {phase === 'sent' ? (
              <Confirmation onDone={handleClose} isDark={isDark} />
            ) : (
              <Animated.View exiting={FadeOut.duration(160)}>
                <Text
                  accessibilityRole="header"
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 22,
                    letterSpacing: -0.5,
                    color: colors.ink,
                    marginBottom: 14,
                  }}
                >
                  {intentCopy.title}
                </Text>

                <TextInput
                  ref={inputRef}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={intentCopy.placeholder}
                  placeholderTextColor={colors.ink3}
                  multiline
                  editable={phase === 'composing'}
                  textAlignVertical="top"
                  accessibilityLabel={intentCopy.title}
                  style={{
                    minHeight: 120,
                    maxHeight: 240,
                    backgroundColor: colors.pill,
                    borderRadius: 18,
                    paddingHorizontal: 16,
                    paddingTop: 14,
                    paddingBottom: 14,
                    fontFamily: designTokens.font.regular,
                    fontSize: 16,
                    lineHeight: 23,
                    color: colors.ink,
                  }}
                />

                {/* ── Attachments ───────────────────────────────────────── */}
                {attachments.length > 0 && (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                    {attachments.map((a) => (
                      <AttachmentThumb
                        key={a.path}
                        path={a.path}
                        onRemove={() => removeAttachment(a.path)}
                        isDark={isDark}
                      />
                    ))}
                  </View>
                )}

                {offerScreenshot && attachments.length === 0 && (
                  <Animated.View entering={FadeIn.duration(200)}>
                    <Pressable
                      onPress={handleAttach}
                      disabled={uploading || phase !== 'composing'}
                      accessibilityRole="button"
                      accessibilityLabel={supportCopy.composer.attach}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        minHeight: 44,
                        marginTop: 6,
                      }}
                    >
                      {uploading ? (
                        <ActivityIndicator size="small" color={designTokens.colors.ink3} />
                      ) : (
                        <ImagePlus size={16} color={colors.ink2} strokeWidth={1.8} />
                      )}
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 14,
                          color: colors.ink2,
                        }}
                      >
                        {supportCopy.composer.attach}
                      </Text>
                    </Pressable>
                  </Animated.View>
                )}

                {/* ── Disclosure ────────────────────────────────────────────
                    Tappable, inline, and derived from the payload that
                    actually gets sent — so the list can't drift from reality. */}
                <Pressable
                  onPress={() => setShowDetails((v) => !v)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={supportCopy.composer.disclosureTitle}
                  style={{ marginTop: 10, minHeight: 36, justifyContent: 'center' }}
                >
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 12.5,
                      lineHeight: 18,
                      color: colors.ink3,
                    }}
                  >
                    {supportCopy.composer.disclosureLead}{' '}
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        color: designTokens.colors.brand,
                        textDecorationLine: 'underline',
                      }}
                    >
                      {supportCopy.composer.disclosureLink}
                    </Text>
                    .
                  </Text>
                </Pressable>

                {showDetails && diagnostics && (
                  <Animated.View
                    entering={FadeInDown.duration(200)}
                    style={{
                      marginTop: 4,
                      marginBottom: 4,
                      padding: 14,
                      borderRadius: 14,
                      backgroundColor: colors.surfaceMuted,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 12.5,
                        lineHeight: 19,
                        color: colors.ink2,
                        marginBottom: 8,
                      }}
                    >
                      {supportCopy.composer.disclosureBody}
                    </Text>
                    {describeDiagnostics(diagnostics).map((line) => (
                      <Text
                        key={line}
                        style={{
                          fontFamily: designTokens.font.regular,
                          fontSize: 12,
                          lineHeight: 18,
                          color: colors.ink3,
                        }}
                      >
                        {line}
                      </Text>
                    ))}
                  </Animated.View>
                )}

                {/* ── Send ──────────────────────────────────────────────── */}
                <Pressable
                  onPress={handleSend}
                  disabled={!canSend}
                  accessibilityRole="button"
                  accessibilityLabel={supportCopy.composer.send}
                  accessibilityState={{ disabled: !canSend }}
                  style={{
                    marginTop: 14,
                    height: 52,
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: canSend
                      ? designTokens.colors.brand
                      : colors.hair,
                  }}
                >
                  {phase === 'sending' ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 15.5,
                        letterSpacing: -0.2,
                        color: canSend ? '#FFFFFF' : colors.ink3,
                      }}
                    >
                      {supportCopy.composer.send}
                    </Text>
                  )}
                </Pressable>
              </Animated.View>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Confirmation ───────────────────────────────────────────────────────────
// Replaces the composer's content in place. The four things it has to say, in
// the order someone cares about them: we have it, a person will read it, when,
// and where the reply lands.

function Confirmation({ onDone, isDark }: { onDone: () => void; isDark: boolean }) {
  const colors = getThemeColors(isDark);
  const email = replyAddress();

  // The check scales in with the house ease-out. Reanimated rather than a
  // Lottie: one shared value is cheaper than a JSON animation for a mark that
  // shows for four seconds.
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 220 });
    scale.value = withTiming(1, {
      duration: 320,
      easing: Easing.bezier(...easing.outStrong),
    });
  }, [opacity, scale]);

  const markStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={{ alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8 }}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${supportCopy.confirmation.title} ${confirmationBody(email)}`}
    >
      <Animated.View
        style={[
          {
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDark ? 'rgba(107,122,87,0.22)' : 'rgba(84,100,69,0.10)',
            marginBottom: 18,
          },
          markStyle,
        ]}
        importantForAccessibility="no-hide-descendants"
      >
        <Check size={26} color={designTokens.colors.brand} strokeWidth={2.2} />
      </Animated.View>

      <Text
        style={{
          fontFamily: designTokens.font.semibold,
          fontSize: 22,
          letterSpacing: -0.5,
          color: colors.ink,
          marginBottom: 8,
        }}
      >
        {supportCopy.confirmation.title}
      </Text>

      <Text
        style={{
          fontFamily: designTokens.font.regular,
          fontSize: 14.5,
          lineHeight: 21,
          textAlign: 'center',
          color: colors.ink2,
          marginBottom: 22,
        }}
      >
        {confirmationBody(email)}
      </Text>

      <Pressable
        onPress={onDone}
        accessibilityRole="button"
        accessibilityLabel={supportCopy.confirmation.action}
        style={{
          minHeight: 48,
          paddingHorizontal: 26,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: designTokens.font.medium,
            fontSize: 15,
            color: colors.ink2,
          }}
        >
          {supportCopy.confirmation.action}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ── Attachment thumbnail ───────────────────────────────────────────────────

function AttachmentThumb({
  path,
  onRemove,
  isDark,
}: {
  path: string;
  onRemove: () => void;
  isDark: boolean;
}) {
  const colors = getThemeColors(isDark);
  const [uri, setUri] = useState<string | null>(null);

  // The bucket is private, so even our own thumbnail needs a signed URL.
  useEffect(() => {
    let alive = true;
    signedAttachmentUrl(path).then((url) => {
      if (alive) setUri(url);
    });
    return () => {
      alive = false;
    };
  }, [path]);

  return (
    <View>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: colors.pill,
        }}
      >
        {uri && (
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        )}
      </View>
      <Pressable
        onPress={onRemove}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={supportCopy.composer.attachRemove}
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: designTokens.colors.ink,
        }}
      >
        <X size={12} color="#FFFFFF" strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}
