import React, { useState, useCallback } from 'react';
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
import { useRouter } from 'expo-router';
import { ChevronLeft, Lock, Eye, EyeOff, CheckCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useAuthStore } from '@/lib/auth-store';

export default function ResetPasswordScreen() {
  const router = useRouter();

  const resetPasswordWithOTP = useAuthStore((s) => s.resetPasswordWithOTP);
  const clearOTPState = useAuthStore((s) => s.clearOTPState);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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

  const handleResetPassword = useCallback(async () => {
    setError('');

    if (!newPassword || !confirmPassword) {
      setError('All fields are required');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsLoading(true);

    const result = await resetPasswordWithOTP(newPassword);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.error || 'Failed to reset password');
    }

    setIsLoading(false);
  }, [newPassword, confirmPassword, resetPasswordWithOTP]);

  const handleGoBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

  const handleReturnToLogin = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearOTPState();
    router.replace('/login');
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
            <Text className="text-lg font-semibold text-[#2d3a2d]">Set New Password</Text>
          </View>

          <View className="flex-1 px-6 justify-center">
            {success ? (
              // Success State
              <Animated.View entering={FadeIn.duration(400)} className="items-center">
                <View className="bg-[#6a7d56]/10 rounded-full p-5 mb-5">
                  <CheckCircle size={48} color="#6a7d56" strokeWidth={1.5} />
                </View>
                <Text className="text-xl font-bold text-[#2d3a2d] text-center mb-3">
                  Password Reset!
                </Text>
                <Text className="text-base text-[#5a6b5a] text-center mb-8">
                  Your password has been successfully updated. You can now log in with your new password.
                </Text>
                <Pressable
                  onPress={handleReturnToLogin}
                  className="overflow-hidden rounded-2xl w-full"
                >
                  <LinearGradient
                    colors={['#7a8d66', '#6a7d56', '#5a6d46']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      paddingVertical: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 16,
                    }}
                  >
                    <Text className="text-white text-base font-semibold">
                      Return to Login
                    </Text>
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            ) : (
              // Password Reset Form
              <Animated.View entering={FadeInDown.duration(400)}>
                <Text className="text-2xl font-bold text-[#2d3a2d] text-center mb-3">
                  Create New Password
                </Text>
                <Text className="text-base text-[#5a6b5a] text-center mb-8">
                  Please enter a strong password to secure your account.
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

                {/* New Password Input */}
                <View className="mb-4">
                  <Text className="text-sm font-medium text-[#4a5a4a] mb-2 ml-1">
                    New Password
                  </Text>
                  <View className="flex-row items-center bg-white/80 rounded-2xl px-4 py-3.5 border border-[#d4cfc2]">
                    <Lock size={20} color="#6a7d56" strokeWidth={1.5} />
                    <TextInput
                      className="flex-1 ml-3 text-base text-[#2d3a2d]"
                      placeholder="Enter new password"
                      placeholderTextColor="#9ca39c"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      editable={!isLoading}
                    />
                    <Pressable
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={10}
                    >
                      {showPassword ? (
                        <EyeOff size={20} color="#6a7d56" strokeWidth={1.5} />
                      ) : (
                        <Eye size={20} color="#6a7d56" strokeWidth={1.5} />
                      )}
                    </Pressable>
                  </View>
                </View>

                {/* Confirm Password Input */}
                <View className="mb-8">
                  <Text className="text-sm font-medium text-[#4a5a4a] mb-2 ml-1">
                    Confirm Password
                  </Text>
                  <View className="flex-row items-center bg-white/80 rounded-2xl px-4 py-3.5 border border-[#d4cfc2]">
                    <Lock size={20} color="#6a7d56" strokeWidth={1.5} />
                    <TextInput
                      className="flex-1 ml-3 text-base text-[#2d3a2d]"
                      placeholder="Confirm new password"
                      placeholderTextColor="#9ca39c"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      editable={!isLoading}
                    />
                    <Pressable
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      hitSlop={10}
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={20} color="#6a7d56" strokeWidth={1.5} />
                      ) : (
                        <Eye size={20} color="#6a7d56" strokeWidth={1.5} />
                      )}
                    </Pressable>
                  </View>
                </View>

                {/* Reset Button */}
                <Animated.View style={buttonAnimatedStyle}>
                  <Pressable
                    onPress={handleResetPassword}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    disabled={isLoading}
                    className="overflow-hidden rounded-2xl"
                  >
                    <LinearGradient
                      colors={['#7a8d66', '#6a7d56', '#5a6d46']}
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
                          Reset Password
                        </Text>
                      )}
                    </LinearGradient>
                  </Pressable>
                </Animated.View>
              </Animated.View>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
