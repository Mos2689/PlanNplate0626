// Edit Profile modal — PlannPlate design language.
// Visual-only redesign: every store call, mutation, ImagePicker call, supabase
// upload, Alert, and haptic from the previous version is preserved verbatim.
// No Sparkles. One italic word per screen ("profile" in the header).
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  X,
  UtensilsCrossed,
  AlertTriangle,
  Clock,
  ChefHat,
  Users,
  ChevronRight,
  Check,
  Camera,
  User,
  Home,
  Wallet,
  // Premium icon swaps — no Sparkles, no generic Plus/Minus.
  Wand2,
  CirclePlus,
  CircleMinus,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useMealPlanStore } from '@/lib/store';
import { useSubscriptionStore, useUserAvatar, useUserName } from '@/lib/subscription-store';
import { useAuthStore } from '@/lib/auth-store';
import { useColorScheme } from '@/lib/useColorScheme';
import { UserAvatarDisplay } from '@/components/ProfileSetupModal';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
// Option vocabularies are shared with PlanTuneSheet via a single
// module so the two surfaces never drift on a new diet or cuisine.
import {
  DIETARY_OPTIONS,
  CUISINE_OPTIONS,
  ALLERGY_OPTIONS,
  SKILL_LEVELS,
  PREP_TIME_OPTIONS,
  HOUSEHOLD_OPTIONS,
  ADVENTURE_LEVELS,
} from '@/lib/preference-options';

// ── Shared style helpers ──────────────────────────────────────────────────
function useStyles(isDark: boolean) {
  return {
    card: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
      backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
      padding: 16,
      marginBottom: 12,
    } as const,
    iconTile: {
      width: 32,
      height: 32,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
      backgroundColor: isDark ? '#2a2a2a' : '#FFFFFF',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    title: {
      fontFamily: designTokens.font.medium,
      fontSize: 15,
      color: isDark ? '#fff' : designTokens.colors.ink,
    },
    subtitle: {
      fontFamily: designTokens.font.regular,
      fontSize: 12.5,
      color: isDark ? '#888' : designTokens.colors.ink2,
      marginTop: 2,
    },
    chipOff: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
      backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
    },
    chipOn: (tone: 'sage' | 'olive') => ({
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: tone === 'sage' ? designTokens.colors.brand : designTokens.colors.olive,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
    }),
  };
}

interface MultiSelectSectionProps {
  title: string;
  subtitle: string;
  options: readonly string[];
  selected: string[];
  onToggle: (option: string) => void;
  isDark: boolean;
  icon: React.ReactNode;
  tone?: 'sage' | 'olive';
}

