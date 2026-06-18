// NudgeCard Component - PlannPlate Home design
// Smart suggestion card that prompts user to simplify meals
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Sparkles, X } from 'lucide-react-native';
import { designTokens } from '@/lib/design-tokens';

interface NudgeCardProps {
  eyebrow?: string;
  title?: string;
  message?: string;
  primaryAction?: string;
  secondaryAction?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  onDismiss?: () => void;
  isDark?: boolean;
}

export function NudgeCard({
  // Default copy intentionally empty — every real call site (home tab)
  // passes explicit props from the nudge engine. Removing the old
  // "A small idea" defaults so a regression can't silently re-introduce
  // the deleted fallback variant.
  eyebrow = '',
  title = '',
  message = '',
  primaryAction = '',
  secondaryAction = '',
  onPrimaryAction,
  onSecondaryAction,
  onDismiss,
}: NudgeCardProps) {
  const cardBg = designTokens.colors.charcoal;
  const textColor = '#F6F2E9';

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 22 }}>
      <View
        style={{
          backgroundColor: cardBg,
          borderRadius: 20,
          paddingTop: 16,
          paddingHorizontal: 16,
          paddingBottom: 14,
          overflow: 'hidden',
        }}
      >
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Sparkles tile */}
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.06)',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles size={16} color={designTokens.colors.olive} strokeWidth={1.8} />
          </View>

          {/* Content */}
          <View style={{ flex: 1, minWidth: 0 }}>
            {/* Eyebrow + dismiss */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 11,
                  letterSpacing: 1.1,
                  textTransform: 'uppercase',
                  color: designTokens.colors.olive,
                }}
              >
                {eyebrow}
              </Text>
              {onDismiss && (
                <Pressable
                  onPress={onDismiss}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  style={{ marginTop: -2 }}
                >
                  <X size={16} color={'rgba(246,242,233,0.5)'} />
                </Pressable>
              )}
            </View>

            {/* Bold title — description intentionally omitted to keep the
                card compact (title + actions only). */}
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 16.5,
                letterSpacing: -0.165,
                marginTop: 4,
                lineHeight: 22,
                color: textColor,
              }}
            >
              {title}
            </Text>

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {onPrimaryAction && (
                <Pressable
                  onPress={onPrimaryAction}
                  style={{
                    backgroundColor: designTokens.colors.olive,
                    borderRadius: 999,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      color: '#fff',
                      fontSize: 13.5,
                      letterSpacing: -0.135,
                    }}
                  >
                    {primaryAction}
                  </Text>
                </Pressable>
              )}
              {onSecondaryAction && (
                <Pressable
                  onPress={onSecondaryAction}
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderWidth: 1,
                    borderColor: 'rgba(246,242,233,0.2)',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      color: textColor,
                      fontSize: 13.5,
                      letterSpacing: -0.135,
                    }}
                  >
                    {secondaryAction}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
