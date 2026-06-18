// QuickActions — flagship CTA row on the Meal Planning tab.
//
// These are the three most important buttons in the app, so they get
// editorial treatment: tinted icon discs, real material depth, scale-on-
// press feedback, and refined hierarchy. The primary tile (PnP Suggests
// — our hero "system picks a plan for you" behaviour) is full-width on
// warm sage; the two secondary tiles (Build grocery list + Explore meal
// plans) sit beneath in a 2-col row, each carrying its own accent color
// so the row reads as a curated trio, not a generic list.
//
// Icons are intentionally domain-flavored and restrained:
//   • UtensilsCrossed — premium dining iconography (Michelin-guide DNA)
//     for the hero "we set the table for you" CTA. NOT Sparkles/Wand/
//     ChefHat which read as AI-slop or cartoon.
//   • ShoppingCart — pragmatic utility for grocery.
//   • Compass — curated discovery for explore.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import {
  ShoppingCart,
  UtensilsCrossed,
  Compass,
  ChevronRight,
  Lock,
} from 'lucide-react-native';
import { designTokens, elevation, getThemeColors } from '@/lib/design-tokens';
import { VibeHeartIcon } from '@/components/icons/VibeHeartIcon';

export interface QuickActionItem {
  icon: 'cart' | 'utensils' | 'compass' | 'flame';
  title: string;
  subtitle?: string;
  variant?: 'primary' | 'secondary';
  // Optional 3-image stack rendered on the right of the primary tile
  // (between text and chevron). Each entry is either a remote URL or
  // a `require()`-resolved local asset id (RN returns a number for
  // those). Mix is supported so cold-start fallback assets can sit
  // alongside the user's recent recipe URLs without branching at the
  // render site.
  thumbnails?: Array<string | number>;
}

interface QuickActionsProps {
  items: QuickActionItem[];
  onActionPress?: (item: QuickActionItem, index: number) => void;
  isDark?: boolean;
  /** When true, all CTAs render with a lock overlay + dimmed opacity + presses no-op. */
  isRestricted?: boolean;
  /** Optional wrapper per item. */
  wrapItem?: (item: QuickActionItem, index: number, child: React.ReactNode) => React.ReactNode;
}

function ActionIcon({
  name,
  size = 20,
  color = '#000',
  strokeWidth = 1.7,
}: {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  switch (name) {
    case 'cart':
      return <ShoppingCart size={size} color={color} strokeWidth={strokeWidth} />;
    case 'utensils':
      return <UtensilsCrossed size={size} color={color} strokeWidth={strokeWidth} />;
    case 'compass':
      return <Compass size={size} color={color} strokeWidth={strokeWidth} />;
    case 'flame':
      return <VibeHeartIcon size={size} color={color} strokeWidth={strokeWidth} />;
    default:
      return null;
  }
}

// ─── Thumbnail stack — primary tile right-edge accent ──────────────────
// Up to 3 overlapping circular food images that peek out between the
// title block and the chevron. Renders right-to-left in the JSX
// (rightmost = "front" of the stack) so the most recent thumbnail
// reads as the top card. Each disc has a cream ring for separation
// against the sage tile background; the front-most disc is slightly
// larger and shadowed so the stack feels three-dimensional.
//
// Accepts both URL strings (user's actual recipe images) and
// `require()`-resolved local asset numbers (cold-start fallback
// from VIBES) — expo-image's source prop handles both natively.
const THUMB_SIZE_BACK = 34;
const THUMB_SIZE_FRONT = 38;
const THUMB_OVERLAP = 18; // px each subsequent disc is pulled left over the previous
const THUMB_OPACITY = [0.82, 0.92, 1.0] as const; // back → middle → front

function ThumbnailStack({ thumbnails }: { thumbnails: Array<string | number> }) {
  // Cap at 3 — the design is calibrated for exactly that count.
  const items = thumbnails.slice(0, 3);
  if (items.length === 0) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        // Reserve enough horizontal space for the rightmost disc plus
        // (n-1) * overlap so it never collides with the chevron.
        marginRight: 6,
      }}
    >
      {items.map((src, i) => {
        const isFront = i === items.length - 1;
        const size = isFront ? THUMB_SIZE_FRONT : THUMB_SIZE_BACK;
        const opacity = THUMB_OPACITY[i] ?? 1;
        return (
          <View
            key={i}
            style={{
              width: size,
              height: size,
              borderRadius: 999,
              marginLeft: i === 0 ? 0 : -THUMB_OVERLAP,
              borderWidth: 2,
              borderColor: 'rgba(246,242,233,0.92)',
              backgroundColor: 'rgba(246,242,233,0.18)',
              overflow: 'hidden',
              opacity,
              // Front-most disc gets a soft lift so the stack reads as
              // layered, not flat. Back discs stay shadow-free to
              // avoid muddying the tile's existing sage shadow.
              shadowColor: isFront ? '#000' : 'transparent',
              shadowOpacity: isFront ? 0.18 : 0,
              shadowRadius: isFront ? 5 : 0,
              shadowOffset: isFront ? { width: 0, height: 2 } : { width: 0, height: 0 },
              elevation: isFront ? 2 : 0,
              // Front disc on top of the stack visually.
              zIndex: i,
            }}
          >
            <Image
              source={typeof src === 'string' ? { uri: src } : src}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={150}
            />
          </View>
        );
      })}
    </View>
  );
}

