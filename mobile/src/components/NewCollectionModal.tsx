// NewCollectionModal — name + colour composer for a user-created recipe
// collection. Shared by the Recipes tab ("+ New Collection" card) and the
// Save-to-collection sheet, so both entry points create collections
// identically.
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput, Modal } from 'react-native';
import { Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useMealPlanStore, COLLECTION_COLORS } from '@/lib/store';
import { designTokens, getThemeColors } from '@/lib/design-tokens';

interface NewCollectionModalProps {
  visible: boolean;
  isDark: boolean;
  onClose: () => void;
  /** Fired with the new collection's id once created. */
  onCreated?: (id: string) => void;
}

export function NewCollectionModal({
  visible,
  isDark,
  onClose,
  onCreated,
}: NewCollectionModalProps) {
  const colors = getThemeColors(isDark);
  const createCollection = useMealPlanStore((s) => s.createCollection);

  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(COLLECTION_COLORS[0]);

  // Reset the form each time the sheet opens so a cancelled draft never
  // leaks into the next create.
  useEffect(() => {
    if (visible) {
      setName('');
      setColor(COLLECTION_COLORS[0]);
    }
  }, [visible]);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = createCollection(trimmed, color);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onCreated?.(id);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(21,20,15,0.45)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            borderRadius: 24,
            backgroundColor: colors.bg,
            borderWidth: 1,
            borderColor: colors.hair,
            padding: 20,
          }}
        >
          <Text
            style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 17,
              color: colors.ink,
              letterSpacing: -0.3,
            }}
          >
            New collection
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Weeknight Wins"
            placeholderTextColor={colors.ink3}
            autoFocus
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            style={{
              marginTop: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.hair,
              backgroundColor: colors.pill,
              fontFamily: designTokens.font.medium,
              fontSize: 15,
              color: colors.ink,
            }}
          />

          {/* Colour picker — sets the collection card's tint. */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            {COLLECTION_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => {
                  Haptics.selectionAsync();
                  setColor(c);
                }}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  backgroundColor: c,
                  borderWidth: color === c ? 2 : 1,
                  borderColor: color === c ? designTokens.colors.ink : colors.hair,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {color === c && (
                  <Check size={15} color={designTokens.colors.ink} strokeWidth={2.6} />
                )}
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <Pressable
              onPress={onClose}
              style={{
                flex: 1,
                paddingVertical: 13,
                borderRadius: 14,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: colors.hair,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 14.5,
                  color: colors.ink2,
                }}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleCreate}
              disabled={!name.trim()}
              style={{
                flex: 1,
                paddingVertical: 13,
                borderRadius: 14,
                alignItems: 'center',
                backgroundColor: designTokens.colors.brand,
                opacity: name.trim() ? 1 : 0.45,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 14.5,
                  color: '#fff',
                }}
              >
                Create
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
