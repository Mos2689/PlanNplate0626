import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Pause, Play, Settings } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/lib/useColorScheme';
import { useSubscriptionStore, useIsAccountPaused } from '@/lib/subscription-store';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/cn';

export function PausedAccountOverlay() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const isPaused = useIsAccountPaused();
  const resumeAccount = useSubscriptionStore((s) => s.resumeAccount);
  const currentUser = useAuthStore((s) => s.currentUser);

  const [isResuming, setIsResuming] = useState(false);

  if (!isPaused) return null;

  const handleResume = async () => {
    if (!currentUser?.id || isResuming) return;

    setIsResuming(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const success = await resumeAccount(currentUser.id);
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (error) {
      console.error('Resume account error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsResuming(false);
    }
  };

  const goToSettings = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/preferences');
  };

  return (
    <View className="absolute inset-0 z-50">
      <LinearGradient
        colors={isDark ? ['#1a1a1a', '#262626'] : ['#fefdfb', '#f5f5f4']}
        style={{ flex: 1 }}
      >
        <SafeAreaView className="flex-1 justify-center items-center px-6">
          {/* Icon */}
          <View
            className={cn(
              'w-24 h-24 rounded-full items-center justify-center mb-6',
              isDark ? 'bg-amber-900/30' : 'bg-amber-100'
            )}
          >
            <Pause size={48} color={isDark ? '#fbbf24' : '#d97706'} />
          </View>

          {/* Title */}
          <Text
            className={cn(
              'text-2xl font-bold text-center mb-3',
              isDark ? 'text-white' : 'text-charcoal-900'
            )}
          >
            Account Paused
          </Text>

          {/* Description */}
          <Text
            className={cn(
              'text-base text-center mb-8 leading-6 px-4',
              isDark ? 'text-charcoal-400' : 'text-charcoal-500'
            )}
          >
            Your account is currently paused. You can still view your saved recipes, but meal planning, AI generation, and grocery list features are disabled.
          </Text>

          {/* Info Card */}
          <View
            className={cn(
              'w-full rounded-2xl p-4 mb-8',
              isDark ? 'bg-charcoal-800/50' : 'bg-white'
            )}
          >
            <View className="flex-row items-center mb-3">
              <View
                className={cn(
                  'w-2 h-2 rounded-full mr-3',
                  isDark ? 'bg-green-500' : 'bg-green-400'
                )}
              />
              <Text
                className={cn(
                  'text-sm',
                  isDark ? 'text-charcoal-300' : 'text-charcoal-600'
                )}
              >
                Your recipes are preserved and viewable
              </Text>
            </View>
            <View className="flex-row items-center mb-3">
              <View
                className={cn(
                  'w-2 h-2 rounded-full mr-3',
                  isDark ? 'bg-amber-500' : 'bg-amber-400'
                )}
              />
              <Text
                className={cn(
                  'text-sm',
                  isDark ? 'text-charcoal-300' : 'text-charcoal-600'
                )}
              >
                Subscription billing paused
              </Text>
            </View>
            <View className="flex-row items-center">
              <View
                className={cn(
                  'w-2 h-2 rounded-full mr-3',
                  isDark ? 'bg-green-500' : 'bg-green-400'
                )}
              />
              <Text
                className={cn(
                  'text-sm',
                  isDark ? 'text-charcoal-300' : 'text-charcoal-600'
                )}
              >
                Resume anytime to restore all features
              </Text>
            </View>
          </View>

          {/* Resume Button */}
          <View className="w-full">
            <Pressable
              onPress={handleResume}
              disabled={isResuming}
              className={cn(
                'h-14 rounded-xl flex-row items-center justify-center mb-3',
                isDark ? 'bg-green-600' : 'bg-green-500',
                isResuming && 'opacity-70'
              )}
            >
              {isResuming ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Play size={20} color="white" />
                  <Text className="text-white font-semibold text-base ml-2">
                    Resume Account
                  </Text>
                </>
              )}
            </Pressable>

            {/* Profile Link */}
            <Pressable
              onPress={goToSettings}
              className={cn(
                'h-14 rounded-xl flex-row items-center justify-center',
                isDark ? 'bg-charcoal-800' : 'bg-charcoal-100'
              )}
            >
              <Settings size={20} color={isDark ? '#a1a1aa' : '#6b7280'} />
              <Text
                className={cn(
                  'font-semibold text-base ml-2',
                  isDark ? 'text-charcoal-300' : 'text-charcoal-600'
                )}
              >
                Go to Profile
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}
