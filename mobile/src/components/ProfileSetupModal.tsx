import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, TextInput, Image, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, ImageIcon, User, Check, X, Sparkles } from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/lib/useColorScheme';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/lib/auth-store';
import { useSubscriptionStore, useNeedsProfileSetup, useUserAvatar, useUserName } from '@/lib/subscription-store';
import { pickImage, takePhoto, uploadFile } from '@/lib/upload';

// Default avatars - colorful initials-style avatars
const DEFAULT_AVATARS = [
  { id: 'sage', color: '#6a7d56', bgColor: '#e8eee3' },
  { id: 'terracotta', color: '#e46d46', bgColor: '#fceae3' },
  { id: 'charcoal', color: '#404040', bgColor: '#e5e5e5' },
  { id: 'blue', color: '#3b82f6', bgColor: '#dbeafe' },
  { id: 'purple', color: '#8b5cf6', bgColor: '#ede9fe' },
  { id: 'pink', color: '#ec4899', bgColor: '#fce7f3' },
];

interface ProfileSetupModalProps {
  visible: boolean;
  onComplete: () => void;
}

export function ProfileSetupModal({ visible, onComplete }: ProfileSetupModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.currentUser);
  const updateProfile = useSubscriptionStore((s) => s.updateProfile);
  const existingName = useUserName();
  const existingAvatar = useUserAvatar();

  const [name, setName] = useState(existingName || currentUser?.name || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(existingAvatar);
  const [selectedDefaultAvatar, setSelectedDefaultAvatar] = useState<string | null>(
    existingAvatar ? null : 'sage'
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handlePickImage = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const file = await pickImage();
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await uploadFile(file.uri, file.filename, file.mimeType);
      setAvatarUrl(result.url);
      setSelectedDefaultAvatar(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Upload failed:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleTakePhoto = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const file = await takePhoto();
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await uploadFile(file.uri, file.filename, file.mimeType);
      setAvatarUrl(result.url);
      setSelectedDefaultAvatar(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Upload failed:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleSelectDefaultAvatar = useCallback((avatarId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDefaultAvatar(avatarId);
    setAvatarUrl(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!currentUser?.id || !name.trim()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSaving(true);

    try {
      // If using default avatar, store the avatar ID as a special URL format
      const finalAvatarUrl = avatarUrl || (selectedDefaultAvatar ? `default:${selectedDefaultAvatar}` : null);

      const success = await updateProfile(currentUser.id, {
        name: name.trim(),
        avatarUrl: finalAvatarUrl,
        profileCompleted: true,
      });

      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onComplete();
        // Navigate to preferences to complete remaining profile settings
        router.push('/(tabs)/preferences');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (error) {
      console.error('Save profile failed:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  }, [currentUser?.id, name, avatarUrl, selectedDefaultAvatar, updateProfile, onComplete, router]);

  const getInitials = (displayName: string) => {
    return displayName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const selectedDefault = DEFAULT_AVATARS.find((a) => a.id === selectedDefaultAvatar);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View className={cn("flex-1", isDark ? "bg-charcoal-900" : "bg-cream-50")}>
        <LinearGradient
          colors={isDark ? ['#536343', '#262626'] : ['#e8eee3', '#fefdfb']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 350 }}
        />

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header with Photo in Top Right */}
          <Animated.View
            entering={FadeInDown.delay(100).springify()}
            className="flex-row pt-16 pb-6 px-6"
          >
            {/* Left side - Text content */}
            <View className="flex-1 pr-4">
              <View className={cn(
                "w-12 h-12 rounded-2xl items-center justify-center mb-3",
                isDark ? "bg-sage-600" : "bg-sage-500"
              )}>
                <Sparkles size={24} color="#fff" />
              </View>
              <Text className={cn(
                "text-2xl font-bold",
                isDark ? "text-white" : "text-charcoal-900"
              )}>
                Welcome!
              </Text>
              <Text className={cn(
                "text-xl font-bold mt-1",
                isDark ? "text-white" : "text-charcoal-900"
              )}>
                Let's set up your profile
              </Text>
              <Text className={cn(
                "text-sm mt-2",
                isDark ? "text-charcoal-400" : "text-charcoal-500"
              )}>
                Add a photo and confirm your name to personalize your experience
              </Text>
            </View>

            {/* Right side - Avatar with upload buttons */}
            <View className="items-center">
              <View className="relative">
                <View className={cn(
                  "w-24 h-24 rounded-full overflow-hidden items-center justify-center",
                  isDark ? "bg-charcoal-700" : "bg-cream-200"
                )}>
                  {isUploading ? (
                    <ActivityIndicator size="large" color={isDark ? '#a6b594' : '#6a7d56'} />
                  ) : avatarUrl ? (
                    <Image
                      source={{ uri: avatarUrl }}
                      className="w-full h-full"
                      resizeMode="cover"
                    />
                  ) : selectedDefault ? (
                    <View
                      className="w-full h-full items-center justify-center"
                      style={{ backgroundColor: isDark ? selectedDefault.color : selectedDefault.bgColor }}
                    >
                      <Text
                        className="text-3xl font-bold"
                        style={{ color: isDark ? '#fff' : selectedDefault.color }}
                      >
                        {getInitials(name || 'U')}
                      </Text>
                    </View>
                  ) : (
                    <User size={40} color={isDark ? '#6d6d6d' : '#888888'} />
                  )}
                </View>

                {/* Upload Buttons */}
                <View className="absolute -bottom-2 -right-2 flex-row">
                  <Pressable
                    onPress={handlePickImage}
                    disabled={isUploading}
                    className={cn(
                      "w-9 h-9 rounded-full items-center justify-center mr-1",
                      isDark ? "bg-sage-600" : "bg-sage-500"
                    )}
                  >
                    <ImageIcon size={16} color="#fff" />
                  </Pressable>
                  <Pressable
                    onPress={handleTakePhoto}
                    disabled={isUploading}
                    className={cn(
                      "w-9 h-9 rounded-full items-center justify-center",
                      isDark ? "bg-terracotta-600" : "bg-terracotta-500"
                    )}
                  >
                    <Camera size={16} color="#fff" />
                  </Pressable>
                </View>
              </View>
            </View>
          </Animated.View>

          {/* Name Input */}
          <Animated.View
            entering={FadeInDown.delay(300).springify()}
            className="px-6 mb-6"
          >
            <Text className={cn(
              "text-base font-semibold mb-2",
              isDark ? "text-white" : "text-charcoal-900"
            )}>
              Your Name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Enter your name"
              placeholderTextColor={isDark ? '#6d6d6d' : '#888888'}
              className={cn(
                "px-4 py-4 rounded-2xl text-base",
                isDark ? "bg-charcoal-800 text-white" : "bg-white text-charcoal-900"
              )}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </Animated.View>

          {/* Save Button */}
          <Animated.View
            entering={FadeInDown.delay(400).springify()}
            className="px-6"
          >
            <Pressable
              onPress={handleSave}
              disabled={!name.trim() || isSaving}
              className={cn(
                "py-4 rounded-2xl items-center flex-row justify-center",
                name.trim() && !isSaving
                  ? isDark ? "bg-sage-600" : "bg-sage-500"
                  : isDark ? "bg-charcoal-700" : "bg-cream-200"
              )}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Check size={20} color={name.trim() ? "#fff" : isDark ? '#6d6d6d' : '#888888'} />
                  <Text className={cn(
                    "text-base font-semibold ml-2",
                    name.trim() ? "text-white" : isDark ? "text-charcoal-500" : "text-charcoal-400"
                  )}>
                    Complete Setup
                  </Text>
                </>
              )}
            </Pressable>
          </Animated.View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// Helper component to render avatar (for use in other screens)
interface UserAvatarProps {
  size?: number;
  avatarUrl?: string | null;
  name?: string;
  className?: string;
}

export function UserAvatarDisplay({ size = 48, avatarUrl, name = 'U', className }: UserAvatarProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const getInitials = (displayName: string) => {
    return displayName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Check if it's a default avatar
  if (avatarUrl?.startsWith('default:')) {
    const avatarId = avatarUrl.replace('default:', '');
    const avatar = DEFAULT_AVATARS.find((a) => a.id === avatarId) || DEFAULT_AVATARS[0];

    return (
      <View
        className={cn("rounded-full items-center justify-center", className)}
        style={{
          width: size,
          height: size,
          backgroundColor: isDark ? avatar.color : avatar.bgColor,
        }}
      >
        <Text
          className="font-bold"
          style={{
            fontSize: size * 0.4,
            color: isDark ? '#fff' : avatar.color,
          }}
        >
          {getInitials(name)}
        </Text>
      </View>
    );
  }

  // Custom uploaded image
  if (avatarUrl) {
    return (
      <View
        className={cn("rounded-full overflow-hidden", className)}
        style={{ width: size, height: size }}
      >
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size }}
          resizeMode="cover"
        />
      </View>
    );
  }

  // Fallback - no avatar
  return (
    <View
      className={cn(
        "rounded-full items-center justify-center",
        isDark ? "bg-sage-600" : "bg-sage-500",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Text
        className="font-bold text-white"
        style={{ fontSize: size * 0.4 }}
      >
        {getInitials(name)}
      </Text>
    </View>
  );
}
