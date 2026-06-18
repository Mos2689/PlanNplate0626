// Signup — editorial hero redesign (matches login.tsx).
// Visual-only: every store call, useState, useCallback, validation (validateName,
// validatePassword, handleNameBlur), route, and haptic from the previous version
// is preserved verbatim. One italic word per surface ("started" in the hero).
import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Keyboard,
  Dimensions,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Check,
  Info,
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
import { useSubscriptionStore } from '@/lib/subscription-store';
import { designTokens } from '@/lib/design-tokens';
import { useColorScheme } from '@/lib/useColorScheme';
import { logMetaEvent } from '@/lib/meta-sdk';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Editorial hero — bundled autoplay looping cooking video. Local require()
// (not a remote URL) so it plays instantly from disk with no network fetch.
const HERO_VIDEO = require('../../assets/videos/hero.mp4');

// Requirement item — sage-when-met, hair-outlined otherwise (line-through on met).
const RequirementItem = ({
  label,
  met,
  isDark,
}: {
  label: string;
  met: boolean;
  isDark: boolean;
}) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: met ? 0 : 1,
        borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
        backgroundColor: met
          ? designTokens.colors.brand
          : isDark
            ? '#1a1a1a'
            : '#FFFFFF',
      }}
    >
      {met ? (
        <Check size={11} color={designTokens.colors.cream} strokeWidth={2.4} />
      ) : null}
    </View>
    <Text
      style={{
        fontFamily: designTokens.font.regular,
        fontSize: 13,
        color: met
          ? isDark
            ? '#666'
            : designTokens.colors.ink3
          : isDark
            ? '#bbb'
            : designTokens.colors.ink2,
        textDecorationLine: met ? 'line-through' : 'none',
      }}
    >
      {label}
    </Text>
  </View>
);

