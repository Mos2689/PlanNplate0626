// ConfirmDialog — reusable Yes/No confirmation modal in the new design language.
import React from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import * as Haptics from 'expo-haptics';
import { designTokens, getThemeColors } from '@/lib/design-tokens';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  /** lucide-react-native icon element rendered in the top circle */
  icon?: React.ReactNode;
  /** Background of the top icon circle. Default: olive @ 18% */
  iconBg?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Color used for the confirm button background. Default: olive (terracotta). */
  confirmColor?: string;
  isDark?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  icon,
  iconBg,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  confirmColor = designTokens.colors.olive,
  isDark = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const colors = getThemeColors(isDark);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
        }}
      >
        <View
          style={{
            width: '100%',
            backgroundColor: colors.bg,
            borderRadius: 24,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: colors.hair,
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 22, paddingHorizontal: 20 }}>
            {icon ? (
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 999,
                  backgroundColor: iconBg ?? 'rgba(228,109,70,0.15)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                {icon}
              </View>
            ) : null}
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 18,
                color: colors.ink,
                letterSpacing: -0.18,
                textAlign: 'center',
              }}
            >
              {title}
            </Text>
            {message ? (
              <Text
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 13.5,
                  color: designTokens.colors.ink2,
                  marginTop: 8,
                  lineHeight: 19,
                  textAlign: 'center',
                }}
              >
                {message}
              </Text>
            ) : null}
          </View>

          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              padding: 18,
              paddingTop: 18,
            }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onCancel();
              }}
              style={{
                flex: 1,
                paddingVertical: 13,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.hair,
                alignItems: 'center',
                backgroundColor: colors.bg,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 14.5,
                  color: colors.ink,
                  letterSpacing: -0.145,
                }}
              >
                {cancelLabel}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                onConfirm();
              }}
              style={{
                flex: 1,
                paddingVertical: 13,
                borderRadius: 14,
                alignItems: 'center',
                backgroundColor: confirmColor,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 14.5,
                  color: '#fff',
                  letterSpacing: -0.145,
                }}
              >
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