const DEFAULT_ACTIONS: QuickActionItem[] = [
  { icon: 'utensils', title: 'Plan My Meals', subtitle: 'A plan, picked for you', variant: 'primary' },
  { icon: 'cart', title: 'Get Groceries', subtitle: 'Ready for this week' },
];

// Per-tile accent map for the SECONDARY 2-col row. Full-saturation discs
// (no pastel tints) — solid sage / solid olive backgrounds with cream
// icons on top. Mirrors the hero primary tile's icon treatment so the
// whole row reads as one deliberate visual system, not three styles.
//   • cart (grocery)    → solid sage   — pragmatic, matches brand calm
//   • compass (explore) → solid olive  — warm discovery, invites the eye
const SECONDARY_ACCENTS: Record<string, { bg: string; fg: string }> = {
  cart: {
    bg: designTokens.colors.brand,      // #546445 — sage
    fg: '#F6F2E9',                       // cream
  },
  compass: {
    bg: designTokens.colors.olive,      // #E46D46 — terracotta
    fg: '#F6F2E9',
  },
  flame: {
    bg: designTokens.colors.olive,      // #E46D46 — terracotta (vibe cooking)
    fg: '#F6F2E9',
  },
  utensils: {
    bg: designTokens.colors.brand,
    fg: '#F6F2E9',
  },
};

