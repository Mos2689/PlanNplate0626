import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';

interface SuccessToastProps {
  visible: boolean;
  message: string;
  duration?: number;
  isDark?: boolean;
}

export const SuccessToast: React.FC<SuccessToastProps> = ({
  visible,
  message,
  duration = 3000,
  isDark = false,
}) => {
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 300 });
      const timer = setTimeout(() => {
        opacity.value = withTiming(0, { duration: 300 });
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!visible) return null;

  const bgColor = isDark ? '#2d3748' : '#ffffff';
  const textColor = isDark ? '#a6b594' : '#6a7d56';
  const iconColor = isDark ? '#a6b594' : '#6a7d56';

  return (
    <Animated.View
      entering={FadeInDown}
      exiting={FadeOutDown}
      style={[styles.container, animatedStyle]}
    >
      <View style={[styles.content, { backgroundColor: bgColor }]}>
        <Check size={24} color={iconColor} style={{ marginRight: 12 }} />
        <Text style={[styles.message, { color: textColor }]}>{message}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '50%',
    left: 20,
    right: 20,
    transform: [{ translateY: -60 }],
    zIndex: 1000,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  message: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    lineHeight: 22,
  },
});