export default function SignupScreen() {
  const router = useRouter();
  const signUp = useAuthStore((s) => s.signUp);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // AUTH-LAST: a guest reaches this screen while authenticated-but-anonymous,
  // so only bounce REAL (non-anonymous) signed-in users away from signup.
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  const showPostSignupWelcome = useSubscriptionStore((s) => s.showPostSignupWelcome);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // If a real account is already signed in, redirect to home.
  React.useEffect(() => {
    if (isAuthenticated && !isAnonymous) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isAnonymous, router]);

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'fair' | 'good' | 'strong'>('weak');
  const [passwordValidation, setPasswordValidation] = useState({
    minLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    noCommonPassword: false,
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailExists, setEmailExists] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Field refs — for return-key chaining (Next → next input without dismissing keyboard)
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  // Name validation constants
  const MAX_NAME_LENGTH = 50;
  const MIN_NAME_LENGTH = 2;

  // Validate and sanitize name input (preserved verbatim)
  const validateName = useCallback((value: string): { isValid: boolean; error: string; sanitized: string } => {
    let sanitized = value.replace(/[^\p{L}\s'-]/gu, '');
    sanitized = sanitized.replace(/\s+/g, ' ');
    const trimmed = sanitized.trim();

    if (!trimmed) {
      return { isValid: false, error: 'Full name is required', sanitized };
    }
    if (trimmed.length < MIN_NAME_LENGTH) {
      return { isValid: false, error: 'Name must be at least 2 characters', sanitized };
    }
    if (/^[\s'-]+$/.test(trimmed)) {
      return { isValid: false, error: 'Only letters, spaces, hyphens and apostrophes allowed', sanitized };
    }
    if (!/\p{L}/u.test(trimmed)) {
      return { isValid: false, error: 'Only letters, spaces, hyphens and apostrophes allowed', sanitized };
    }
    const letterCount = (trimmed.match(/\p{L}/gu) || []).length;
    if (letterCount < 2) {
      return { isValid: false, error: 'Name must be at least 2 characters', sanitized };
    }
    if (/(.)\1{3,}/.test(trimmed)) {
      return { isValid: false, error: 'Only letters, spaces, hyphens and apostrophes allowed', sanitized };
    }
    return { isValid: true, error: '', sanitized };
  }, []);

  const handleNameChange = useCallback((text: string) => {
    if (text.length > MAX_NAME_LENGTH) {
      text = text.slice(0, MAX_NAME_LENGTH);
    }
    const hasInvalidChars = /[^\p{L}\s'-]/gu.test(text);
    const hasMultipleSpaces = /\s{2,}/.test(text);

    if (hasInvalidChars) {
      setNameError('Only letters, spaces, hyphens and apostrophes allowed');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else if (hasMultipleSpaces) {
      setNameError('Please avoid multiple consecutive spaces');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else if (nameError) {
      setNameError('');
    }

    const { sanitized } = validateName(text);
    setName(sanitized);
  }, [validateName, nameError]);

  const handleNameBlur = useCallback(() => {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    setName(trimmed);

    const { isValid, error: validationError } = validateName(trimmed);

    if (trimmed && !isValid) {
      setNameError(validationError);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      setNameError('');
    }
  }, [name, validateName]);

  // Password validation constants
  const PASSWORD_MIN_LENGTH = 12;
  const PASSWORD_MAX_LENGTH = 64;
  const COMMON_PASSWORDS = ['123456', 'password', '12345678', 'qwerty', '123456789', 'abc123'];

  interface PasswordStrength {
    isValid: boolean;
    strength: 'weak' | 'fair' | 'good' | 'strong';
    requirements: {
      minLength: boolean;
      hasUppercase: boolean;
      hasLowercase: boolean;
      hasNumber: boolean;
      noCommonPassword: boolean;
      noLeadingTrailingSpaces: boolean;
    };
    error: string;
  }

  const validatePassword = useCallback((pwd: string, fullName: string = ''): PasswordStrength => {
    const requirements = {
      minLength: pwd.length >= PASSWORD_MIN_LENGTH,
      hasUppercase: /[A-Z]/.test(pwd),
      hasLowercase: /[a-z]/.test(pwd),
      hasNumber: /\d/.test(pwd),
      noCommonPassword: !COMMON_PASSWORDS.includes(pwd.toLowerCase()),
      noLeadingTrailingSpaces: pwd !== pwd.replace(/^\s+|\s+$/g, ''),
    };

    const nameParts = fullName.trim().toLowerCase().split(/\s+/);
    const pwdLower = pwd.toLowerCase();
    const containsName = nameParts.some(part => part && pwdLower.includes(part));

    const meetsMinRequirements =
      requirements.minLength &&
      requirements.hasUppercase &&
      requirements.hasLowercase &&
      requirements.hasNumber &&
      requirements.noCommonPassword &&
      !containsName;

    let strength: 'weak' | 'fair' | 'good' | 'strong' = 'weak';
    let error = '';

    if (!pwd) {
      error = 'Password is required';
    } else if (!requirements.minLength) {
      error = 'Password must be at least 12 characters';
    } else if (!requirements.hasUppercase || !requirements.hasLowercase || !requirements.hasNumber) {
      error = 'Must include uppercase, lowercase and a number';
    } else if (!requirements.noCommonPassword) {
      error = 'This password is too common. Please choose a stronger password';
    } else if (containsName) {
      error = 'Password cannot contain your full name';
    } else if (pwd.length > PASSWORD_MAX_LENGTH) {
      error = 'Password must not exceed 64 characters';
    }

    if (meetsMinRequirements) {
      const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd);
      const score = [
        requirements.minLength,
        requirements.hasUppercase,
        requirements.hasLowercase,
        requirements.hasNumber,
        hasSpecialChar,
      ].filter(Boolean).length;

      if (score <= 3) strength = 'fair';
      else if (score === 4) strength = 'good';
      else strength = 'strong';
    }

    return {
      isValid: meetsMinRequirements,
      strength,
      requirements,
      error,
    };
  }, []);

  // Button animation
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

  const handlePasswordChange = useCallback((pwd: string) => {
    setPassword(pwd);
    const validation = validatePassword(pwd, name);
    setPasswordError(validation.error);
    setPasswordStrength(validation.strength);
    setPasswordValidation(validation.requirements);
  }, [validatePassword, name]);

  const handleSignIn = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/login');
  }, [router]);

  const handleForgotPassword = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/forgot-password');
  }, [router]);

  const handleSignup = useCallback(async () => {
    setError('');
    setNameError('');
    setPasswordError('');

    const trimmedName = name.trim().replace(/\s+/g, ' ');
    const { isValid: isNameValid, error: nameValidationError } = validateName(trimmedName);

    if (!trimmedName) {
      setNameError('Full name is required');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (!isNameValid) {
      setNameError(nameValidationError);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (emailExists) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const passwordValidationResult = validatePassword(password, trimmedName);
    if (!passwordValidationResult.isValid) {
      setPasswordError(passwordValidationResult.error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsLoading(true);
    const result = await signUp(email, password, trimmedName);

    if (result.success) {
      logMetaEvent('CompleteRegistration', { registration_method: 'email' });

      // Email confirmation is OFF in Supabase, so signUp returns an active
      // session. Drop the user straight into the app and let
      // <PostSignupWelcome> handle the celebratory beat + paywall open.
      const firstName = trimmedName.split(' ')[0] || trimmedName;
      router.replace('/(tabs)');
      showPostSignupWelcome(firstName);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const errorMsg = result.error || 'Sign up failed';
      if (errorMsg.toLowerCase().includes('already registered') || errorMsg.toLowerCase().includes('already exists')) {
        setEmailExists(true);
      } else {
        setError(errorMsg);
      }
    }

    setIsLoading(false);
  }, [email, password, confirmPassword, name, signUp, router, emailExists, validateName, validatePassword, showPostSignupWelcome]);

  const navigateToLogin = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

  // ── Token-driven styles ────────────────────────────────────────────────
  const cardBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const inkPrimary = isDark ? '#fff' : designTokens.colors.ink;
  const inkSecondary = isDark ? '#888' : designTokens.colors.ink2;
  const inkTertiary = isDark ? '#666' : designTokens.colors.ink3;
  const pageBg = isDark ? '#1a1a1a' : designTokens.colors.cream;

  const eyebrowStyle = {
    fontFamily: designTokens.font.medium,
    fontSize: 11,
    letterSpacing: 0.55,
    textTransform: 'uppercase' as const,
    color: inkTertiary,
    marginBottom: 8,
  };
  const fieldShell = (errored: boolean, focused: boolean = false) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: focused || errored ? 1.5 : 1,
    borderColor: errored
      ? designTokens.colors.olive
      : focused
        ? designTokens.colors.brand
        : cardBorder,
    backgroundColor: cardBg,
  });
  const inputStyle = {
    flex: 1,
    fontFamily: designTokens.font.regular,
    fontSize: 15,
    color: inkPrimary,
    padding: 0,
  };

  // 4-segment strength bar fill count by level.
  const strengthFillCount =
    passwordStrength === 'weak' ? 1
      : passwordStrength === 'fair' ? 2
        : passwordStrength === 'good' ? 3
          : 4;
  const strengthLabel = passwordStrength.charAt(0).toUpperCase() + passwordStrength.slice(1);
  const passwordsMatch =
    confirmPassword.length > 0 && confirmPassword === password;

  const HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.32);

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        extraKeyboardSpace={0}
        onScrollBeginDrag={() => Keyboard.dismiss()}
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
                  backgroundColor: 'rgba(21,20,15,0.40)',
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
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 200 }}
                pointerEvents="none"
              />
            </Animated.View>

            {/* Overlay: back pill + brand eyebrow + greeting + tagline */}
            <SafeAreaView
              edges={['top']}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            >
              {/* Back pill — top-left, taps allowed */}
              <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
                <Pressable
                  onPress={navigateToLogin}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: 'rgba(246,242,233,0.30)',
                    backgroundColor: 'rgba(21,20,15,0.35)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  hitSlop={10}
                >
                  <ArrowLeft size={16} color="#F6F2E9" strokeWidth={1.8} />
                </Pressable>
              </View>

              {/* Greeting at the bottom of the hero */}
              <View
                style={{
                  flex: 1,
                  justifyContent: 'flex-end',
                  paddingHorizontal: 24,
                  paddingBottom: 44,
                }}
                pointerEvents="none"
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
                    Let's get{' '}
                    <Text
                      style={{
                        fontFamily: designTokens.font.serifItalic,
                        fontStyle: 'italic',
                        fontSize: 30,
                        letterSpacing: -0.3,
                      }}
                    >
                      started
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
                    Your first delicious week awaits.
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
                bottom: 100,
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
                top: 220,
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

            {/* Generic error banner */}
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

            {/* Name */}
            <View style={{ marginBottom: 14 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <Text style={[eyebrowStyle, { marginBottom: 0 }]}>Full name</Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 11,
                    color: inkTertiary,
                  }}
                >
                  {name.length}/{MAX_NAME_LENGTH}
                </Text>
              </View>
              <View style={fieldShell(!!nameError, focusedField === 'name')}>
                <User
                  size={16}
                  color={
                    nameError
                      ? designTokens.colors.olive
                      : focusedField === 'name'
                        ? designTokens.colors.brand
                        : inkTertiary
                  }
                  strokeWidth={1.8}
                />
                <TextInput
                  style={inputStyle}
                  placeholder="Enter your full name"
                  placeholderTextColor={inkTertiary}
                  value={name}
                  onChangeText={handleNameChange}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => {
                    setFocusedField(null);
                    handleNameBlur();
                  }}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => emailRef.current?.focus()}
                  editable={!isLoading}
                  maxLength={MAX_NAME_LENGTH}
                />
              </View>
              {nameError ? (
                <Animated.Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12,
                    color: designTokens.colors.olive,
                    marginTop: 6,
                    marginLeft: 4,
                  }}
                >
                  {nameError}
                </Animated.Text>
              ) : null}
            </View>

            {/* Email */}
            <View style={{ marginBottom: 14 }}>
              <Text style={eyebrowStyle}>Email</Text>
              <View style={fieldShell(emailExists, focusedField === 'email')}>
                <Mail
                  size={16}
                  color={
                    emailExists
                      ? designTokens.colors.olive
                      : focusedField === 'email'
                        ? designTokens.colors.brand
                        : inkTertiary
                  }
                  strokeWidth={1.8}
                />
                <TextInput
                  ref={emailRef}
                  style={inputStyle}
                  placeholder="your@email.com"
                  placeholderTextColor={inkTertiary}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (emailExists) {
                      setEmailExists(false);
                    }
                  }}
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

              {/* Email already exists — cream nudge card with 2 recovery pills */}
              {emailExists && (
                <Animated.View
                  style={{
                    marginTop: 12,
                    padding: 14,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: cardBorder,
                    backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 10,
                      marginBottom: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        backgroundColor: isDark ? '#2a2a2a' : '#FFFFFF',
                        borderWidth: 1,
                        borderColor: cardBorder,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Info size={14} color={designTokens.colors.olive} strokeWidth={1.8} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 13.5,
                          color: inkPrimary,
                        }}
                      >
                        Email already registered
                      </Text>
                      <Text
                        style={{
                          fontFamily: designTokens.font.regular,
                          fontSize: 12.5,
                          color: inkSecondary,
                          marginTop: 2,
                          lineHeight: 17,
                        }}
                      >
                        Looks like you already have an account.
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={handleSignIn}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 999,
                        backgroundColor: designTokens.colors.brand,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 13,
                          color: designTokens.colors.cream,
                        }}
                      >
                        Sign in
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleForgotPassword}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: cardBorder,
                        backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 13,
                          color: isDark ? '#ddd' : designTokens.colors.ink2,
                        }}
                      >
                        Forgot password?
                      </Text>
                    </Pressable>
                  </View>
                </Animated.View>
              )}
            </View>

            {/* Password */}
            <View style={{ marginBottom: 14 }}>
              <Text style={eyebrowStyle}>Password</Text>
              <View style={fieldShell(!!(passwordError && password), focusedField === 'password')}>
                <Lock
                  size={16}
                  color={
                    passwordError && password
                      ? designTokens.colors.olive
                      : focusedField === 'password'
                        ? designTokens.colors.brand
                        : inkTertiary
                  }
                  strokeWidth={1.8}
                />
                <TextInput
                  ref={passwordRef}
                  style={inputStyle}
                  placeholder="Minimum 12 characters"
                  placeholderTextColor={inkTertiary}
                  value={password}
                  onChangeText={handlePasswordChange}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password-new"
                  textContentType="newPassword"
                  passwordRules="minlength: 12; required: upper; required: lower; required: digit;"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                  editable={!isLoading}
                  maxLength={PASSWORD_MAX_LENGTH}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
                  {showPassword ? (
                    <EyeOff size={16} color={inkTertiary} strokeWidth={1.8} />
                  ) : (
                    <Eye size={16} color={inkTertiary} strokeWidth={1.8} />
                  )}
                </Pressable>
              </View>

              {passwordError && password ? (
                <Animated.Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12,
                    color: designTokens.colors.olive,
                    marginTop: 6,
                    marginLeft: 4,
                  }}
                >
                  {passwordError}
                </Animated.Text>
              ) : null}

              {/* 4-segment strength bar + label */}
              {password ? (
                <Animated.View style={{ marginTop: 12 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 11,
                        letterSpacing: 0.4,
                        textTransform: 'uppercase',
                        color: inkTertiary,
                      }}
                    >
                      Password strength
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 12,
                        color:
                          passwordStrength === 'weak'
                            ? designTokens.colors.olive
                            : passwordStrength === 'strong'
                              ? designTokens.colors.brand
                              : inkSecondary,
                      }}
                    >
                      {strengthLabel}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {[0, 1, 2, 3].map((idx) => (
                      <View
                        key={idx}
                        style={{
                          flex: 1,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor:
                            idx < strengthFillCount
                              ? passwordStrength === 'weak'
                                ? designTokens.colors.olive
                                : designTokens.colors.brand
                              : isDark
                                ? '#2a2a2a'
                                : designTokens.colors.hair2,
                        }}
                      />
                    ))}
                  </View>

                  {/* Checklist — hide once all 4 met */}
                  {!passwordValidation.minLength ||
                    !passwordValidation.hasUppercase ||
                    !passwordValidation.hasLowercase ||
                    !passwordValidation.hasNumber ? (
                    <View
                      style={{
                        marginTop: 12,
                        padding: 12,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: cardBorder,
                        backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                        gap: 2,
                      }}
                    >
                      <RequirementItem label="At least 12 characters" met={passwordValidation.minLength} isDark={isDark} />
                      <RequirementItem label="Uppercase letter" met={passwordValidation.hasUppercase} isDark={isDark} />
                      <RequirementItem label="Lowercase letter" met={passwordValidation.hasLowercase} isDark={isDark} />
                      <RequirementItem label="Number" met={passwordValidation.hasNumber} isDark={isDark} />
                    </View>
                  ) : null}
                </Animated.View>
              ) : null}
            </View>

            {/* Confirm Password */}
            <View style={{ marginBottom: 20 }}>
              <Text style={eyebrowStyle}>Confirm password</Text>
              <View style={fieldShell(false, focusedField === 'confirm')}>
                <Lock
                  size={16}
                  color={focusedField === 'confirm' ? designTokens.colors.brand : inkTertiary}
                  strokeWidth={1.8}
                />
                <TextInput
                  ref={confirmPasswordRef}
                  style={inputStyle}
                  placeholder="Re-enter password"
                  placeholderTextColor={inkTertiary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onFocus={() => setFocusedField('confirm')}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoComplete="password-new"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={handleSignup}
                  editable={!isLoading}
                />
                {passwordsMatch ? (
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: designTokens.colors.brand,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Check size={11} color={designTokens.colors.cream} strokeWidth={2.4} />
                  </View>
                ) : null}
                <Pressable
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  hitSlop={10}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={16} color={inkTertiary} strokeWidth={1.8} />
                  ) : (
                    <Eye size={16} color={inkTertiary} strokeWidth={1.8} />
                  )}
                </Pressable>
              </View>
            </View>

            {/* Primary CTA */}
            <Animated.View style={buttonAnimatedStyle}>
              <Pressable
                onPress={handleSignup}
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
                      Create account
                    </Text>
                    <ArrowRight size={16} color={designTokens.colors.cream} strokeWidth={1.8} />
                  </>
                )}
              </Pressable>
            </Animated.View>

            {/* Secondary CTA — hair-bordered ghost pill back to sign in */}
            <Pressable
              onPress={navigateToLogin}
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
                I already have an account
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
                { Icon: Flame, label: 'AI cooks\nwith you', tint: designTokens.colors.olive },
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

            {/* Tiny hair2 hairline + brand mark */}
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
    </View>
  );
}
