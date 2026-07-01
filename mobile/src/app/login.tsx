// Login — editorial hero redesign.
// Visual-only: every store call, useState, useEffect, useFocusEffect, useCallback, route,
// and haptic from the previous version is preserved verbatim.
// One italic word per surface (time-of-day accent on the hero + "password" in Forgot modal).
import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Modal,
  Dimensions,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  X,
  CheckCircle,
  ArrowRight,
  AlertTriangle,
  Leaf,
  Flame,
  Droplet,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useAuthStore } from '@/lib/auth-store';
import { useMealPlanStore } from '@/lib/store';
import { designTokens } from '@/lib/design-tokens';
import { useColorScheme } from '@/lib/useColorScheme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Editorial hero — bundled autoplay looping cooking video. Local require()
// (not a remote URL) so it plays instantly from disk with no network fetch.
const HERO_VIDEO = require('../../assets/videos/hero.mp4');

function getTimeOfDayGreeting(): { greeting: string; accent: string } {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return { greeting: 'Good', accent: 'morning' };
  if (h >= 12 && h < 17) return { greeting: 'Good', accent: 'afternoon' };
  if (h >= 17 && h < 22) return { greeting: 'Good', accent: 'evening' };
  return { greeting: 'Welcome', accent: 'back' };
}

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const sendPasswordResetOTP = useAuthStore((s) => s.sendPasswordResetOTP);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // AUTH-LAST: a guest may open login (via "already have an account") while on
  // an anonymous session. Only bounce REAL signed-in users to home — keep the
  // anonymous guest on the login screen so they can sign into their account.
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  // Guest who already finished onboarding has a local setup that signing into
  // an existing account would replace — used to warn before discarding it.
  const hasGuestSetup = useMealPlanStore((s) => s.preferences.hasCompletedOnboarding);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  // When opened deliberately ("Sign in" on the welcome screen passes reauth=1),
  // never auto-bounce away — even an already-signed-in user wants the form.
  // `forgot=1` (from signup's "Forgot password?") auto-opens the OTP reset
  // modal; `email` prefills the form.
  const { reauth, forgot, email: emailParam } = useLocalSearchParams<{
    reauth?: string;
    forgot?: string;
    email?: string;
  }>();

  // If a real account is already signed in, redirect to home — unless the user
  // explicitly came here to sign in / switch accounts.
  React.useEffect(() => {
    if (reauth === '1') return;
    if (isAuthenticated && !isAnonymous) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isAnonymous, router, reauth]);

  // Reset password visibility when screen comes into focus (security)
  useFocusEffect(
    useCallback(() => {
      setShowPassword(false);
    }, [])
  );

  // Prefill the email + (when arriving from signup's "Forgot password?") open
  // the OTP reset modal automatically, once per navigation.
  const forgotHandledRef = useRef(false);
  React.useEffect(() => {
    if (typeof emailParam === 'string' && emailParam) {
      setEmail(emailParam);
    }
    if (forgot === '1' && !forgotHandledRef.current) {
      forgotHandledRef.current = true;
      setResetEmail(typeof emailParam === 'string' ? emailParam : '');
      setResetError('');
      setResetSuccess(false);
      setShowForgotModal(true);
    }
  }, [forgot, emailParam]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Confirm before a guest's local setup is replaced by an existing account.
  const [showGuestWarning, setShowGuestWarning] = useState(false);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Field refs — for return-key chaining
  const passwordRef = useRef<TextInput>(null);

  // Button animation (preserved)
  const buttonScale = useSharedValue(1);
  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handlePressIn = useCallback(() => {
    buttonScale.value = withSpring(0.96);
  }, []);

  const handlePressOut = useCallback(() => {
    buttonScale.value = withSpring(1);
  }, []);

  const performLogin = useCallback(async () => {
    setShowGuestWarning(false);
    setError('');
    setIsLoading(true);

    const result = await login(email, password);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.error || 'Login failed');
    }

    setIsLoading(false);
  }, [email, password, login, router]);

  const handleLogin = useCallback(() => {
    // If a guest finished onboarding on this device, signing into an existing
    // account would replace that local setup with the account's saved data.
    // Confirm first; otherwise sign in straight away.
    if (isAnonymous && hasGuestSetup) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setShowGuestWarning(true);
      return;
    }
    performLogin();
  }, [isAnonymous, hasGuestSetup, performLogin]);

  const navigateToSignup = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/signup');
  }, [router]);

  const openForgotModal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setResetEmail(email);
    setResetError('');
    setResetSuccess(false);
    setShowForgotModal(true);
  }, [email]);

  const closeForgotModal = useCallback(() => {
    setShowForgotModal(false);
    setResetEmail('');
    setResetError('');
    setResetSuccess(false);
  }, []);

  const handleForgotPassword = useCallback(async () => {
    setResetError('');
    setIsResetting(true);

    const result = await sendPasswordResetOTP(resetEmail);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResetSuccess(true);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setResetError(result.error || 'Failed to send OTP');
    }

    setIsResetting(false);
  }, [resetEmail, sendPasswordResetOTP]);

  // ── Token-driven styles ────────────────────────────────────────────────
  const surfaceBg = isDark ? '#1a1a1a' : '#FFFFFF';
  const cardBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const inkPrimary = isDark ? '#fff' : designTokens.colors.ink;
  const inkSecondary = isDark ? '#888' : designTokens.colors.ink2;
  const inkTertiary = isDark ? '#666' : designTokens.colors.ink3;

  const eyebrowStyle = {
    fontFamily: designTokens.font.medium,
    fontSize: 11,
    letterSpacing: 0.55,
    textTransform: 'uppercase' as const,
    color: inkTertiary,
    marginBottom: 8,
  };

  const fieldShellStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: cardBorder,
    backgroundColor: cardBg,
  };
  const focusedShellStyle = (focused: boolean) => ({
    ...fieldShellStyle,
    borderWidth: focused ? 1.5 : 1,
    borderColor: focused ? designTokens.colors.brand : cardBorder,
  });

  const { greeting, accent } = getTimeOfDayGreeting();
  const HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.38);
  const pageBg = isDark ? '#1a1a1a' : designTokens.colors.cream;

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        extraKeyboardSpace={0}
      >
          {/* ── Editorial hero (autoplay video + dark overlays) ─────── */}
          <View style={{ width: SCREEN_WIDTH, height: HERO_HEIGHT, backgroundColor: '#181612' }}>
            <Animated.View style={{ flex: 1 }}>
              <Video
                source={HERO_VIDEO}
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#181612',
                }}
                resizeMode={ResizeMode.COVER}
                shouldPlay
                isLooping
                isMuted
              />
              {/* Overall dark veil — keeps text legible regardless of video frame */}
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(21,20,15,0.35)',
                }}
                pointerEvents="none"
              />
              {/* Top scrim — status-bar legibility */}
              <LinearGradient
                colors={['rgba(21,20,15,0.55)', 'transparent']}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120 }}
                pointerEvents="none"
              />
              {/* Bottom pedestal — headline + tagline emphasis */}
              <LinearGradient
                colors={['transparent', 'rgba(21,20,15,0.80)']}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 240 }}
                pointerEvents="none"
              />
            </Animated.View>

            {/* Overlay: brand eyebrow + greeting + tagline */}
            <SafeAreaView
              edges={['top']}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
              pointerEvents="none"
            >
              <View
                style={{
                  flex: 1,
                  justifyContent: 'flex-end',
                  paddingHorizontal: 24,
                  paddingBottom: 56,
                }}
              >
                <Animated.View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: designTokens.colors.olive,
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 11,
                        letterSpacing: 0.8,
                        textTransform: 'uppercase',
                        color: 'rgba(246,242,233,0.85)',
                      }}
                    >
                      PlannPlate
                    </Text>
                  </View>

                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 26,
                      color: '#F6F2E9',
                      letterSpacing: -0.52,
                    }}
                  >
                    {greeting}{' '}
                    <Text
                      style={{
                        fontFamily: designTokens.font.serifItalic,
                        fontStyle: 'italic',
                        fontSize: 30,
                        letterSpacing: -0.3,
                      }}
                    >
                      {accent}
                    </Text>
                  </Text>
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 14.5,
                      color: 'rgba(246,242,233,0.80)',
                      marginTop: 6,
                    }}
                  >
                    Your kitchen is ready.
                  </Text>
                </Animated.View>
              </View>
            </SafeAreaView>
          </View>

          {/* ── Layered form card (overlaps the hero) ─────────────────── */}
          <Animated.View
            style={{
              marginHorizontal: 20,
              marginTop: -26,
              padding: 22,
              paddingTop: 26,
              paddingBottom: 28,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: cardBorder,
              backgroundColor: cardBg,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.08,
              shadowRadius: 18,
              elevation: 6,
              position: 'relative',
            }}
          >
            {/* Atmospheric ingredient marks — purely decorative */}
            <View
              style={{
                position: 'absolute',
                top: 18,
                right: 22,
                opacity: 0.08,
              }}
              pointerEvents="none"
            >
              <Leaf size={20} color={designTokens.colors.brand} strokeWidth={1.8} />
            </View>
            <View
              style={{
                position: 'absolute',
                bottom: 90,
                left: 18,
                opacity: 0.10,
              }}
              pointerEvents="none"
            >
              <Droplet size={16} color="#88A4C2" strokeWidth={1.8} />
            </View>
            <View
              style={{
                position: 'absolute',
                top: 140,
                right: 18,
                opacity: 0.09,
              }}
              pointerEvents="none"
            >
              <Flame size={14} color={designTokens.colors.olive} strokeWidth={1.8} />
            </View>

            {/* Top-edge inner highlight */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 1,
                backgroundColor: isDark ? '#2a2a2a' : 'rgba(255,255,255,0.7)',
              }}
            />

            {/* Error banner */}
            {error ? (
              <Animated.View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: 11,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: cardBorder,
                  backgroundColor: isDark ? '#181818' : designTokens.colors.cream,
                  marginBottom: 14,
                }}
              >
                <AlertTriangle size={14} color={designTokens.colors.olive} strokeWidth={1.8} />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: designTokens.font.medium,
                    fontSize: 12.5,
                    color: inkPrimary,
                  }}
                >
                  {error}
                </Text>
              </Animated.View>
            ) : null}

            {/* Email */}
            <View style={{ marginBottom: 14 }}>
              <Text style={eyebrowStyle}>Email</Text>
              <View style={focusedShellStyle(focusedField === 'email')}>
                <Mail
                  size={16}
                  color={focusedField === 'email' ? designTokens.colors.brand : inkTertiary}
                  strokeWidth={1.8}
                />
                <TextInput
                  style={{
                    flex: 1,
                    fontFamily: designTokens.font.regular,
                    fontSize: 15,
                    color: inkPrimary,
                    padding: 0,
                  }}
                  placeholder="your@email.com"
                  placeholderTextColor={inkTertiary}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!isLoading}
                />
              </View>
            </View>

            {/* Password */}
            <View style={{ marginBottom: 8 }}>
              <Text style={eyebrowStyle}>Password</Text>
              <View style={focusedShellStyle(focusedField === 'password')}>
                <Lock
                  size={16}
                  color={focusedField === 'password' ? designTokens.colors.brand : inkTertiary}
                  strokeWidth={1.8}
                />
                <TextInput
                  ref={passwordRef}
                  style={{
                    flex: 1,
                    fontFamily: designTokens.font.regular,
                    fontSize: 15,
                    color: inkPrimary,
                    padding: 0,
                  }}
                  placeholder="Enter your password"
                  placeholderTextColor={inkTertiary}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  editable={!isLoading}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
                  {showPassword ? (
                    <EyeOff size={16} color={inkTertiary} strokeWidth={1.8} />
                  ) : (
                    <Eye size={16} color={inkTertiary} strokeWidth={1.8} />
                  )}
                </Pressable>
              </View>
            </View>

            {/* Forgot link */}
            <View style={{ alignItems: 'flex-end', marginBottom: 20 }}>
              <Pressable onPress={openForgotModal} hitSlop={10}>
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 13,
                    color: inkSecondary,
                  }}
                >
                  Forgot it?
                </Text>
              </Pressable>
            </View>

            {/* Primary CTA */}
            <Animated.View style={buttonAnimatedStyle}>
              <Pressable
                onPress={handleLogin}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                disabled={isLoading}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 15,
                  borderRadius: 999,
                  backgroundColor: designTokens.colors.brand,
                  opacity: isLoading ? 0.85 : 1,
                }}
              >
                {isLoading ? (
                  <ActivityIndicator color={designTokens.colors.cream} size="small" />
                ) : (
                  <>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 15,
                        color: designTokens.colors.cream,
                      }}
                    >
                      Sign in
                    </Text>
                    <ArrowRight size={16} color={designTokens.colors.cream} strokeWidth={1.8} />
                  </>
                )}
              </Pressable>
            </Animated.View>

            {/* Secondary CTA — hair-bordered ghost pill for new accounts */}
            <Pressable
              onPress={navigateToSignup}
              disabled={isLoading}
              style={{
                marginTop: 10,
                paddingVertical: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: cardBorder,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isDark ? '#181818' : '#FFFFFF',
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 14,
                  color: isDark ? '#ddd' : designTokens.colors.ink2,
                }}
              >
                Create an account
              </Text>
            </Pressable>
          </Animated.View>

          {/* ── Footer band — "what's inside" benefit row + brand mark ─── */}
          <Animated.View
            style={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 8 }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 14,
                marginBottom: 22,
              }}
            >
              {[
                { Icon: Leaf, label: 'Smart\nmeal plans', tint: designTokens.colors.brand },
                { Icon: Flame, label: 'PNP cooks\nwith you', tint: designTokens.colors.olive },
                { Icon: Droplet, label: 'Grocery\nmade easy', tint: '#88A4C2' },
              ].map(({ Icon, label, tint }, idx) => (
                <View key={idx} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: cardBorder,
                      backgroundColor: cardBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={16} color={tint} strokeWidth={1.8} />
                  </View>
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 11.5,
                      lineHeight: 15,
                      color: isDark ? '#bbb' : designTokens.colors.ink2,
                      textAlign: 'center',
                    }}
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </View>

            <View
              style={{
                height: 1,
                backgroundColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                marginHorizontal: 80,
                marginBottom: 14,
              }}
            />
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 11,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                color: isDark ? '#666' : designTokens.colors.ink3,
                textAlign: 'center',
              }}
            >
              PlannPlate · Made for home cooks
            </Text>
          </Animated.View>
      </KeyboardAwareScrollView>

      {/* ── Replace-guest-setup confirmation ──────────────────────────── */}
      <Modal
        visible={showGuestWarning}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGuestWarning(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 24,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 380,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: cardBorder,
              backgroundColor: cardBg,
              paddingHorizontal: 22,
              paddingTop: 22,
              paddingBottom: 18,
            }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 19,
                color: inkPrimary,
                letterSpacing: -0.38,
                marginBottom: 10,
              }}
            >
              Replace guest setup?
            </Text>
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 14.5,
                color: inkSecondary,
                lineHeight: 21,
                marginBottom: 20,
              }}
            >
              You set up a meal plan as a guest on this device. Signing into an existing account will replace it with that account's saved data — your guest setup won't be kept.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowGuestWarning(false);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: cardBorder,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 15, color: inkPrimary }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={performLogin}
                disabled={isLoading}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 14,
                  backgroundColor: designTokens.colors.olive,
                  alignItems: 'center',
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 15, color: '#FFFFFF' }}>
                  {isLoading ? 'Signing in…' : 'Continue'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Forgot Password Modal (preserved flow) ────────────────────── */}
      <Modal
        visible={showForgotModal}
        transparent
        animationType="fade"
        onRequestClose={closeForgotModal}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 24,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 380,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: cardBorder,
              backgroundColor: cardBg,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                paddingTop: 18,
                paddingBottom: 14,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 19,
                  color: inkPrimary,
                  letterSpacing: -0.38,
                }}
              >
                Reset{' '}
                <Text
                  style={{
                    fontFamily: designTokens.font.serifItalic,
                    fontStyle: 'italic',
                    fontSize: 22,
                    letterSpacing: -0.22,
                  }}
                >
                  password
                </Text>
              </Text>
              <Pressable
                onPress={closeForgotModal}
                hitSlop={10}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: cardBorder,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} color={inkPrimary} strokeWidth={1.8} />
              </Pressable>
            </View>

            <View style={{ paddingHorizontal: 20, paddingBottom: 22 }}>
              {resetSuccess ? (
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <View
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 32,
                      backgroundColor: isDark ? 'rgba(84,100,69,0.20)' : '#E8ECDF',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 18,
                    }}
                  >
                    <CheckCircle size={30} color={designTokens.colors.brand} strokeWidth={1.6} />
                  </View>
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 16,
                      color: inkPrimary,
                      textAlign: 'center',
                      marginBottom: 6,
                    }}
                  >
                    Check your email
                  </Text>
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 13.5,
                      color: inkSecondary,
                      textAlign: 'center',
                      marginBottom: 22,
                      lineHeight: 20,
                    }}
                  >
                    We've sent a 6-digit OTP to{'\n'}
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        color: inkPrimary,
                      }}
                    >
                      {resetEmail}
                    </Text>
                  </Text>
                  <Pressable
                    onPress={() => {
                      closeForgotModal();
                      router.push({
                        pathname: '/verify-otp',
                        params: { email: resetEmail },
                      });
                    }}
                    style={{
                      paddingVertical: 13,
                      paddingHorizontal: 32,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.brand,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 14,
                        color: designTokens.colors.cream,
                      }}
                    >
                      Enter OTP
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 13.5,
                      color: inkSecondary,
                      lineHeight: 20,
                      marginBottom: 16,
                    }}
                  >
                    Enter your email and we'll send you a 6-digit OTP to reset your password.
                  </Text>

                  {resetError ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        padding: 12,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: cardBorder,
                        backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
                        marginBottom: 14,
                      }}
                    >
                      <AlertTriangle size={14} color={designTokens.colors.olive} strokeWidth={1.8} />
                      <Text
                        style={{
                          flex: 1,
                          fontFamily: designTokens.font.medium,
                          fontSize: 12.5,
                          color: inkPrimary,
                        }}
                      >
                        {resetError}
                      </Text>
                    </View>
                  ) : null}

                  <View style={[focusedShellStyle(focusedField === 'reset'), { marginBottom: 14 }]}>
                    <Mail
                      size={16}
                      color={focusedField === 'reset' ? designTokens.colors.brand : inkTertiary}
                      strokeWidth={1.8}
                    />
                    <TextInput
                      style={{
                        flex: 1,
                        fontFamily: designTokens.font.regular,
                        fontSize: 15,
                        color: inkPrimary,
                        padding: 0,
                      }}
                      placeholder="your@email.com"
                      placeholderTextColor={inkTertiary}
                      value={resetEmail}
                      onChangeText={setResetEmail}
                      onFocus={() => setFocusedField('reset')}
                      onBlur={() => setFocusedField(null)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      returnKeyType="send"
                      onSubmitEditing={handleForgotPassword}
                      editable={!isResetting}
                      autoFocus
                    />
                  </View>

                  <Pressable
                    onPress={handleForgotPassword}
                    disabled={isResetting || !resetEmail.trim()}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      paddingVertical: 13,
                      borderRadius: 999,
                      backgroundColor:
                        isResetting || !resetEmail.trim()
                          ? isDark
                            ? '#2a2a2a'
                            : designTokens.colors.hair2
                          : designTokens.colors.brand,
                    }}
                  >
                    {isResetting ? (
                      <ActivityIndicator color={designTokens.colors.cream} size="small" />
                    ) : (
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 14,
                          color:
                            isResetting || !resetEmail.trim()
                              ? inkTertiary
                              : designTokens.colors.cream,
                        }}
                      >
                        Send OTP
                      </Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
