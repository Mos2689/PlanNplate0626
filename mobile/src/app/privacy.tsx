// Privacy summary — a short, plain-English overview of how PlanNplate handles
// your data, with a link out to the full hosted Privacy Policy. Reached from
// Profile → Settings → "Privacy".
import React, { useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ChevronLeft,
  Database,
  Sparkles,
  SlidersHorizontal,
  Globe,
  ArrowUpRight,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { designTokens } from '@/lib/design-tokens';
import { useColorScheme } from '@/lib/useColorScheme';
import { PRIVACY_POLICY_URL, PRIVACY_CONTACT_EMAIL } from '@/lib/legal';

interface Section {
  icon: React.ReactNode;
  title: string;
  body: string;
}

export default function PrivacyScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const bg = isDark ? '#161512' : designTokens.colors.cream;
  const cardBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const hair = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const ink = isDark ? '#fff' : designTokens.colors.ink;
  const ink2 = isDark ? '#A0A0A0' : designTokens.colors.ink2;
  const ink3 = isDark ? '#777' : designTokens.colors.ink3;

  const openFullPolicy = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(PRIVACY_POLICY_URL).catch(() => {
      Alert.alert('Error', 'Unable to open the full Privacy Policy right now.');
    });
  }, []);

  const emailUs = useCallback(() => {
    Linking.openURL(`mailto:${PRIVACY_CONTACT_EMAIL}`).catch(() => {});
  }, []);

  const sections: Section[] = [
    {
      icon: <Database size={17} color={designTokens.colors.brand} strokeWidth={1.9} />,
      title: 'What we collect',
      body:
        'Your account (email and name), your food preferences and allergies — only with your consent — the meal plans, recipes and grocery lists you create, and optional voice input when you speak your list.',
    },
    {
      icon: <Sparkles size={17} color={designTokens.colors.brand} strokeWidth={1.9} />,
      title: 'Why we use it',
      body:
        'To personalise your meals, keep allergens out of your suggestions, and run the app. We never sell your data, and we don’t use your content to train third-party AI models.',
    },
    {
      icon: <SlidersHorizontal size={17} color={designTokens.colors.brand} strokeWidth={1.9} />,
      title: 'You’re in control',
      body:
        'Edit or clear your preferences anytime, turn off the microphone or notifications in your device settings, and delete your account and data whenever you like — right from your profile.',
    },
    {
      icon: <Globe size={17} color={designTokens.colors.brand} strokeWidth={1.9} />,
      title: 'Where it’s stored',
      body:
        'Your data is held securely with trusted providers and encrypted in transit. Some providers process data overseas, including in the United States.',
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingTop: 6,
            paddingBottom: 12,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              borderWidth: 1,
              borderColor: hair,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: cardBg,
            }}
          >
            <ChevronLeft size={20} color={ink2} strokeWidth={1.8} />
          </Pressable>
          <Text
            style={{
              flex: 1,
              textAlign: 'center',
              marginRight: 38,
              fontFamily: designTokens.font.medium,
              fontSize: 17,
              letterSpacing: -0.34,
              color: ink,
            }}
          >
            Privacy
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Intro */}
          <Text
            style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 22,
              letterSpacing: -0.5,
              color: ink,
              marginBottom: 8,
            }}
          >
            Your privacy, in plain English
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 14,
              lineHeight: 21,
              color: ink2,
              marginBottom: 22,
            }}
          >
            The short version of how PlanNplate handles your information. The full
            policy has all the detail.
          </Text>

          {/* Summary cards */}
          {sections.map((s) => (
            <View
              key={s.title}
              style={{
                flexDirection: 'row',
                gap: 12,
                padding: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: hair,
                backgroundColor: cardBg,
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  backgroundColor: isDark
                    ? 'rgba(84,100,69,0.22)'
                    : 'rgba(84,100,69,0.10)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {s.icon}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 15,
                    letterSpacing: -0.2,
                    color: ink,
                    marginBottom: 3,
                  }}
                >
                  {s.title}
                </Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 13,
                    lineHeight: 19,
                    color: ink2,
                  }}
                >
                  {s.body}
                </Text>
              </View>
            </View>
          ))}

          {/* Full policy button */}
          <Pressable
            onPress={openFullPolicy}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: designTokens.colors.brand,
              borderRadius: 999,
              paddingVertical: 15,
              marginTop: 10,
            }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 15,
                color: '#fff',
                letterSpacing: -0.2,
              }}
            >
              Read the full privacy policy
            </Text>
            <ArrowUpRight size={17} color="#fff" strokeWidth={2} />
          </Pressable>

          {/* Contact */}
          <Text
            style={{
              textAlign: 'center',
              fontFamily: designTokens.font.regular,
              fontSize: 12.5,
              color: ink3,
              marginTop: 18,
            }}
          >
            Questions?{' '}
            <Text
              onPress={emailUs}
              style={{ color: designTokens.colors.brand, fontFamily: designTokens.font.medium }}
            >
              {PRIVACY_CONTACT_EMAIL}
            </Text>
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
