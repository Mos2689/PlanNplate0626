// Global render-error boundary.
//
// This screen previously rendered the exception message, the full stack trace
// and the React component stack in a scrollable view — the single worst leak in
// the app, and the one users were most likely to hit, since any render crash
// anywhere lands here. It also said "The application encountered an unexpected
// render exception", which is developer language, and offered "Reload
// Interface".
//
// Now: a calm FailureState in production, with the diagnostics captured rather
// than displayed. The stack and the copy-to-clipboard affordance still exist,
// but only behind __DEV__ where they're genuinely useful.

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { designTokens } from '@/lib/design-tokens';
import { FailureState } from '@/components/failure';
import { makeFailure, reportFailure, type Failure } from '@/lib/failure';
import { openSupportComposer } from '@/lib/support/store';

interface Props {
  children: ReactNode;
  /** Escape hatch for a host that can navigate somewhere safe. */
  onGoHome?: () => void;
}

interface State {
  failure: Failure | null;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { failure: null, error: null, errorInfo: null, copied: false };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    // A render crash has no useful category — the classifier would guess from
    // an exception message that describes our own code, not the user's
    // situation. `unknown` is honest, and its copy is reassuring rather than
    // vague ("Something didn't go through. Your plan is safe.").
    return {
      error,
      failure: makeFailure('unknown', { feature: 'app-shell' }),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // Route through the same diagnostics sink as every other failure, so a
    // render crash shows up in the same dashboards as a failed request.
    reportFailure({
      ...makeFailure('unknown', { feature: 'app-shell' }),
      cause: error,
      context: { componentStack: errorInfo.componentStack?.slice(0, 2000) },
    });
  }

  private handleCopyLog = async () => {
    const { error, errorInfo } = this.state;
    if (!error) return;
    // Guarded here, not just at the render site. The button is only rendered in
    // dev today, but guarding the handler means a future refactor that renders
    // it unconditionally still can't put a stack trace on a user's clipboard.
    if (!__DEV__) return;
    const logText = [
      // leak-gate:allow dev-only diagnostics — early-returned above when !__DEV__
      `Error: ${error.message}`,
      `Stack: ${error.stack}`,
      `Component Stack: ${errorInfo?.componentStack ?? 'n/a'}`,
    ].join('\n\n');
    try {
      await Clipboard.setStringAsync(logText);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Clipboard is a developer convenience; failing to copy is not worth
      // surfacing anywhere.
    }
  };

  private handleReset = () => {
    this.setState({ failure: null, error: null, errorInfo: null, copied: false });
  };

  /**
   * Reach a person after a render crash.
   *
   * Order matters. This boundary wraps the whole app INCLUDING the globally
   * mounted SupportComposer, so while the fallback is showing there is no tree
   * for the sheet to render into — opening it first would set the store and
   * display nothing. Clearing the boundary restores the children, and the
   * composer mounts on the next frame.
   *
   * If the underlying screen crashes again immediately the user lands back
   * here, which is no worse than before, and "Return home" is still there.
   */
  private handleContactSupport = () => {
    const feature = this.state.failure?.feature ?? 'app-shell';
    this.handleReset();
    setTimeout(() => {
      openSupportComposer({ intent: 'bug', feature, entry: 'failure' });
    }, 0);
  };

  public render() {
    const { failure, error, errorInfo, copied } = this.state;
    if (!failure) return this.props.children;

    return (
      <View style={styles.container}>
        <FailureState
          failure={failure}
          onAction={this.handleReset}
          secondaryLabel={this.props.onGoHome ? 'Return home' : undefined}
          onSecondary={this.props.onGoHome}
          onContactSupport={this.handleContactSupport}
        />

        {/* Diagnostics are DEV-only. In production they're reported, not shown —
            a user should never see a stack trace. */}
        {__DEV__ && error && (
          <View style={styles.devPanel}>
            <Text style={styles.devTitle}>Dev diagnostics</Text>
            <ScrollView style={styles.devScroll} horizontal>
              <Text style={styles.devText}>
                {error.message}
                {'\n\n'}
                {error.stack}
                {errorInfo?.componentStack ? `\n\n${errorInfo.componentStack}` : ''}
              </Text>
            </ScrollView>
            <Pressable onPress={this.handleCopyLog} style={styles.devBtn}>
              <Text style={styles.devBtnText}>{copied ? 'Copied' : 'Copy diagnostics'}</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FEFDFB' },
  devPanel: {
    maxHeight: 260,
    margin: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F7F7F9',
    borderWidth: 1,
    borderColor: designTokens.colors.hair,
  },
  devTitle: {
    fontFamily: designTokens.font.medium,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: designTokens.colors.ink3,
    marginBottom: 6,
  },
  devScroll: { maxHeight: 170 },
  devText: {
    fontFamily: 'monospace',
    fontSize: 10,
    lineHeight: 15,
    color: designTokens.colors.ink,
  },
  devBtn: {
    marginTop: 10,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designTokens.colors.hair2,
  },
  devBtnText: {
    fontFamily: designTokens.font.medium,
    fontSize: 12.5,
    color: designTokens.colors.ink2,
  },
});
