import React, { useState } from 'react';
import { View, Text, Pressable, Modal, ActivityIndicator } from 'react-native';
import { X, RefreshCw, AlertTriangle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { cn } from '@/lib/cn';
import { useColorScheme } from '@/lib/useColorScheme';

type ModalType = 'delete' | null;

interface AccountManagementModalProps {
  visible: boolean;
  modalType: ModalType;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isPaused: boolean;
}

export function AccountManagementModal({
  visible,
  modalType,
  onClose,
  onConfirm,
  isPaused,
}: AccountManagementModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    if (isLoading) return;

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await onConfirm();
    } catch (error) {
      console.error('Account action error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const getModalContent = () => {
    if (modalType === 'delete') {
      return {
        icon: <RefreshCw size={32} color="#6a7d56" />,
        iconBg: isDark ? 'bg-sage-900/30' : 'bg-sage-100',
        title: 'Fresh Start',
        description:
          'Ready for a clean slate? This will reset all your data so you can start fresh with new recipes, meal plans, and preferences.',
        bullets: [
          'All saved recipes will be cleared',
          'Meal plans will be reset',
          'Preferences will return to defaults',
          'You can set everything up again',
        ],
        confirmText: 'Reset & Start Fresh',
        confirmBg: isDark ? 'bg-sage-600' : 'bg-sage-500',
        confirmTextColor: 'text-white',
        warning: false,
      };
    }
    return null;
  };

  const content = getModalContent();

  if (!visible || !content) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable className="flex-1" onPress={handleClose} />

        <View
          className={cn(
            'rounded-t-3xl overflow-hidden',
            isDark ? 'bg-charcoal-900' : 'bg-white'
          )}
        >
          {/* Handle bar */}
          <View className="items-center pt-3 pb-2">
            <View
              className={cn(
                'w-10 h-1 rounded-full',
                isDark ? 'bg-charcoal-700' : 'bg-charcoal-200'
              )}
            />
          </View>

          {/* Header */}
          <View className="flex-row items-center justify-between px-5 py-3">
            <View className="w-10" />
            <Text
              className={cn(
                'text-lg font-semibold',
                isDark ? 'text-white' : 'text-charcoal-900'
              )}
            >
              {content.title}
            </Text>
            <Pressable
              onPress={handleClose}
              disabled={isLoading}
              className={cn(
                'w-10 h-10 rounded-full items-center justify-center',
                isDark ? 'bg-charcoal-800' : 'bg-charcoal-100'
              )}
            >
              <X size={20} color={isDark ? '#888' : '#666'} />
            </Pressable>
          </View>

          {/* Content */}
          <View className="px-5 pb-8">
            {/* Icon */}
            <View className="items-center mb-4">
              <View
                className={cn(
                  'w-20 h-20 rounded-full items-center justify-center',
                  content.iconBg
                )}
              >
                {content.icon}
              </View>
            </View>

            {/* Description */}
            <Text
              className={cn(
                'text-center text-base mb-4 leading-6',
                isDark ? 'text-charcoal-300' : 'text-charcoal-600'
              )}
            >
              {content.description}
            </Text>

            {/* Warning for delete */}
            {content.warning && (
              <View
                className={cn(
                  'flex-row items-center p-3 rounded-xl mb-4',
                  isDark ? 'bg-red-900/20' : 'bg-red-50'
                )}
              >
                <AlertTriangle
                  size={20}
                  color={isDark ? '#f87171' : '#dc2626'}
                />
                <Text
                  className={cn(
                    'flex-1 ml-2 text-sm font-medium',
                    isDark ? 'text-red-400' : 'text-red-600'
                  )}
                >
                  Warning: This action is irreversible!
                </Text>
              </View>
            )}

            {/* Bullets */}
            <View
              className={cn(
                'rounded-2xl p-4 mb-6',
                isDark ? 'bg-charcoal-800/50' : 'bg-charcoal-50'
              )}
            >
              {content.bullets.map((bullet, index) => (
                <View
                  key={index}
                  className={cn(
                    'flex-row items-center',
                    index < content.bullets.length - 1 && 'mb-2'
                  )}
                >
                  <View
                    className={cn(
                      'w-2 h-2 rounded-full mr-3',
                      content.warning
                        ? isDark
                          ? 'bg-red-500'
                          : 'bg-red-400'
                        : isDark
                        ? 'bg-sage-500'
                        : 'bg-sage-400'
                    )}
                  />
                  <Text
                    className={cn(
                      'text-sm flex-1',
                      isDark ? 'text-charcoal-300' : 'text-charcoal-600'
                    )}
                  >
                    {bullet}
                  </Text>
                </View>
              ))}
            </View>

            {/* Buttons */}
            <View>
              <Pressable
                onPress={handleConfirm}
                disabled={isLoading}
                className={cn(
                  'h-14 rounded-xl items-center justify-center mb-3',
                  content.confirmBg,
                  isLoading && 'opacity-70'
                )}
              >
                {isLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className={cn('font-semibold text-base', content.confirmTextColor)}>
                    {content.confirmText}
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={handleClose}
                disabled={isLoading}
                className={cn(
                  'h-14 rounded-xl items-center justify-center',
                  isDark ? 'bg-charcoal-800' : 'bg-charcoal-100'
                )}
              >
                <Text
                  className={cn(
                    'font-semibold text-base',
                    isDark ? 'text-charcoal-300' : 'text-charcoal-600'
                  )}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
