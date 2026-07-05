// NudgeCard Component - PlannPlate Home design
// Smart suggestion card that prompts user to simplify meals
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Sparkles, X, Check } from 'lucide-react-native';
import { designTokens } from '@/lib/design-tokens';

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
   *  (charcoal, no eyebrow/title) instead of the standard eyebrow+title card. */
  steps?: NudgeStep[];
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  onDismiss?: () => void;
  isDark?: boolean;
}

function StepDot({ state }: { state: NudgeStep['state'] }) {
  if (state === 'done') {
    return (
      <View
        style={{
          width: 19,
          height: 19,
          borderRadius: 999,
          backgroundColor: designTokens.colors.brand,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Check size={12} color="#fff" strokeWidth={2.6} />
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
        borderColor: state === 'active' ? designTokens.colors.olive : 'rgba(255,255,255,0.22)',
      }}
    />
  );
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
  steps,
  onPrimaryAction,
  onSecondaryAction,
  onDismiss,
}: NudgeCardProps) {
  const cardBg = designTokens.colors.charcoal;
  const textColor = '#F6F2E9';

  // Compact progress-stepper variant (Plan → Grocery → Cook). No eyebrow or
  // title, so the card is noticeably shorter than the standard nudge.
  if (steps && steps.length > 0) {
    return (
      <View style={{ marginHorizontal: 16, marginBottom: 22 }}>
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 20,
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
                        height: 1,
                        backgroundColor: 'rgba(255,255,255,0.14)',
                        marginHorizontal: 6,
                      }}
                    />
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <StepDot state={step.state} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 12.5,
                        letterSpacing: -0.12,
                        color:
                          step.state === 'active'
                            ? textColor
                            : step.state === 'done'
                            ? 'rgba(246,242,233,0.75)'
                            : 'rgba(246,242,233,0.45)',
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
                <X size={16} color={'rgba(246,242,233,0.5)'} />
              </Pressable>
            )}
          </View>

          {/* Primary action — full width for a clear, compact tap target */}
          {onPrimaryAction && (
            <Pressable
              onPress={onPrimaryAction}
              style={{
                backgroundColor: designTokens.colors.olive,
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
                  color: '#fff',
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
