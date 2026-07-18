// NudgeCard Component - PlannPlate Home design
// Smart suggestion card that prompts user to simplify meals.
// Themed to sit alongside the green "cooking today" hero: a light cream card
// (dark surface in dark mode), olive-green primary button, terracotta accent
// on the active step.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Sparkles, X, Check } from 'lucide-react-native';
import { designTokens, getThemeColors } from '@/lib/design-tokens';

const OLIVE = designTokens.colors.brand;      // #546445 — olive-green (button, done step)
const TERRACOTTA = designTokens.colors.olive;  // #E46D46 — warm accent (active step)
const CREAM = designTokens.colors.cream;       // #F6F2E9

export interface NudgeStep {
  label: string;
  state: 'done' | 'active' | 'todo';
}

interface NudgeCardProps {
  eyebrow?: string;
  title?: string;
  message?: string;
  primaryAction?: string;
  secondaryAction?: string;
  /** When provided, renders a compact Plan → Grocery → Cook progress stepper
   *  (no eyebrow/title) instead of the standard eyebrow+title card. */
  steps?: NudgeStep[];
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  onDismiss?: () => void;
  isDark?: boolean;
}

function StepDot({ state, isDark }: { state: NudgeStep['state']; isDark: boolean }) {
  if (state === 'done') {
    return (
      <View
        style={{
          width: 19,
          height: 19,
          borderRadius: 999,
          backgroundColor: OLIVE,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Check size={12} color={CREAM} strokeWidth={2.6} />
      </View>
    );
  }
  return (
    <View
      style={{
        width: 19,
        height: 19,
        borderRadius: 999,
        borderWidth: 2,
        borderColor:
          state === 'active'
            ? TERRACOTTA
            : isDark
              ? 'rgba(255,255,255,0.22)'
              : '#CAC4B4',
      }}
    />
  );
}

export function NudgeCard({
  eyebrow = '',
  title = '',
  message = '',
  primaryAction = '',
  secondaryAction = '',
  steps,
  onPrimaryAction,
  onSecondaryAction,
  onDismiss,
  isDark = false,
}: NudgeCardProps) {
  const colors = getThemeColors(isDark);
  const cardBg = isDark ? '#1F1F1C' : CREAM;
  const cardBorder = isDark ? '#2A2A2A' : '#E4DFD2';
  const connColor = isDark ? 'rgba(255,255,255,0.12)' : '#E0DBCC';

  // Compact progress-stepper variant (Plan → Grocery → Cook).
  if (steps && steps.length > 0) {
    return (
      <View style={{ marginHorizontal: 16, marginBottom: 22 }}>
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: cardBorder,
            paddingTop: 14,
            paddingHorizontal: 16,
            paddingBottom: 14,
            overflow: 'hidden',
          }}
        >
          {/* Stepper + dismiss */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              {steps.map((step, i) => (
                <React.Fragment key={step.label}>
                  {i > 0 && (
                    <View
                      style={{
                        flex: 1,
                        height: 1.5,
                        backgroundColor: connColor,
                        marginHorizontal: 6,
                      }}
                    />
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <StepDot state={step.state} isDark={isDark} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 12.5,
                        letterSpacing: -0.12,
                        color:
                          step.state === 'active'
                            ? colors.ink
                            : step.state === 'done'
                              ? colors.ink2
                              : colors.ink3,
                      }}
                    >
                      {step.label}
                    </Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
            {onDismiss && (
              <Pressable
                onPress={onDismiss}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                style={{ marginLeft: 12 }}
              >
                <X size={16} color={colors.ink3} />
              </Pressable>
            )}
          </View>

          {/* Primary action — full width for a clear, compact tap target */}
          {onPrimaryAction && (
            <Pressable
              onPress={onPrimaryAction}
              style={{
                backgroundColor: OLIVE,
                borderRadius: 999,
                paddingVertical: 11,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 14,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  color: CREAM,
                  fontSize: 13.5,
                  letterSpacing: -0.135,
                }}
              >
                {primaryAction}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 22 }}>
      <View
        style={{
          backgroundColor: cardBg,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: cardBorder,
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
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(84,100,69,0.08)',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(84,100,69,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles size={16} color={TERRACOTTA} strokeWidth={1.8} />
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
                  color: TERRACOTTA,
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
                  <X size={16} color={colors.ink3} />
                </Pressable>
              )}
            </View>

            {/* Bold title */}
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 16.5,
                letterSpacing: -0.165,
                marginTop: 4,
                lineHeight: 22,
                color: colors.ink,
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
                    backgroundColor: OLIVE,
                    borderRadius: 999,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      color: CREAM,
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
                    borderColor: colors.hair,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      color: colors.ink2,
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
