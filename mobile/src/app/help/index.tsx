// Help home.
//
// Reached from Profile → Settings → Help & support. Deliberately NOT the
// centre of gravity of the support system: the composer is, and most people
// should meet it through a contextual prompt at the moment something breaks
// rather than by navigating here. This screen exists for the person who went
// looking.
//
// Layout follows app/privacy.tsx's editorial pattern, taken further: premium
// white, a serif accent on one word, and no card containers around the three
// primary actions. Cards imply parallel destinations; these are three phrasings
// of one action, so they read as a considered list instead of a settings grid.
//
// No icons on the three rows, on purpose. A wrench, a question mark and a
// lightbulb would be exactly the generic support iconography this product
// should never have.

import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import {
  designTokens,
  getThemeColors,
  serifItalicFontStyle,
} from '@/lib/design-tokens';
import { useColorScheme } from '@/lib/useColorScheme';
import { makeFailure, presentFailure } from '@/lib/failure';
import { PRIVACY_POLICY_URL } from '@/lib/legal';
import { supportCopy } from '@/lib/support/copy';
import { FAQS } from '@/lib/support/faqs';
import { openSupportComposer } from '@/lib/support/store';
import { listThreads } from '@/lib/support/api';
import { supportAnalytics } from '@/lib/support/analytics';
import type { SupportIntent, SupportThread } from '@/lib/support/types';

const INTENT_ORDER: SupportIntent[] = ['bug', 'question', 'idea'];