function MultiSelectSection({ title, subtitle, options, selected, onToggle, isDark, icon, tone = 'sage' }: MultiSelectSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const styles = useStyles(isDark);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded(!expanded);
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View style={styles.iconTile}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            {selected.length > 0 ? `${selected.length} selected` : subtitle}
          </Text>
        </View>
        <ChevronRight
          size={18}
          color={isDark ? '#888' : designTokens.colors.ink3}
          strokeWidth={1.8}
          style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
        />
      </Pressable>

      {expanded && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {options.map((option) => {
            const isSelected = selected.includes(option);
            return (
              <Pressable
                key={option}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onToggle(option);
                }}
                style={isSelected ? styles.chipOn(tone) : styles.chipOff}
              >
                {isSelected && <Check size={12} color={designTokens.colors.cream} strokeWidth={2.4} />}
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 12.5,
                    color: isSelected ? designTokens.colors.cream : (isDark ? '#ddd' : designTokens.colors.ink2),
                  }}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function HouseholdDropdown({ isDark, preferences, setPreferences }: any) {
  const [expanded, setExpanded] = useState(false);
  const selected = HOUSEHOLD_OPTIONS.find((o) => o.id === preferences.household);
  const styles = useStyles(isDark);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded(!expanded);
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View style={styles.iconTile}>
          <Home size={16} color={designTokens.colors.brand} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Who are you cooking for?</Text>
          <Text style={styles.subtitle}>{selected ? selected.label : 'Select one'}</Text>
        </View>
        <ChevronRight
          size={18}
          color={isDark ? '#888' : designTokens.colors.ink3}
          strokeWidth={1.8}
          style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
        />
      </Pressable>

      {expanded && (
        <View style={{ gap: 8, marginTop: 14 }}>
          {HOUSEHOLD_OPTIONS.map((opt) => {
            const isSelected = preferences.household === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPreferences({ household: opt.id });
                  setExpanded(false);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  padding: 12,
                  borderRadius: 14,
                  borderWidth: isSelected ? 0 : 1,
                  borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                  backgroundColor: isSelected ? designTokens.colors.brand : (isDark ? '#1a1a1a' : '#FFFFFF'),
                }}
              >
                {isSelected && <Check size={15} color={designTokens.colors.cream} strokeWidth={2.4} />}
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 13.5,
                    color: isSelected ? designTokens.colors.cream : (isDark ? '#ddd' : designTokens.colors.ink),
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}


interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

export function EditProfileModal({ visible, onClose }: EditProfileModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = getThemeColors(isDark);
  const styles = useStyles(isDark);

  const preferences = useMealPlanStore((s) => s.preferences);
  const setPreferences = useMealPlanStore((s) => s.setPreferences);

  const currentUser = useAuthStore((s) => s.currentUser);
  const userAvatar = useUserAvatar();
  const userName = useUserName();
  const updateProfile = useSubscriptionStore((s) => s.updateProfile);

  // Local state for editing
  const [editName, setEditName] = useState('');
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize local state when modal opens
  useEffect(() => {
    if (visible) {
      setEditName(userName || currentUser?.name || '');
      setLocalAvatarUri(null);
    }
  }, [visible, userName, currentUser?.name]);

  const toggleDietaryRestriction = useCallback((restriction: string) => {
    const current = preferences.dietaryRestrictions;
    const updated = current.includes(restriction)
      ? current.filter((r) => r !== restriction)
      : [...current, restriction];
    setPreferences({ dietaryRestrictions: updated });
  }, [preferences.dietaryRestrictions, setPreferences]);

  const toggleCuisinePreference = useCallback((cuisine: string) => {
    const current = preferences.cuisinePreferences;
    const updated = current.includes(cuisine)
      ? current.filter((c) => c !== cuisine)
      : [...current, cuisine];
    setPreferences({ cuisinePreferences: updated });
  }, [preferences.cuisinePreferences, setPreferences]);

  const toggleAllergy = useCallback((allergy: string) => {
    const current = preferences.allergies;
    const updated = current.includes(allergy)
      ? current.filter((a) => a !== allergy)
      : [...current, allergy];
    setPreferences({ allergies: updated });
  }, [preferences.allergies, setPreferences]);

  // Pick image from library — preserved verbatim.
  const pickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library to change your profile photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setLocalAvatarUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  }, []);

  // Take photo with camera — preserved verbatim.
  const takePhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your camera to take a profile photo.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setLocalAvatarUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  }, []);

  // Show photo options — preserved verbatim.
  const handlePhotoPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Change Profile Photo',
      'Choose an option',
      [
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Library', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [takePhoto, pickImage]);

  // Upload image to Supabase Storage — preserved verbatim.
  const uploadImage = async (uri: string): Promise<string | null> => {
    if (!isSupabaseConfigured() || !currentUser?.id) return null;

    try {
      setIsUploading(true);

      const response = await fetch(uri);
      const blob = await response.blob();

      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Convert blob to ArrayBuffer using FileReader (Hermes doesn't support blob.arrayBuffer())
      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer) {
            resolve(reader.result);
          } else {
            reject(new Error('FileReader did not return an ArrayBuffer'));
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
      });

      const { error: uploadError } = await supabase.storage
        .from('user-uploads')
        .upload(filePath, arrayBuffer, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('user-uploads')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  // Save profile changes — preserved verbatim.
  const handleSave = useCallback(async () => {
    if (!currentUser?.id) return;

    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      let avatarUrl = userAvatar;

      if (localAvatarUri) {
        const uploadedUrl = await uploadImage(localAvatarUri);
        if (uploadedUrl) {
          avatarUrl = uploadedUrl;
        }
      }

      const success = await updateProfile(currentUser.id, {
        name: editName.trim() || currentUser.name,
        avatarUrl,
      });

      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose();
      } else {
        Alert.alert('Error', 'Failed to update profile. Please try again.');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [currentUser, editName, localAvatarUri, userAvatar, updateProfile, onClose]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  // Display avatar (local or remote)
  const displayAvatarUri = localAvatarUri || userAvatar;

  // ── Inline section helpers ──────────────────────────────────────────────
  const sectionEyebrow = {
    fontFamily: designTokens.font.medium,
    fontSize: 11,
    letterSpacing: 0.55,
    textTransform: 'uppercase' as const,
    color: isDark ? '#888' : designTokens.colors.ink3,
    marginBottom: 10,
  };

  const fieldShellStyle = {
    borderWidth: 1,
    borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
    backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF' }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          {/* Header */}
          <Animated.View
            entering={FadeInDown.delay(50).springify()}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: 12,
            }}
          >
            <Pressable
              onPress={handleClose}
              disabled={isSaving}
              style={{
                paddingHorizontal: 14,
                height: 36,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 13.5,
                  color: isDark ? '#ddd' : designTokens.colors.ink2,
                }}
              >
                Cancel
              </Text>
            </Pressable>

            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 19,
                color: colors.ink,
                letterSpacing: -0.38,
              }}
            >
              Edit{' '}
              <Text
                style={{
                  fontFamily: designTokens.font.serifItalic,
                  fontStyle: 'italic',
                  fontSize: 22,
                  letterSpacing: -0.22,
                }}
              >
                profile
              </Text>
            </Text>

            <Pressable
              onPress={handleSave}
              disabled={isSaving}
              style={{
                paddingHorizontal: 16,
                height: 36,
                borderRadius: 18,
                backgroundColor: designTokens.colors.brand,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isSaving ? 0.85 : 1,
                minWidth: 64,
              }}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={designTokens.colors.cream} />
              ) : (
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 13.5,
                    color: designTokens.colors.cream,
                  }}
                >
                  Save
                </Text>
              )}
            </Pressable>
          </Animated.View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {/* Profile Photo */}
            <Animated.View
              entering={FadeInDown.delay(100).springify()}
              style={{ alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 }}
            >
              <Pressable
                onPress={handlePhotoPress}
                disabled={isUploading}
                style={{ position: 'relative' }}
              >
                <View
                  style={{
                    width: 108,
                    height: 108,
                    borderRadius: 54,
                    padding: 3,
                    borderWidth: 1,
                    borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                    backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
                  }}
                >
                  {displayAvatarUri ? (
                    <Image
                      source={{ uri: displayAvatarUri }}
                      style={{ width: 100, height: 100, borderRadius: 50 }}
                    />
                  ) : (
                    <UserAvatarDisplay
                      size={100}
                      avatarUrl={null}
                      name={editName || currentUser?.name || 'User'}
                    />
                  )}
                  {isUploading && (
                    <View
                      style={{
                        position: 'absolute',
                        top: 3,
                        left: 3,
                        right: 3,
                        bottom: 3,
                        borderRadius: 50,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  )}
                </View>
                <View
                  style={{
                    position: 'absolute',
                    bottom: 2,
                    right: 2,
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: designTokens.colors.brand,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: isDark ? '#1a1a1a' : '#FFFFFF',
                  }}
                >
                  <Camera size={14} color={designTokens.colors.cream} strokeWidth={1.8} />
                </View>
              </Pressable>
              <Text
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 12.5,
                  color: isDark ? '#888' : designTokens.colors.ink3,
                  marginTop: 10,
                }}
              >
                Tap to change photo
              </Text>
            </Animated.View>

            <View style={{ paddingHorizontal: 20 }}>
              {/* Name */}
              <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <View style={styles.iconTile}>
                    <User size={16} color={designTokens.colors.brand} strokeWidth={1.8} />
                  </View>
                  <Text style={styles.title}>Display name</Text>
                </View>
                <View style={fieldShellStyle}>
                  <TextInput
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Enter your name"
                    placeholderTextColor={isDark ? '#666' : designTokens.colors.ink3}
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 15,
                      color: isDark ? '#fff' : designTokens.colors.ink,
                      padding: 0,
                    }}
                    maxLength={50}
                  />
                </View>
              </Animated.View>

              {/* Cooking Skill Level */}
              <Animated.View entering={FadeInDown.delay(140).springify()} style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <View style={styles.iconTile}>
                    <ChefHat size={16} color={designTokens.colors.brand} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>Cooking skill level</Text>
                    <Text style={styles.subtitle}>We'll match recipes to your experience</Text>
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  {SKILL_LEVELS.map((level) => {
                    const isSelected = preferences.cookingSkillLevel === level.key;
                    return (
                      <Pressable
                        key={level.key}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setPreferences({ cookingSkillLevel: level.key });
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: 12,
                          borderRadius: 14,
                          borderWidth: isSelected ? 0 : 1,
                          borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                          backgroundColor: isSelected ? designTokens.colors.brand : (isDark ? '#1a1a1a' : '#FFFFFF'),
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontFamily: designTokens.font.medium,
                              fontSize: 13.5,
                              color: isSelected ? designTokens.colors.cream : (isDark ? '#fff' : designTokens.colors.ink),
                            }}
                          >
                            {level.label}
                          </Text>
                          <Text
                            style={{
                              fontFamily: designTokens.font.regular,
                              fontSize: 12,
                              color: isSelected ? 'rgba(246,242,233,0.85)' : (isDark ? '#888' : designTokens.colors.ink2),
                              marginTop: 2,
                            }}
                          >
                            {level.description}
                          </Text>
                        </View>
                        {isSelected && <Check size={16} color={designTokens.colors.cream} strokeWidth={2.2} />}
                      </Pressable>
                    );
                  })}
                </View>
              </Animated.View>

              {/* Prep Time Preference */}
              <Animated.View entering={FadeInDown.delay(160).springify()} style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <View style={styles.iconTile}>
                    <Clock size={16} color={designTokens.colors.brand} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>Prep time preference</Text>
                    <Text style={styles.subtitle}>How much time do you have?</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {PREP_TIME_OPTIONS.map((option) => {
                    const isSelected = preferences.mealPrepTime === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setPreferences({ mealPrepTime: option.key });
                        }}
                        style={{
                          flex: 1,
                          alignItems: 'center',
                          paddingVertical: 12,
                          borderRadius: 14,
                          borderWidth: isSelected ? 0 : 1,
                          borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                          backgroundColor: isSelected ? designTokens.colors.brand : (isDark ? '#1a1a1a' : '#FFFFFF'),
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: designTokens.font.medium,
                            fontSize: 13.5,
                            color: isSelected ? designTokens.colors.cream : (isDark ? '#fff' : designTokens.colors.ink),
                          }}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={{
                            fontFamily: designTokens.font.regular,
                            fontSize: 11.5,
                            color: isSelected ? 'rgba(246,242,233,0.85)' : (isDark ? '#888' : designTokens.colors.ink2),
                            marginTop: 2,
                          }}
                        >
                          {option.description}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Animated.View>

              {/* Dietary Restrictions */}
              <Animated.View entering={FadeInDown.delay(340).springify()}>
                <MultiSelectSection
                  title="Dietary restrictions"
                  subtitle="Select any dietary preferences"
                  options={DIETARY_OPTIONS}
                  selected={preferences.dietaryRestrictions}
                  onToggle={toggleDietaryRestriction}
                  isDark={isDark}
                  icon={<UtensilsCrossed size={16} color={designTokens.colors.brand} strokeWidth={1.8} />}
                />
              </Animated.View>

              {/* Cuisine Preferences */}
              <Animated.View entering={FadeInDown.delay(280).springify()}>
                <MultiSelectSection
                  title="Cuisine preferences"
                  subtitle="What cuisines do you enjoy?"
                  options={CUISINE_OPTIONS}
                  selected={preferences.cuisinePreferences}
                  onToggle={toggleCuisinePreference}
                  isDark={isDark}
                  icon={<ChefHat size={16} color={designTokens.colors.brand} strokeWidth={1.8} />}
                />
              </Animated.View>

              {/* Allergies */}
              <Animated.View entering={FadeInDown.delay(360).springify()}>
                <MultiSelectSection
                  title="Allergies"
                  subtitle="Foods to avoid in recipes"
                  options={ALLERGY_OPTIONS}
                  selected={preferences.allergies}
                  onToggle={toggleAllergy}
                  isDark={isDark}
                  icon={<AlertTriangle size={16} color={designTokens.colors.olive} strokeWidth={1.8} />}
                  tone="olive"
                />
              </Animated.View>

              {/* Household */}
              <Animated.View entering={FadeInDown.delay(180).springify()}>
                <HouseholdDropdown isDark={isDark} preferences={preferences} setPreferences={setPreferences} />
              </Animated.View>

              {/* Serving Size */}
              <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <View style={styles.iconTile}>
                    <Users size={16} color={designTokens.colors.brand} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>Default servings</Text>
                    <Text style={styles.subtitle}>Number of people you usually cook for</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (preferences.servingSize > 1) {
                        setPreferences({ servingSize: preferences.servingSize - 1 });
                      }
                    }}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CircleMinus size={20} color={isDark ? '#fff' : designTokens.colors.ink} strokeWidth={1.8} />
                  </Pressable>
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 32,
                      color: isDark ? '#fff' : designTokens.colors.ink,
                      minWidth: 40,
                      textAlign: 'center',
                    }}
                  >
                    {preferences.servingSize}
                  </Text>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (preferences.servingSize < 12) {
                        setPreferences({ servingSize: preferences.servingSize + 1 });
                      }
                    }}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: designTokens.colors.brand,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CirclePlus size={20} color={designTokens.colors.cream} strokeWidth={1.8} />
                  </Pressable>
                </View>
              </Animated.View>

              {/* Adventure Level — uses Wand2 (no Sparkles) */}
              <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <View style={styles.iconTile}>
                    <Wand2 size={16} color={designTokens.colors.brand} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>Adventure level</Text>
                    <Text style={styles.subtitle}>From familiar to surprising recipes</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {ADVENTURE_LEVELS.map((level) => {
                    const active = preferences.adventureLevel === level;
                    return (
                      <Pressable
                        key={level}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setPreferences({ adventureLevel: level });
                        }}
                        style={{
                          flex: 1,
                          height: 40,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: active ? 0 : 1,
                          borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                          backgroundColor: active ? designTokens.colors.brand : (isDark ? '#1a1a1a' : '#FFFFFF'),
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 14,
                            color: active ? designTokens.colors.cream : (isDark ? '#fff' : designTokens.colors.ink),
                          }}
                        >
                          {level}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Animated.View>

              {/* Budget */}
              <Animated.View entering={FadeInDown.delay(380).springify()} style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <View style={styles.iconTile}>
                    <Wallet size={16} color={designTokens.colors.brand} strokeWidth={1.8} />
                  </View>
                  <Text style={styles.title}>Budget (optional)</Text>
                </View>
                <View style={{ gap: 10 }}>
                  <View
                    style={{
                      ...fieldShellStyle,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 11,
                        letterSpacing: 0.55,
                        textTransform: 'uppercase',
                        color: isDark ? '#888' : designTokens.colors.ink3,
                      }}
                    >
                      Weekly $
                    </Text>
                    <TextInput
                      value={String(preferences.weeklyBudget ?? '')}
                      onChangeText={(v) => {
                        const num = v.trim().length > 0 ? Number(v) : null;
                        setPreferences({ weeklyBudget: Number.isFinite(num) ? num : null });
                      }}
                      placeholder="100"
                      placeholderTextColor={isDark ? '#666' : designTokens.colors.ink3}
                      keyboardType="numeric"
                      style={{
                        flex: 1,
                        fontFamily: designTokens.font.regular,
                        fontSize: 15,
                        color: isDark ? '#fff' : designTokens.colors.ink,
                        padding: 0,
                      }}
                    />
                  </View>
                  <View
                    style={{
                      ...fieldShellStyle,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 11,
                        letterSpacing: 0.55,
                        textTransform: 'uppercase',
                        color: isDark ? '#888' : designTokens.colors.ink3,
                      }}
                    >
                      Monthly $
                    </Text>
                    <TextInput
                      value={String(preferences.monthlyBudget ?? '')}
                      onChangeText={(v) => {
                        const num = v.trim().length > 0 ? Number(v) : null;
                        setPreferences({ monthlyBudget: Number.isFinite(num) ? num : null });
                      }}
                      placeholder="400"
                      placeholderTextColor={isDark ? '#666' : designTokens.colors.ink3}
                      keyboardType="numeric"
                      style={{
                        flex: 1,
                        fontFamily: designTokens.font.regular,
                        fontSize: 15,
                        color: isDark ? '#fff' : designTokens.colors.ink,
                        padding: 0,
                      }}
                    />
                  </View>
                </View>
              </Animated.View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
