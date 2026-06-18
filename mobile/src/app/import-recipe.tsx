// Import Recipe modal — PlannPlate design language.
// Visual-only redesign: every store call, mutation, route, haptic, URL param,
// and side effect from the previous version is preserved verbatim.
// No Sparkles. One italic word per screen ("recipe" in the header).
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  X,
  Link as LinkIcon,
  FileText,
  Instagram,
  Youtube,
  Globe,
  ChevronRight,
  // Premium icon swaps — no Sparkles, no AlertCircle.
  Wand2,
  AlertTriangle,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useMutation } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import {
  extractRecipeFromUrl,
  extractRecipeFromText,
  isUrl,
  detectSourceType,
  type ImportedRecipe,
} from '@/lib/recipeImport';
import { isOpenAIConfigured } from '@/lib/openai';
import { useColorScheme } from '@/lib/useColorScheme';
import { useRecipeFeatureGate } from '@/hooks/useRecipeFeatureGate';
import { designTokens, getThemeColors } from '@/lib/design-tokens';

type ImportMethod = 'url' | 'text';

export default function ImportRecipeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sharedUrl?: string; sharedText?: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = getThemeColors(isDark);
  // One free use, then the paywall (independent per-feature gate).
  const recipeGate = useRecipeFeatureGate('import', 'import-recipe');

  const [importMethod, setImportMethod] = useState<ImportMethod>(params.sharedUrl ? 'url' : 'url');
  const [urlInput, setUrlInput] = useState(params.sharedUrl ?? '');
  const [textInput, setTextInput] = useState(params.sharedText ?? '');
  const [extractedRecipe, setExtractedRecipe] = useState<ImportedRecipe | null>(null);

  const isConfigured = isOpenAIConfigured();

  // URL extraction mutation — preserved verbatim.
  const urlMutation = useMutation({
    mutationFn: (url: string) => extractRecipeFromUrl(url),
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      recipeGate.markUsed(); // successful import — spend the free use
      setExtractedRecipe(data);
      router.push({
        pathname: '/import-review',
        params: { recipe: JSON.stringify(data) },
      });
    },
    onError: (error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.error('URL extraction error:', error);
    },
  });

  // Text extraction mutation — preserved verbatim.
  const textMutation = useMutation({
    mutationFn: (text: string) => extractRecipeFromText(text),
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      recipeGate.markUsed(); // successful import — spend the free use
      setExtractedRecipe(data);
      router.push({
        pathname: '/import-review',
        params: { recipe: JSON.stringify(data) },
      });
    },
    onError: (error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.error('Text extraction error:', error);
    },
  });

  const isPending = urlMutation.isPending || textMutation.isPending;
  const error = urlMutation.error || textMutation.error;
  const { mutate: mutateUrl } = urlMutation;
  const { mutate: mutateText } = textMutation;

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (isUrl(text)) {
          setImportMethod('url');
          setUrlInput(text);
        } else {
          setImportMethod('text');
          setTextInput(text);
        }
      }
    } catch (err) {
      console.error('Failed to paste from clipboard:', err);
    }
  }, []);

  const handleExtract = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (importMethod === 'url') {
      const trimmedUrl = urlInput.trim();
      if (!trimmedUrl) return;
      mutateUrl(trimmedUrl);
    } else {
      const trimmedText = textInput.trim();
      if (!trimmedText) return;
      mutateText(trimmedText);
    }
  }, [importMethod, urlInput, textInput, mutateUrl, mutateText]);

  const sourceType = urlInput ? detectSourceType(urlInput) : null;

  const getSourceIcon = () => {
    switch (sourceType) {
      case 'instagram':
        return <Instagram size={16} color="#E1306C" strokeWidth={1.8} />;
      case 'youtube':
        return <Youtube size={16} color="#FF0000" strokeWidth={1.8} />;
      default:
        return <Globe size={16} color={isDark ? '#888' : designTokens.colors.ink3} strokeWidth={1.8} />;
    }
  };

  const canExtract = importMethod === 'url' ? urlInput.trim().length > 0 : textInput.trim().length > 0;

  // Reusable style tokens.
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
    backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
  };

  // Gated (free use spent) — paywall is showing, render nothing.
  if (recipeGate.blocked) return null;

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <Animated.View
          entering={FadeInDown.springify()}
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
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
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
            <X size={18} color={isDark ? '#fff' : designTokens.colors.ink} strokeWidth={1.8} />
          </Pressable>

          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 19,
              color: colors.ink,
              letterSpacing: -0.38,
            }}
          >
            Import{' '}
            <Text
              style={{
                fontFamily: designTokens.font.serifItalic,
                fontStyle: 'italic',
                fontSize: 22,
                letterSpacing: -0.22,
              }}
            >
              recipe
            </Text>
          </Text>

          <View style={{ width: 40 }} />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 140 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* API Not Configured warning */}
            {!isConfigured && (
              <Animated.View
                entering={FadeInDown.delay(100).springify()}
                style={{ paddingHorizontal: 20, marginBottom: 18 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                    backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: isDark ? '#2a2a2a' : '#FFFFFF',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                    }}
                  >
                    <AlertTriangle size={15} color={designTokens.colors.olive} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 13.5,
                        color: isDark ? '#fff' : designTokens.colors.ink,
                      }}
                    >
                      API key required
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 12,
                        color: isDark ? '#888' : designTokens.colors.ink2,
                        marginTop: 2,
                      }}
                    >
                      Supabase must be configured for AI features to work
                    </Text>
                  </View>
                </View>
              </Animated.View>
            )}

            {/* Import method selector */}
            <Animated.View
              entering={FadeInDown.delay(150).springify()}
              style={{ paddingHorizontal: 20, marginBottom: 18 }}
            >
              <Text style={sectionEyebrow}>Import from</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {([
                  { key: 'url' as ImportMethod, icon: LinkIcon, label: 'URL / Link' },
                  { key: 'text' as ImportMethod, icon: FileText, label: 'Text / Recipe' },
                ]).map(({ key, icon: Icon, label }) => {
                  const active = importMethod === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setImportMethod(key);
                      }}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        paddingVertical: 12,
                        borderRadius: 999,
                        borderWidth: active ? 0 : 1,
                        borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                        backgroundColor: active ? designTokens.colors.brand : (isDark ? '#1f1f1f' : '#FFFFFF'),
                      }}
                    >
                      <Icon
                        size={16}
                        color={active ? designTokens.colors.cream : (isDark ? '#888' : designTokens.colors.ink3)}
                        strokeWidth={1.8}
                      />
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 13.5,
                          color: active ? designTokens.colors.cream : (isDark ? '#ddd' : designTokens.colors.ink),
                        }}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>

            {/* Paste from clipboard */}
            <Animated.View
              entering={FadeInDown.delay(200).springify()}
              style={{ paddingHorizontal: 20, marginBottom: 18 }}
            >
              <Pressable
                onPress={handlePasteFromClipboard}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 11,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                  backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                }}
              >
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 13.5,
                    color: isDark ? '#ddd' : designTokens.colors.ink2,
                  }}
                >
                  Paste from clipboard
                </Text>
              </Pressable>
            </Animated.View>

            {/* URL Input */}
            {importMethod === 'url' && (
              <Animated.View
                entering={FadeInDown.delay(250).springify()}
                style={{ paddingHorizontal: 20, marginBottom: 18 }}
              >
                <Text style={sectionEyebrow}>Recipe URL</Text>
                <View
                  style={{
                    ...fieldShellStyle,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  {sourceType && getSourceIcon()}
                  <TextInput
                    value={urlInput}
                    onChangeText={setUrlInput}
                    placeholder="Paste Instagram, TikTok, or website URL…"
                    placeholderTextColor={isDark ? '#666' : designTokens.colors.ink3}
                    style={{
                      flex: 1,
                      paddingVertical: 14,
                      fontFamily: designTokens.font.regular,
                      fontSize: 15,
                      color: isDark ? '#fff' : designTokens.colors.ink,
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </View>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12,
                    color: isDark ? '#888' : designTokens.colors.ink3,
                    marginTop: 8,
                    paddingHorizontal: 4,
                  }}
                >
                  Supports Instagram, TikTok, YouTube, Pinterest, and recipe websites.
                </Text>
              </Animated.View>
            )}

            {/* Text Input */}
            {importMethod === 'text' && (
              <Animated.View
                entering={FadeInDown.delay(250).springify()}
                style={{ paddingHorizontal: 20, marginBottom: 18 }}
              >
                <Text style={sectionEyebrow}>Recipe text</Text>
                <View
                  style={{
                    ...fieldShellStyle,
                    paddingVertical: 12,
                    minHeight: 200,
                  }}
                >
                  <TextInput
                    value={textInput}
                    onChangeText={(text) => setTextInput(text.slice(0, 2000))}
                    placeholder="Paste recipe text, ingredients list, or description…"
                    placeholderTextColor={isDark ? '#666' : designTokens.colors.ink3}
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 15,
                      color: isDark ? '#fff' : designTokens.colors.ink,
                      minHeight: 160,
                    }}
                    multiline
                    numberOfLines={8}
                    maxLength={2000}
                    textAlignVertical="top"
                  />
                  <Text
                    style={{
                      alignSelf: 'flex-end',
                      fontFamily: designTokens.font.regular,
                      fontSize: 11,
                      color: isDark ? '#666' : designTokens.colors.ink3,
                      marginTop: 4,
                    }}
                  >
                    {textInput.length}/2000
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12,
                    color: isDark ? '#888' : designTokens.colors.ink3,
                    marginTop: 8,
                    paddingHorizontal: 4,
                  }}
                >
                  Paste recipe text from any source — we'll extract the details automatically.
                </Text>
              </Animated.View>
            )}

            {/* Popular Sources */}
            <Animated.View
              entering={FadeInDown.delay(300).springify()}
              style={{ paddingHorizontal: 20, marginBottom: 18 }}
            >
              <Text style={sectionEyebrow}>Popular sources</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { name: 'Instagram', color: '#E1306C' },
                  { name: 'TikTok', color: '#000000' },
                  { name: 'Pinterest', color: '#E60023' },
                  { name: 'YouTube', color: '#FF0000' },
                  { name: 'Websites', color: isDark ? '#888' : designTokens.colors.ink3 },
                ].map((source) => (
                  <View
                    key={source.name}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 11,
                      paddingVertical: 7,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                    }}
                  >
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: source.color,
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 12,
                        color: isDark ? '#ddd' : designTokens.colors.ink2,
                      }}
                    >
                      {source.name}
                    </Text>
                  </View>
                ))}
              </View>
            </Animated.View>

            {/* Error state */}
            {error && (
              <Animated.View
                entering={FadeInDown.springify()}
                style={{ paddingHorizontal: 20, marginBottom: 18 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                    backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: isDark ? '#2a2a2a' : '#FFFFFF',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                    }}
                  >
                    <AlertTriangle size={15} color={designTokens.colors.olive} strokeWidth={1.8} />
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: designTokens.font.regular,
                      fontSize: 13,
                      lineHeight: 18,
                      color: isDark ? '#ddd' : designTokens.colors.ink2,
                    }}
                  >
                    {error?.message || 'Failed to extract recipe. Please try again.'}
                  </Text>
                </View>
              </Animated.View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Bottom Extract button */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: 32,
            backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
            borderTopWidth: 1,
            borderTopColor: isDark ? '#2a2a2a' : designTokens.colors.hair2,
          }}
        >
          <Pressable
            onPress={handleExtract}
            disabled={!isConfigured || isPending || !canExtract}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 15,
              borderRadius: 999,
              backgroundColor:
                isConfigured && !isPending && canExtract
                  ? designTokens.colors.brand
                  : (isDark ? '#2a2a2a' : designTokens.colors.hair2),
              opacity: isPending ? 0.85 : 1,
            }}
          >
            {isPending ? (
              <>
                <ActivityIndicator color={designTokens.colors.cream} size="small" />
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 15,
                    color: designTokens.colors.cream,
                  }}
                >
                  Extracting recipe…
                </Text>
              </>
            ) : (
              <>
                <Wand2
                  size={18}
                  color={
                    isConfigured && canExtract
                      ? designTokens.colors.cream
                      : (isDark ? '#666' : designTokens.colors.ink3)
                  }
                  strokeWidth={1.8}
                />
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 15,
                    color:
                      isConfigured && canExtract
                        ? designTokens.colors.cream
                        : (isDark ? '#666' : designTokens.colors.ink3),
                  }}
                >
                  Extract recipe
                </Text>
                <ChevronRight
                  size={18}
                  color={
                    isConfigured && canExtract
                      ? designTokens.colors.cream
                      : (isDark ? '#666' : designTokens.colors.ink3)
                  }
                  strokeWidth={1.8}
                />
              </>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