export default function HelpScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const colors = getThemeColors(isDark);

  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  // Refetch on focus rather than once on mount: the user comes back here after
  // sending, and an empty "your conversations" section immediately after would
  // read as though the message vanished.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      supportAnalytics.opened('settings');
      listThreads().then((result) => {
        if (alive && result.ok) setThreads(result.value);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const startComposer = useCallback((intent: SupportIntent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openSupportComposer({ intent, entry: 'help_home' });
  }, []);

  const toggleFaq = useCallback(
    (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setOpenFaq((current) => {
        if (current === id) return null;
        supportAnalytics.faqOpened(id);
        return id;
      });
    },
    [],
  );

  const contactFromFaq = useCallback((faqId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    supportAnalytics.faqContactClicked(faqId);
    // `feature` carries the FAQ id so we learn which answers send people on
    // to a person anyway — the signal that an answer isn't answering.
    openSupportComposer({ intent: 'question', feature: `faq:${faqId}`, entry: 'faq' });
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header — back only. No title: the headline below is the title, and
            repeating it in a nav bar would waste the screen's best line. */}
        <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              borderWidth: 1,
              borderColor: colors.hair,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={20} color={colors.ink2} strokeWidth={1.8} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 56 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Headline ──────────────────────────────────────────────────
              The one serif accent on this screen. Uses serifItalicFontStyle
              rather than a literal 'italic' — on Android the OS drops the
              serif face entirely when it tries to synthesise italic over a
              custom family. */}
          <Animated.View entering={FadeInDown.duration(320)}>
            <Text
              accessibilityRole="header"
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 30,
                lineHeight: 34,
                letterSpacing: -0.7,
                color: colors.ink,
              }}
            >
              {supportCopy.home.titleLead}{' '}
              <Text
                style={{
                  fontFamily: designTokens.font.serifItalic,
                  fontStyle: serifItalicFontStyle,
                  color: designTokens.colors.brand,
                }}
              >
                {supportCopy.home.titleAccent}
              </Text>
            </Text>
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 14.5,
                lineHeight: 21,
                color: colors.ink2,
                marginTop: 10,
                marginBottom: 30,
              }}
            >
              {supportCopy.home.subtitle}
            </Text>
          </Animated.View>

          {/* ── The three doors ───────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(80).duration(320)}>
            <View style={{ height: 1, backgroundColor: colors.hair2 }} />
            {INTENT_ORDER.map((intent) => (
              <IntentRow
                key={intent}
                intent={intent}
                onPress={() => startComposer(intent)}
                isDark={isDark}
              />
            ))}
          </Animated.View>

          {/* ── Your conversations ────────────────────────────────────────
              Section is omitted entirely when there are none. An empty state
              here would be a box explaining that nothing has happened yet —
              which is worse than silence. */}
          {threads.length > 0 && (
            <Animated.View entering={FadeInDown.delay(140).duration(320)} style={{ marginTop: 38 }}>
              <SectionLabel isDark={isDark}>{supportCopy.home.conversations}</SectionLabel>
              <View style={{ height: 1, backgroundColor: colors.hair2, marginTop: 12 }} />
              {threads.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  isDark={isDark}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/help/${thread.id}`);
                  }}
                />
              ))}
            </Animated.View>
          )}

          {/* ── Quick answers ─────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(200).duration(320)} style={{ marginTop: 38 }}>
            <SectionLabel isDark={isDark}>{supportCopy.home.quickAnswers}</SectionLabel>
            <View style={{ height: 1, backgroundColor: colors.hair2, marginTop: 12 }} />
            {FAQS.map((faq) => (
              <FaqRow
                key={faq.id}
                faq={faq}
                expanded={openFaq === faq.id}
                onToggle={() => toggleFaq(faq.id)}
                onContact={() => contactFromFaq(faq.id)}
                isDark={isDark}
              />
            ))}
          </Animated.View>

          {/* ── Footer ────────────────────────────────────────────────── */}
          <Text
            style={{
              textAlign: 'center',
              fontFamily: designTokens.font.regular,
              fontSize: 12.5,
              lineHeight: 19,
              color: colors.ink3,
              marginTop: 40,
            }}
          >
            {supportCopy.home.footer}{'\n'}
            <Text
              onPress={() => {
                Linking.openURL(PRIVACY_POLICY_URL).catch(() => {
                  presentFailure(makeFailure('unknown', { feature: 'external-link' }));
                });
              }}
              style={{
                fontFamily: designTokens.font.medium,
                color: designTokens.colors.brand,
              }}
            >
              {supportCopy.home.footerLink}
            </Text>
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function SectionLabel({ children, isDark }: { children: string; isDark: boolean }) {
  const colors = getThemeColors(isDark);
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontFamily: designTokens.font.medium,
        fontSize: 12.5,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        color: colors.ink3,
      }}
    >
      {children}
    </Text>
  );
}

function IntentRow({
  intent,
  onPress,
  isDark,
}: {
  intent: SupportIntent;
  onPress: () => void;
  isDark: boolean;
}) {
  const colors = getThemeColors(isDark);
  const copy = supportCopy.intents[intent];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${copy.row}. ${copy.rowHint}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 64,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.hair2,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: designTokens.font.medium,
            fontSize: 17,
            letterSpacing: -0.3,
            color: colors.ink,
          }}
        >
          {copy.row}
        </Text>
        <Text
          style={{
            fontFamily: designTokens.font.regular,
            fontSize: 13,
            color: colors.ink3,
            marginTop: 2,
          }}
        >
          {copy.rowHint}
        </Text>
      </View>
      <ChevronRight size={17} color={colors.ink3} strokeWidth={1.7} />
    </Pressable>
  );
}

function ThreadRow({
  thread,
  onPress,
  isDark,
}: {
  thread: SupportThread;
  onPress: () => void;
  isDark: boolean;
}) {
  const colors = getThemeColors(isDark);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        thread.unreadForUser
          ? `${thread.subject}. New reply.`
          : thread.subject
      }
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 60,
        paddingVertical: 13,
        borderBottomWidth: 1,
        borderBottomColor: colors.hair2,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: designTokens.font.medium,
            fontSize: 15,
            letterSpacing: -0.2,
            color: colors.ink,
          }}
        >
          {thread.subject}
        </Text>
        <Text
          style={{
            fontFamily: designTokens.font.regular,
            fontSize: 12.5,
            color: colors.ink3,
            marginTop: 2,
          }}
        >
          {thread.status === 'resolved'
            ? supportCopy.thread.statusResolved
            : thread.status === 'open'
              ? supportCopy.thread.statusOpen
              : supportCopy.thread.statusNew}
        </Text>
      </View>

      {/* Unread is a dot AND a changed status line — never colour alone. */}
      {thread.unreadForUser && (
        <Animated.View
          entering={FadeIn}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: designTokens.colors.olive,
          }}
          importantForAccessibility="no"
        />
      )}
      <ChevronRight size={16} color={colors.ink3} strokeWidth={1.7} />
    </Pressable>
  );
}

function FaqRow({
  faq,
  expanded,
  onToggle,
  onContact,
  isDark,
}: {
  faq: { id: string; question: string; answer: string };
  expanded: boolean;
  onToggle: () => void;
  onContact: () => void;
  isDark: boolean;
}) {
  const colors = getThemeColors(isDark);

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.hair2 }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={faq.question}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          minHeight: 56,
          paddingVertical: 14,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontFamily: designTokens.font.medium,
            fontSize: 15,
            lineHeight: 21,
            letterSpacing: -0.2,
            color: colors.ink,
          }}
        >
          {faq.question}
        </Text>
        {/* A rotating plus rather than a chevron: it reads as "more of this"
            instead of "go somewhere", which is what expanding actually does. */}
        <View
          style={{ transform: [{ rotate: expanded ? '45deg' : '0deg' }] }}
          importantForAccessibility="no"
        >
          <Plus size={16} color={colors.ink3} strokeWidth={1.8} />
        </View>
      </Pressable>

      {expanded && (
        <Animated.View entering={FadeInDown.duration(200)} style={{ paddingBottom: 18 }}>
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 14,
              lineHeight: 21,
              color: colors.ink2,
            }}
          >
            {faq.answer}
          </Text>
          {/* Never a dead end. */}
          <Pressable
            onPress={onContact}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${supportCopy.faq.stillStuck} ${supportCopy.faq.stillStuckAction}`}
            style={{ minHeight: 40, justifyContent: 'center', marginTop: 4 }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 13.5,
                color: colors.ink3,
              }}
            >
              {supportCopy.faq.stillStuck}{' '}
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  color: designTokens.colors.brand,
                }}
              >
                {supportCopy.faq.stillStuckAction}
              </Text>
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}
