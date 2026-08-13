// A support conversation.
//
// Chat-SHAPED, but deliberately not a chat: no typing indicators, no read
// receipts, no avatars, no timestamps on every line. Those affordances promise
// presence — that someone is there now — and a two-person team cannot keep that
// promise. What this screen promises instead is that the message was received
// and that the reply, when it comes, will be here and in the user's inbox.
//
// The thread id never appears on screen. It's in the route because routing
// needs it; showing it would turn a conversation into a case record, which is
// the exact register this product avoids.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { ChevronLeft, ArrowUp } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { designTokens, getThemeColors } from '@/lib/design-tokens';
import { useColorScheme } from '@/lib/useColorScheme';
import { presentFailure } from '@/lib/failure';
import { supportCopy } from '@/lib/support/copy';
import {
  getThread,
  markThreadRead,
  replyToThread,
  signedAttachmentUrl,
} from '@/lib/support/api';
import { supportAnalytics } from '@/lib/support/analytics';
import type { SupportMessage, SupportThreadDetail } from '@/lib/support/types';

export default function SupportThreadScreen() {
  const router = useRouter();
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const isDark = useColorScheme() === 'dark';
  const colors = getThemeColors(isDark);

  const [thread, setThread] = useState<SupportThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!threadId) return;
    const result = await getThread(threadId);
    if (result.ok) {
      setThread(result.value);
      // Clear the dot only once the reply is actually on screen — marking it
      // read on navigation would clear it for someone who tapped by accident.
      if (result.value.unreadForUser) void markThreadRead(threadId);
    } else {
      presentFailure(result.failure);
    }
    setLoading(false);
  }, [threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (thread) {
      supportAnalytics.threadOpened({
        intent: thread.type,
        hadUnread: thread.unreadForUser,
      });
    }
    // Fires once per thread load, not on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id]);

  const handleSend = useCallback(async () => {
    const message = reply.trim();
    if (!message || !threadId || sending) return;

    setSending(true);
    const result = await replyToThread(threadId, message);
    setSending(false);

    if (!result.ok) {
      // Draft preserved — same principle as the composer.
      presentFailure(
        {
          ...result.failure,
          title: supportCopy.sendFailed.title,
          body: supportCopy.sendFailed.body,
          action: { kind: 'retry', label: supportCopy.sendFailed.action },
        },
        handleSend,
      );
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    supportAnalytics.userReplied();
    setReply('');
    void load();
  }, [reply, threadId, sending, load]);

  const statusLine =
    thread?.status === 'resolved'
      ? supportCopy.thread.statusResolved
      : thread?.status === 'open'
        ? supportCopy.thread.statusOpen
        : supportCopy.thread.statusNew;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingTop: 6,
            paddingBottom: 10,
          }}
        >
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

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          {loading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={designTokens.colors.brand} />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Status as a sentence, never a badge. */}
              <Text
                accessibilityRole="header"
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 13.5,
                  lineHeight: 20,
                  color: colors.ink3,
                  textAlign: 'center',
                  marginBottom: 26,
                }}
              >
                {statusLine}
              </Text>

              {thread?.messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isDark={isDark}
                  index={index}
                />
              ))}
            </ScrollView>
          )}

          {/* Reply. Always available — including on a resolved thread, because
              "reply anytime to reopen" has to be true for the status line to
              be honest. */}
          {!loading && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                gap: 10,
                paddingHorizontal: 20,
                paddingTop: 10,
                paddingBottom: Platform.OS === 'ios' ? 10 : 16,
                borderTopWidth: 1,
                borderTopColor: colors.hair2,
              }}
            >
              <TextInput
                value={reply}
                onChangeText={setReply}
                placeholder={supportCopy.thread.replyPlaceholder}
                placeholderTextColor={colors.ink3}
                multiline
                accessibilityLabel={supportCopy.thread.replyPlaceholder}
                style={{
                  flex: 1,
                  maxHeight: 120,
                  minHeight: 44,
                  backgroundColor: colors.pill,
                  borderRadius: 22,
                  paddingHorizontal: 16,
                  paddingTop: 12,
                  paddingBottom: 12,
                  fontFamily: designTokens.font.regular,
                  fontSize: 15,
                  lineHeight: 21,
                  color: colors.ink,
                }}
              />
              <Pressable
                onPress={handleSend}
                disabled={!reply.trim() || sending}
                accessibilityRole="button"
                accessibilityLabel={supportCopy.thread.send}
                accessibilityState={{ disabled: !reply.trim() || sending }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: reply.trim()
                    ? designTokens.colors.brand
                    : colors.hair,
                }}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <ArrowUp
                    size={19}
                    color={reply.trim() ? '#FFFFFF' : colors.ink3}
                    strokeWidth={2.2}
                  />
                )}
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ── Message ────────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isDark,
  index,
}: {
  message: SupportMessage;
  isDark: boolean;
  index: number;
}) {
  const colors = getThemeColors(isDark);
  const fromUser = message.author === 'user';

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index * 40, 200)).duration(260)}
      style={{
        alignSelf: fromUser ? 'flex-end' : 'flex-start',
        maxWidth: '86%',
        marginBottom: 16,
      }}
      accessible
      accessibilityLabel={`${fromUser ? supportCopy.thread.you : supportCopy.thread.team}: ${message.body}`}
    >
      {/* Only the team is labelled. Labelling the user's own words back to
          them is noise — they know what they wrote. */}
      {!fromUser && (
        <Text
          style={{
            fontFamily: designTokens.font.medium,
            fontSize: 11.5,
            letterSpacing: 0.3,
            color: designTokens.colors.brand,
            marginBottom: 5,
            marginLeft: 2,
          }}
        >
          {supportCopy.thread.team}
        </Text>
      )}

      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 18,
          backgroundColor: fromUser
            ? isDark
              ? 'rgba(107,122,87,0.22)'
              : 'rgba(84,100,69,0.08)'
            : colors.pill,
        }}
      >
        <Text
          style={{
            fontFamily: designTokens.font.regular,
            fontSize: 15,
            lineHeight: 22,
            color: colors.ink,
          }}
        >
          {message.body}
        </Text>
      </View>

      {message.attachments.map((attachment) => (
        <Attachment key={attachment.path} path={attachment.path} isDark={isDark} />
      ))}
    </Animated.View>
  );
}

function Attachment({ path, isDark }: { path: string; isDark: boolean }) {
  const colors = getThemeColors(isDark);
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    signedAttachmentUrl(path).then((url) => {
      if (alive) setUri(url);
    });
    return () => {
      alive = false;
    };
  }, [path]);

  if (!uri) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={{
        marginTop: 8,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: colors.pill,
      }}
    >
      <Image
        source={{ uri }}
        style={{ width: 180, height: 240 }}
        contentFit="cover"
        accessibilityLabel="Attached screenshot"
      />
    </Animated.View>
  );
}
