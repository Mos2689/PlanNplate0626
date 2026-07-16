import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { designTokens } from '@/lib/design-tokens';
import {
  providerDisplayName,
  type SocialProvider,
} from '@/lib/social-auth';

interface SocialAuthButtonsProps {
  disabled?: boolean;
  isDark: boolean;
  loadingProvider: SocialProvider | null;
  onPress: (provider: SocialProvider) => void;
}

const providers: {
  provider: SocialProvider;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  lightSurface: string;
  darkSurface: string;
}[] = [
  {
    provider: 'google',
    icon: 'logo-google',
    color: '#4285F4',
    lightSurface: '#F5F7FB',
    darkSurface: '#20242A',
  },
  {
    provider: 'facebook',
    icon: 'logo-facebook',
    color: '#1877F2',
    lightSurface: '#F1F6FE',
    darkSurface: '#1E2733',
  },
  {
    provider: 'apple',
    icon: 'logo-apple',
    color: '#191813',
    lightSurface: '#F6F4EF',
    darkSurface: '#24231F',
  },
];

export function SocialAuthButtons({
  disabled = false,
  isDark,
  loadingProvider,
  onPress,
}: SocialAuthButtonsProps) {
  const visibleProviders = providers.filter(
    ({ provider }) => provider !== 'apple' || Platform.OS === 'ios',
  );
  const borderColor = isDark ? '#333333' : designTokens.colors.hair;

  return (
    <View style={{ marginBottom: 20 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
        }}
      >
        {visibleProviders.map(
          ({ provider, icon, color, lightSurface, darkSurface }) => {
            const isLoading = loadingProvider === provider;
            const name = providerDisplayName(provider);
            return (
              <Pressable
                key={provider}
                accessibilityRole="button"
                accessibilityLabel={`Continue with ${name}`}
                accessibilityHint={`Opens ${name} authentication`}
                accessibilityState={{
                  disabled: disabled || Boolean(loadingProvider),
                  busy: isLoading,
                }}
                disabled={disabled || Boolean(loadingProvider)}
                hitSlop={4}
                onPress={() => onPress(provider)}
                style={({ pressed }) => ({
                  width: 58,
                  height: 58,
                  borderRadius: 29,
                  borderWidth: 1,
                  borderColor,
                  backgroundColor: isDark ? darkSurface : lightSurface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: designTokens.colors.ink,
                  shadowOffset: { width: 0, height: pressed ? 2 : 5 },
                  shadowOpacity: isDark ? 0.18 : pressed ? 0.05 : 0.09,
                  shadowRadius: pressed ? 4 : 10,
                  elevation: pressed ? 1 : 3,
                  opacity: disabled ? 0.5 : 1,
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                })}
              >
                {isLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={provider === 'apple' && isDark ? '#F4F2EB' : color}
                  />
                ) : (
                  <Ionicons
                    name={icon}
                    size={24}
                    color={provider === 'apple' && isDark ? '#F4F2EB' : color}
                  />
                )}
              </Pressable>
            );
          },
        )}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          marginTop: 20,
        }}
      >
        <View style={{ flex: 1, height: 1, backgroundColor: borderColor }} />
        <Text
          style={{
            fontFamily: designTokens.font.medium,
            fontSize: 11,
            letterSpacing: 0.45,
            textTransform: 'uppercase',
            color: isDark ? '#777777' : designTokens.colors.ink3,
          }}
        >
          Or continue with email
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: borderColor }} />
      </View>
    </View>
  );
}
