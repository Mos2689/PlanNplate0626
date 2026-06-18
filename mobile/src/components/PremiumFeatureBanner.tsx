import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Lock, Crown, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/lib/useColorScheme';
import {
  useHasAIAccess,
  useSubscriptionStore,
} from '@/lib/subscription-store';
import { cn } from '@/lib/cn';

interface PremiumFeatureBannerProps {
  message?: string;
  featureName?: string;
  compact?: boolean;
}

export function PremiumFeatureBanner({ message, featureName, compact = false }: PremiumFeatureBannerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const openPaywallSheet = useSubscriptionStore((s) => s.openPaywallSheet);
  const hasAIAccess = useHasAIAccess();

  // Don't show if user has premium access
  if (hasAIAccess) return null;

  const goToSubscription = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openPaywallSheet('generic');
  };

  const defaultMessage = featureName
    ? `${featureName} is a premium feature`
    : 'This is a premium feature';

  if (compact) {
    return (
      <Pressable
        onPress={goToSubscription}
        className={cn(
          'flex-row items-center p-3 rounded-xl',
          isDark ? 'bg-terracotta-900/30' : 'bg-terracotta-50'
        )}
      >
        <Lock size={16} color={isDark ? '#f5b8a0' : '#e46d46'} />
        <Text
          className={cn(
            'flex-1 text-sm font-medium ml-2',
            isDark ? 'text-terracotta-300' : 'text-terracotta-700'
          )}
        >
          {message || defaultMessage}
        </Text>
        <Crown size={14} color={isDark ? '#f5b8a0' : '#e46d46'} />
      </Pressable>
    );
  }

  return (
    <View
      className={cn(
        'rounded-2xl p-4 mb-4',
        isDark ? 'bg-terracotta-900/30' : 'bg-terracotta-50'
      )}
    >
      <View className="flex-row items-center mb-2">
        <View
          className={cn(
            'w-10 h-10 rounded-xl items-center justify-center mr-3',
            isDark ? 'bg-terracotta-800/50' : 'bg-terracotta-100'
          )}
        >
          <Lock size={20} color={isDark ? '#f5b8a0' : '#e46d46'} />
        </View>
        <View className="flex-1">
          <Text
            className={cn(
              'text-base font-semibold',
              isDark ? 'text-terracotta-300' : 'text-terracotta-700'
            )}
          >
            Premium Feature
          </Text>
          <Text
            className={cn(
              'text-sm',
              isDark ? 'text-terracotta-400' : 'text-terracotta-600'
            )}
          >
            {message || defaultMessage}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={goToSubscription}
        className={cn(
          'flex-row items-center justify-center py-2.5 rounded-xl mt-2',
          isDark ? 'bg-terracotta-600' : 'bg-terracotta-500'
        )}
      >
        <Crown size={16} color="white" />
        <Text className="text-white font-semibold text-sm ml-2">
          Upgrade to Premium
        </Text>
      </Pressable>
    </View>
  );
}

// Full-screen overlay for premium features
interface PremiumFeatureOverlayProps {
  featureName: string;
  description?: string;
  onClose?: () => void;
}

export function PremiumFeatureOverlay({ featureName, description, onClose }: PremiumFeatureOverlayProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const openPaywallSheet = useSubscriptionStore((s) => s.openPaywallSheet);
  const hasAIAccess = useHasAIAccess();

  // Don't show if user has access
  if (hasAIAccess) return null;

  const goToSubscription = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onClose) onClose();
    openPaywallSheet('generic');
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onClose) onClose();
  };

  return (
    <View className="absolute inset-0 bg-black/70 items-center justify-center px-6 z-50">
      <View
        className={cn(
          'w-full rounded-3xl p-6 items-center',
          isDark ? 'bg-charcoal-800' : 'bg-white'
        )}
      >
        <View
          className={cn(
            'w-20 h-20 rounded-full items-center justify-center mb-5',
            isDark ? 'bg-terracotta-800/50' : 'bg-terracotta-100'
          )}
        >
          <Sparkles size={40} color={isDark ? '#f5b8a0' : '#e46d46'} />
        </View>

        <Text
          className={cn(
            'text-xl font-bold mb-2 text-center',
            isDark ? 'text-white' : 'text-charcoal-900'
          )}
        >
          Premium Feature
        </Text>

        <Text
          className={cn(
            'text-base font-semibold mb-1 text-center',
            isDark ? 'text-terracotta-300' : 'text-terracotta-600'
          )}
        >
          {featureName}
        </Text>

        <Text
          className={cn(
            'text-sm text-center mb-6',
            isDark ? 'text-charcoal-400' : 'text-charcoal-500'
          )}
        >
          {description || 'Subscribe to unlock AI-powered features and take your meal planning to the next level.'}
        </Text>

        <View className="w-full space-y-3">
          <Pressable
            onPress={goToSubscription}
            className={cn(
              'flex-row items-center justify-center py-4 rounded-2xl w-full',
              isDark ? 'bg-terracotta-600' : 'bg-terracotta-500'
            )}
          >
            <Crown size={20} color="white" />
            <Text className="text-white font-semibold text-base ml-2">
              Upgrade to Premium
            </Text>
          </Pressable>

          <Pressable
            onPress={handleClose}
            className={cn(
              'py-3 rounded-2xl w-full items-center mt-3',
              isDark ? 'bg-charcoal-700' : 'bg-cream-200'
            )}
          >
            <Text
              className={cn(
                'font-semibold text-base',
                isDark ? 'text-charcoal-300' : 'text-charcoal-600'
              )}
            >
              Maybe Later
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Hook to check if AI features should be restricted
export function useIsAIRestricted() {
  const hasAIAccess = useHasAIAccess();
  return !hasAIAccess;
}
