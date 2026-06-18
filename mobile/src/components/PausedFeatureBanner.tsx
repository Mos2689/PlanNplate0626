import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Lock, Play } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/lib/useColorScheme';
import { useIsAccountPaused } from '@/lib/subscription-store';
import { cn } from '@/lib/cn';

interface PausedFeatureBannerProps {
  message?: string;
  compact?: boolean;
}

export function PausedFeatureBanner({ message, compact = false }: PausedFeatureBannerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const isPaused = useIsAccountPaused();

  if (!isPaused) return null;

  const goToSettings = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/preferences');
  };

  if (compact) {
    return (
      <Pressable
        onPress={goToSettings}
        className={cn(
          'flex-row items-center p-3 rounded-xl',
          isDark ? 'bg-amber-900/30' : 'bg-amber-50'
        )}
      >
        <Lock size={16} color={isDark ? '#fbbf24' : '#d97706'} />
        <Text
          className={cn(
            'flex-1 text-sm font-medium ml-2',
            isDark ? 'text-amber-400' : 'text-amber-700'
          )}
        >
          {message || 'Feature unavailable while account is paused'}
        </Text>
        <Play size={14} color={isDark ? '#fbbf24' : '#d97706'} />
      </Pressable>
    );
  }

  return (
    <View
      className={cn(
        'rounded-2xl p-4 mb-4',
        isDark ? 'bg-amber-900/30' : 'bg-amber-50'
      )}
    >
      <View className="flex-row items-center mb-2">
        <View
          className={cn(
            'w-10 h-10 rounded-xl items-center justify-center mr-3',
            isDark ? 'bg-amber-800/50' : 'bg-amber-100'
          )}
        >
          <Lock size={20} color={isDark ? '#fbbf24' : '#d97706'} />
        </View>
        <View className="flex-1">
          <Text
            className={cn(
              'text-base font-semibold',
              isDark ? 'text-amber-400' : 'text-amber-700'
            )}
          >
            Account Paused
          </Text>
          <Text
            className={cn(
              'text-sm',
              isDark ? 'text-amber-500/80' : 'text-amber-600'
            )}
          >
            {message || 'This feature is unavailable while your account is paused'}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={goToSettings}
        className={cn(
          'flex-row items-center justify-center py-2.5 rounded-xl mt-2',
          isDark ? 'bg-green-600' : 'bg-green-500'
        )}
      >
        <Play size={16} color="white" />
        <Text className="text-white font-semibold text-sm ml-2">
          Resume Account
        </Text>
      </Pressable>
    </View>
  );
}

// Hook to check if a feature should be disabled
export function useIsFeatureRestricted() {
  const isPaused = useIsAccountPaused();
  return isPaused;
}