export function QuickActions({
  items,
  onActionPress,
  isDark = false,
  isRestricted = false,
  wrapItem,
}: QuickActionsProps) {
  const colors = getThemeColors(isDark);
  const actions = items.length >= 2 ? items : DEFAULT_ACTIONS;

  const handlePress = (item: QuickActionItem, index: number) => {
    if (isRestricted) return;
    onActionPress?.(item, index);
  };

  const identity = (_i: QuickActionItem, _idx: number, child: React.ReactNode) => child;
  const wrap = wrapItem ?? identity;

  // ─── Primary full-width tile (grocery) ──────────────────────────────
  const primary = actions[0];
  const primaryNode = primary ? (
    <Pressable onPress={() => handlePress(primary, 0)} style={{ width: '100%' }}>
      {({ pressed }) => (
        <View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
              paddingHorizontal: 20,
              paddingVertical: 14,
              borderRadius: 24,
              backgroundColor: designTokens.colors.brand,
              opacity: isRestricted ? 0.55 : 1,
              shadowColor: designTokens.colors.brandDeep,
              shadowOpacity: 0.22,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
              elevation: 4,
              transform: [{ scale: pressed && !isRestricted ? 0.985 : 1 }],
              overflow: 'hidden',
            },
          ]}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 15,
              backgroundColor: 'rgba(255,255,255,0.13)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isRestricted ? (
              <Lock size={20} color="#F6F2E9" strokeWidth={1.9} />
            ) : (
              <ActionIcon name={primary.icon} size={22} color="#F6F2E9" strokeWidth={1.85} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 17,
                color: '#fff',
                letterSpacing: -0.25,
              }}
              numberOfLines={1}
            >
              {isRestricted ? 'Paused' : primary.title}
            </Text>
            {primary.subtitle ? (
              <Text
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 13.5,
                  color: 'rgba(246,242,233,0.78)',
                  marginTop: 4,
                  letterSpacing: -0.1,
                }}
                numberOfLines={1}
              >
                {isRestricted ? 'Resume to access this' : primary.subtitle}
              </Text>
            ) : null}
          </View>
          {/* Thumbnail stack — recent recipes peek out as a visual
              preview of "the kind of stuff we'll pick for you". Hidden
              in the restricted/paused state since a stack of food pics
              alongside "Paused" copy would read as a mixed signal. */}
          {!isRestricted && primary.thumbnails && primary.thumbnails.length > 0 ? (
            <ThumbnailStack thumbnails={primary.thumbnails} />
          ) : null}
          <ChevronRight size={20} color="rgba(246,242,233,0.78)" strokeWidth={1.9} />
        </View>
      )}
    </Pressable>
  ) : null;

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 28 }}>
      <Text
        style={{
          fontFamily: designTokens.font.medium,
          fontSize: 19,
          color: colors.ink,
          letterSpacing: -0.38,
          marginBottom: 14,
        }}
      >
        Quick actions
      </Text>

      <View style={{ gap: 10 }}>
        {primary && primaryNode ? wrap(primary, 0, primaryNode) : null}

        {/* ─── Secondary 2-col row — each tile keeps icon+text horizontal ─── */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {actions.slice(1).map((item, index) => {
            const idx = index + 1;
            const accent = SECONDARY_ACCENTS[item.icon] ?? SECONDARY_ACCENTS.compass;

            const node = (
              <Pressable
                onPress={() => handlePress(item, idx)}
                style={{ width: '100%' }}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 11,
                        paddingHorizontal: 12,
                        paddingVertical: 13,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: colors.hair,
                        backgroundColor: colors.bg,
                        opacity: isRestricted ? 0.55 : 1,
                        ...elevation.card,
                        transform: [{ scale: pressed && !isRestricted ? 0.98 : 1 }],
                      },
                    ]}
                  >
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        backgroundColor: isRestricted
                          ? designTokens.colors.skipped
                          : accent.bg,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isRestricted ? (
                        <Lock size={16} color="#F6F2E9" strokeWidth={1.9} />
                      ) : (
                        <ActionIcon
                          name={item.icon}
                          size={18}
                          color={accent.fg}
                          strokeWidth={1.9}
                        />
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 13.5,
                          color: colors.ink,
                          letterSpacing: -0.15,
                        }}
                        numberOfLines={1}
                      >
                        {isRestricted ? 'Paused' : item.title}
                      </Text>
                      {item.subtitle ? (
                        <Text
                          style={{
                            fontFamily: designTokens.font.regular,
                            fontSize: 11.5,
                            color: colors.ink2,
                            marginTop: 2,
                            letterSpacing: -0.05,
                          }}
                          numberOfLines={1}
                        >
                          {isRestricted ? 'Resume' : item.subtitle}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                )}
              </Pressable>
            );
            return (
              <View key={idx} style={{ flex: 1 }}>
                {wrap(item, idx, node)}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
