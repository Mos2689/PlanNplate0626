import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { designTokens } from '@/lib/design-tokens';
import { ShieldAlert, Copy, RefreshCw } from 'lucide-react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleCopyLog = async () => {
    const { error, errorInfo } = this.state;
    if (!error) return;

    const logText = [
      `Error: ${error.message}`,
      `Stack: ${error.stack}`,
      `Component Stack: ${errorInfo?.componentStack || 'N/A'}`,
    ].join('\n\n');

    try {
      await Clipboard.setStringAsync(logText);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch (err) {
      console.error('[ErrorBoundary] Failed to copy error log:', err);
    }
  };

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    });
  };

  public render() {
    if (this.state.hasError) {
      const { error, errorInfo, copied } = this.state;
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <ShieldAlert size={32} color="#D32F2F" strokeWidth={1.8} />
            </View>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>
              The application encountered an unexpected render exception.
            </Text>
          </View>

          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Error Message</Text>
            <Text style={styles.errorMessage}>{error?.message || 'Unknown error'}</Text>
          </View>

          {error?.stack && (
            <View style={styles.logCard}>
              <Text style={styles.logTitle}>Stack Trace</Text>
              <ScrollView horizontal style={styles.horizontalScroll}>
                <Text style={styles.logText}>{error.stack}</Text>
              </ScrollView>
            </View>
          )}

          {errorInfo?.componentStack && (
            <View style={styles.logCard}>
              <Text style={styles.logTitle}>Component Stack</Text>
              <ScrollView horizontal style={styles.horizontalScroll}>
                <Text style={styles.logText}>{errorInfo.componentStack}</Text>
              </ScrollView>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable onPress={this.handleCopyLog} style={styles.btnSecondary}>
              <Copy size={16} color={designTokens.colors.ink2} strokeWidth={1.8} />
              <Text style={styles.btnSecondaryText}>
                {copied ? 'Copied Details!' : 'Copy Diagnostics'}
              </Text>
            </Pressable>

            <Pressable onPress={this.handleReset} style={styles.btnPrimary}>
              <RefreshCw size={16} color={designTokens.colors.cream} strokeWidth={1.8} />
              <Text style={styles.btnPrimaryText}>Reload Interface</Text>
            </Pressable>
          </View>
        </ScrollView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FEFDFB',
  },
  contentContainer: {
    padding: 24,
    paddingTop: 72,
    paddingBottom: 48,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(211, 47, 47, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: designTokens.font.medium,
    fontSize: 22,
    color: designTokens.colors.ink,
    letterSpacing: -0.44,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: designTokens.font.regular,
    fontSize: 14,
    color: designTokens.colors.ink2,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  errorCard: {
    backgroundColor: '#FFF8F8',
    borderWidth: 1,
    borderColor: '#FFEBEE',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  errorTitle: {
    fontFamily: designTokens.font.medium,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#D32F2F',
    marginBottom: 6,
  },
  errorMessage: {
    fontFamily: designTokens.font.semibold,
    fontSize: 14,
    color: designTokens.colors.ink,
    lineHeight: 20,
  },
  logCard: {
    backgroundColor: '#F7F7F9',
    borderWidth: 1,
    borderColor: designTokens.colors.hair,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  logTitle: {
    fontFamily: designTokens.font.medium,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: designTokens.colors.ink3,
    marginBottom: 8,
  },
  horizontalScroll: {
    maxHeight: 200,
  },
  logText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: designTokens.colors.ink,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  btnPrimary: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 999,
    backgroundColor: designTokens.colors.brand,
  },
  btnPrimaryText: {
    fontFamily: designTokens.font.semibold,
    fontSize: 14.5,
    color: designTokens.colors.cream,
  },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: designTokens.colors.hair2,
    backgroundColor: '#FFFFFF',
  },
  btnSecondaryText: {
    fontFamily: designTokens.font.medium,
    fontSize: 14,
    color: designTokens.colors.ink2,
  },
});
