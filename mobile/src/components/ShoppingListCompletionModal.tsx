// Shopping List Completion modal — PlannPlate design language.
// Visual-only redesign: props, callbacks, haptics, and animations preserved verbatim.
// One italic word per screen ("complete" in the title).
import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CheckCircle2 } from 'lucide-react-native';
import { designTokens } from '@/lib/design-tokens';

interface ShoppingListCompletionModalProps {
  visible: boolean;
  onClose: () => void;
  onProceedToCheckout: () => void;
  isDark: boolean;
}

export const ShoppingListCompletionModal: React.FC<ShoppingListCompletionModalProps> = ({
  visible,
  onClose,
  onProceedToCheckout,
  isDark,
}) => {
  const handleProceed = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onProceedToCheckout();
  }, [onProceedToCheckout]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={[styles.overlay, { zIndex: 500 }]}
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={handleClose} />

      {/* Card */}
      <Animated.View
        entering={ZoomIn.springify().damping(15)}
        exiting={ZoomOut.springify()}
        style={[
          styles.card,
          {
            backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
            borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
          },
        ]}
      >
        {/* Sage-tint check tile */}
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: isDark ? 'rgba(84,100,69,0.20)' : '#E8ECDF' },
          ]}
        >
          <CheckCircle2 size={36} color={designTokens.colors.brand} strokeWidth={1.6} />
        </View>

        {/* Title — one italic word */}
        <Text
          style={[
            styles.title,
            { color: isDark ? '#fff' : designTokens.colors.ink },
          ]}
        >
          Your list is{' '}
          <Text
            style={{
              fontFamily: designTokens.font.serifItalic,
              fontStyle: 'italic',
              fontSize: 24,
              letterSpacing: -0.24,
            }}
          >
            complete
          </Text>
        </Text>

        {/* Description */}
        <Text
          style={[
            styles.description,
            { color: isDark ? '#888' : designTokens.colors.ink2 },
          ]}
        >
          All items have been checked off. Great job — you're all done!
        </Text>

        {/* Actions */}
        <View style={styles.buttonContainer}>
          <Pressable
            onPress={handleProceed}
            style={styles.proceedButton}
          >
            <Text style={styles.proceedButtonText}>
              Finish shopping
            </Text>
          </Pressable>

          <Pressable
            onPress={handleClose}
            style={[
              styles.dismissButton,
              {
                borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
              },
            ]}
          >
            <Text
              style={[
                styles.dismissButtonText,
                { color: isDark ? '#ddd' : designTokens.colors.ink2 },
              ]}
            >
              Keep going
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 22,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 20,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: designTokens.font.medium,
    fontSize: 19,
    letterSpacing: -0.38,
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    fontFamily: designTokens.font.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonContainer: {
    width: '100%',
    gap: 10,
  },
  proceedButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designTokens.colors.brand,
    paddingVertical: 14,
    borderRadius: 999,
  },
  proceedButtonText: {
    color: designTokens.colors.cream,
    fontFamily: designTokens.font.semibold,
    fontSize: 15,
  },
  dismissButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  dismissButtonText: {
    fontFamily: designTokens.font.medium,
    fontSize: 14,
  },
});
