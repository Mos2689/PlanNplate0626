import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useAuthStore } from '@/lib/auth-store';

export default function VerifyOTPScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();

  const verifyOTP = useAuthStore((s) => s.verifyOTP);
  const clearOTPState = useAuthStore((s) => s.clearOTPState);

  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const otpInputRef = useRef<TextInput>(null);

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

  // Auto-focus on mount
  useEffect(() => {
    otpInputRef.current?.focus();
  }, []);

  // Handle OTP input - only allow 6 digits
  const handleOtpChange = useCallback((text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 6);
    setOtp(digits);
  }, []);

  const handleVerifyOTP = useCallback(async () => {
    if (!otp || otp.length !== 6) {
      setError('Please enter a 6-digit OTP');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setError('');
    setIsLoading(true);

    const result = await verifyOTP(otp);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Navigate directly to reset password screen
      router.replace('/reset-password');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.error || 'Invalid OTP');
      setOtp('');
      otpInputRef.current?.focus();
    }

    setIsLoading(false);
  }, [otp, verifyOTP, router]);

  const handleGoBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearOTPState();
    router.back();
  }, [router, clearOTPState]);

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#f8f6f0', '#e8e4d9', '#d4cfc2']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          {/* Header */}
          <View className="px-6 pt-4 pb-6 flex-row items-center">
            <Pressable
              onPress={handleGoBack}
              hitSlop={12}
              className="mr-3"
            >
              <ChevronLeft size={24} color="#2d3a2d" strokeWidth={2} />
            </Pressable>
            <Text className="text-lg font-semibold text-[#2d3a2d]">Verify OTP</Text>
          </View>

          <View className="flex-1 px-6 justify-center">
            <Animated.View entering={FadeInDown.duration(400)}>
              <Text className="text-2xl font-bold text-[#2d3a2d] text-center mb-3">
                Enter OTP
              </Text>
              <Text className="text-base text-[#5a6b5a] text-center mb-8">
                We've sent a 6-digit code to{'\n'}
                <Text className="font-medium text-[#2d3a2d]">{email}</Text>
              </Text>

              {/* Error Message */}
              {error ? (
                  <Animated.View
                    entering={FadeInDown.duration(300)}
                    className="bg-red-50 border border-red-200 rounded-xl p-3 mb-6"
                  >
                    <Text className="text-red-600 text-center text-sm">{error}</Text>
                  </Animated.View>
                ) : null}

                {/* OTP Input */}
                <Pressable
                  onPress={() => otpInputRef.current?.focus()}
                  className="mb-8"
                >
                  <View className="flex-row items-center justify-center gap-2 mb-4">
                    {[...Array(6)].map((_, i) => (
                      <View
                        key={i}
                        className={`w-10 h-12 rounded-xl border-2 items-center justify-center ${
                          i < otp.length
                            ? 'bg-white border-[#6a7d56]'
                            : 'bg-white/50 border-[#d4cfc2]'
                        }`}
                      >
                        <Text className="text-lg font-bold text-[#2d3a2d]">
                          {otp[i] || ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <TextInput
                    ref={otpInputRef}
                    style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
                    value={otp}
                    onChangeText={handleOtpChange}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                  />
                </Pressable>

                {/* Verify Button */}
                <Animated.View style={buttonAnimatedStyle}>
                  <Pressable
                    onPress={handleVerifyOTP}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    disabled={isLoading || otp.length !== 6}
                    className="overflow-hidden rounded-2xl"
                  >
                    <LinearGradient
                      colors={
                        isLoading || otp.length !== 6
                          ? ['#9ca39c', '#8a918a', '#787f78']
                          : ['#7a8d66', '#6a7d56', '#5a6d46']
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{
                        paddingVertical: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 16,
                      }}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text className="text-white text-base font-semibold">
                          Verify OTP
                        </Text>
                      )}
                    </LinearGradient>
                  </Pressable>
                </Animated.View>

                {/* Resend OTP Link */}
                <View className="flex-row justify-center mt-6">
                  <Text className="text-[#5a6b5a] text-sm">Didn't receive code? </Text>
                  <Pressable hitSlop={8}>
                    <Text className="text-[#6a7d56] font-semibold text-sm">Resend</Text>
                  </Pressable>
                </View>
              </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
