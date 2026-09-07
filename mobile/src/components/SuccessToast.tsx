import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface SuccessToastProps {
  visible: boolean;
  message: string;
  duration?: number;
  isDark?: boolean;
}

// Matches the quiet "Added to grocery" pill on the Recipes tab: a small dark
// pill near the bottom, one gentle entrance, no internal opacity tween. The
// parent controls how long it stays up (it clears `visible` on a timer).
export const SuccessToast: React.FC<SuccessToastProps> = ({ visible, message }) => {
  if (!visible) return null;

  return (
    <Animated.View entering={FadeInDown.springify()} pointerEvents="none" style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.message}>{message}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 96,
    alignItems: 'center',
    zIndex: 1000,
  },
  content: {
    backgroundColor: '#201C17',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  message: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: -0.1,
  },
});
