// MealCard Component - PlannPlate Home design
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import {
  Plus,
  ChevronRight,
  Leaf,
  Clock,
  Flame,
  Users,
  Check,
  AlertTriangle,
  Lock,
  Ban,
  Sandwich,
  Microwave,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
import { TakeoutBagIcon } from '@/components/icons/TakeoutBagIcon';

// Any icon usable on a placeholder card — Lucide icons and our custom SVG
// icons all accept this prop shape.
type PlaceholderIcon = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

export type MealCardState = 'planned' | 'planned-mini' | 'empty' | 'cooked';

interface MealCardMeta {
  time?: string;
  duration?: string;
  calories?: string;
  servings?: string;
}

interface MealTag {
  label: string;
  tone?: 'olive';
}

interface MealCardProps {
  slot: string;
  title?: string;
  image?: string;
  meta?: MealCardMeta;
  state: MealCardState;
  tag?: MealTag;
  /** For recipe-less placeholder slots — shows a matching symbol in place of
   *  the recipe image (skip / grab&go / buy-out / leftovers). */
  placeholderKind?: 'skip' | 'grab' | 'buy' | 'leftover';
  /** When > 1, render a sage "+N" chip showing additional recipes beyond the first. */
  recipeCount?: number;
  /** Whether the first recipe triggers user's allergies. */
  hasAllergens?: boolean;
  /** Restricted = paused account / future-date-out-of-range — disables interactions and shows lock. */
  isRestricted?: boolean;
  onPress?: () => void;
  onSwapPress?: () => void;
  onViewPress?: () => void;
  onLongPress?: () => void;
  onAllergenPress?: () => void;
  /** Tapping the "+N" chip opens the slot management sheet. */
  onCountChipPress?: () => void;
  isDark?: boolean;
}

const eyebrowStyle = {
  fontFamily: designTokens.font.medium,
  fontSize: 11,
  letterSpacing: 0.66,
  textTransform: 'uppercase' as const,
  color: designTokens.colors.ink3,
};

const rowActionBtn = {
  width: 32,
  height: 32,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: designTokens.colors.hair,
  backgroundColor: '#fff',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

export function MealCard({
  slot,
  title,
  image,
  meta,
  state,
  tag,
  placeholderKind,
  recipeCount = 0,
  hasAllergens = false,
  isRestricted = false,
  onPress,
  onSwapPress,
  onViewPress,
  onLongPress,
  onAllergenPress,
  onCountChipPress,
  isDark = false,
}: MealCardProps) {
  const colors = getThemeColors(isDark);
  const extraCount = recipeCount > 1 ? recipeCount - 1 : 0;

  const handleLongPress = onLongPress
    ? () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        onLongPress();
      }
    : undefined;

  // ── Empty ────────────────────────────────────────────────────
  if (state === 'empty') {
    return (
      <Pressable
        onPress={isRestricted ? undefined : onPress}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingTop: 14,
          paddingBottom: 14,
          paddingLeft: 16,
          paddingRight: 14,
          borderRadius: 18,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.hair,
          backgroundColor: colors.bg,
          opacity: isRestricted ? 0.55 : 1,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.hair,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isRestricted ? (
            <Lock size={16} color={designTokens.colors.ink3} strokeWidth={1.8} />
          ) : (
            <Plus size={18} color={designTokens.colors.ink2} strokeWidth={1.6} />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={eyebrowStyle}>
            {meta?.time ? `${slot} · ${meta.time}` : slot}
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 15,
              color: colors.ink,
              marginTop: 2,
            }}
          >
            {isRestricted ? 'Meal planning paused' : `Add ${slot.toLowerCase()}`}
          </Text>
        </View>

        <ChevronRight size={18} color={designTokens.colors.ink3} strokeWidth={1.6} />
      </Pressable>
    );
  }

  // ── Planned-mini (snack) ─────────────────────────────────────
  if (state === 'planned-mini') {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={handleLongPress}
        delayLongPress={500}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.hair,
          backgroundColor: colors.bg,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: designTokens.colors.brand,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Leaf size={18} color="#fff" strokeWidth={1.6} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={eyebrowStyle}>
            {meta?.time ? `${slot} · ${meta.time}` : slot}
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 14.5,
              color: colors.ink,
              marginTop: 1,
              letterSpacing: -0.07,
            }}
            numberOfLines={1}
          >
            {title}
            {meta?.duration && (
              <Text style={{ color: colors.ink3 }}> · {meta.duration}</Text>
            )}
          </Text>
        </View>

        {hasAllergens && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onAllergenPress?.();
            }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              backgroundColor: '#F5A623',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 4,
            }}
          >
            <AlertTriangle size={14} color="#fff" strokeWidth={2.2} />
          </Pressable>
        )}

        {extraCount > 0 ? (
          <View
            style={{
              paddingHorizontal: 10,
              height: 32,
              borderRadius: 999,
              backgroundColor: designTokens.colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 12.5,
                color: '#fff',
                letterSpacing: -0.12,
              }}
            >
              +{extraCount}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  // ── Non-cooked placeholder (Skip / Grab & go / Buy out / Leftovers) ──
  // A lighter, compact row — clearly secondary to a real cooked meal. Colour-
  // coded by kind; leftovers lead with the reheated dish + a "Leftovers" pill.
  if ((state === 'planned' || state === 'cooked') && placeholderKind) {
    const KIND: Record<
      NonNullable<MealCardProps['placeholderKind']>,
      { Icon: PlaceholderIcon; accent: string; tint: string; label: string }
    > = {
      leftover: {
        Icon: Microwave,
        accent: designTokens.colors.brand,
        tint: 'rgba(84,100,69,0.10)',
        label: 'Leftovers',
      },
      grab: {
        Icon: Sandwich,
        accent: designTokens.colors.olive,
        tint: 'rgba(228,109,70,0.10)',
        label: 'Grab & go',
      },
      buy: {
        Icon: TakeoutBagIcon,
        accent: designTokens.colors.ink2,
        tint: colors.hair2,
        label: 'Buy out',
      },
      skip: {
        Icon: Ban,
        accent: designTokens.colors.ink3,
        tint: colors.hair2,
        label: 'Skipped',
      },
    };
    const k = KIND[placeholderKind];
    const Icon = k.Icon;
    // Leftovers store "Leftovers · <dish>" — pull the dish out to feature it.
    const leftoverDish =
      placeholderKind === 'leftover' && title?.startsWith('Leftovers · ')
        ? title.slice('Leftovers · '.length)
        : null;

    return (
      <Pressable
        onPress={onPress}
        onLongPress={handleLongPress}
        delayLongPress={500}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.hair,
          backgroundColor: colors.bg,
          opacity: placeholderKind === 'skip' ? 0.85 : 1,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: k.tint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={20} color={k.accent} strokeWidth={1.8} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={eyebrowStyle}>
            {meta?.time ? `${slot} · ${meta.time}` : slot}
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 14.5,
              color: leftoverDish ? colors.ink : colors.ink2,
              marginTop: 2,
              letterSpacing: -0.1,
            }}
            numberOfLines={1}
          >
            {leftoverDish ?? k.label}
          </Text>
        </View>

        {/* Kind pill — names the treatment (and the leftover source for clarity) */}
        <View
          style={{
            paddingHorizontal: 9,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: k.tint,
          }}
        >
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 11,
              color: k.accent,
              letterSpacing: -0.05,
            }}
          >
            {k.label}
          </Text>
        </View>
      </Pressable>
    );
  }

  // ── Planned / Cooked ─────────────────────────────────────────
  const metaParts: { icon: React.ReactNode; label: string }[] = [];
  if (meta?.duration) {
    metaParts.push({
      icon: <Clock size={12} color={designTokens.colors.ink2} strokeWidth={1.8} />,
      label: meta.duration,
    });
  }
  if (meta?.calories) {
    metaParts.push({
      icon: <Flame size={12} color={designTokens.colors.ink2} strokeWidth={1.8} />,
      label: meta.calories,
    });
  }
  if (meta?.servings) {
    metaParts.push({
      icon: <Users size={12} color={designTokens.colors.ink2} strokeWidth={1.8} />,
      label: meta.servings,
    });
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={handleLongPress}
      delayLongPress={500}
      style={{
        flexDirection: 'row',
        gap: 14,
        padding: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.hair,
        backgroundColor: colors.bg,
      }}
    >
      {/* Image */}
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 14,
          backgroundColor: '#F4F0E8',
          overflow: 'hidden',
        }}
      >
        {image ? (
          <Image source={{ uri: image }} style={{ width: 88, height: 88 }} contentFit="cover" transition={150} />
        ) : null}
      </View>

      {/* Content */}
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'column' }}>
        <Text style={eyebrowStyle}>
          {meta?.time ? `${slot} · ${meta.time}` : slot}
        </Text>

        <Text
          style={{
            fontFamily: designTokens.font.medium,
            fontSize: 15.5,
            color: colors.ink,
            marginTop: 2,
            letterSpacing: -0.155,
            lineHeight: 19,
          }}
          numberOfLines={2}
        >
          {title}
        </Text>

        {/* Meta row */}
        {metaParts.length > 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginTop: 5,
            }}
          >
            {metaParts.map((part, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && (
                  <View
                    style={{
                      width: 2,
                      height: 2,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.ink3,
                    }}
                  />
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {part.icon}
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 12.5,
                      color: colors.ink2,
                    }}
                  >
                    {part.label}
                  </Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Footer */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 'auto',
            paddingTop: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            {tag ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: 'rgba(228,109,70,0.10)',
                }}
              >
                <Check size={11} color={designTokens.colors.olive} strokeWidth={2.2} />
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 11.5,
                    color: designTokens.colors.olive,
                  }}
                >
                  {tag.label}
                </Text>
              </View>
            ) : null}
            {extraCount > 0 && (
              <View
                style={{
                  paddingHorizontal: 9,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: designTokens.colors.brand,
                }}
              >
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 11.5,
                    color: '#fff',
                    letterSpacing: -0.12,
                  }}
                >
                  +{extraCount}
                </Text>
              </View>
            )}
          </View>

          {hasAllergens && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onAllergenPress?.();
              }}
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                backgroundColor: '#F5A623',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={14} color="#fff" strokeWidth={2.2} />
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}
