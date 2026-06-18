import { fetch } from 'expo/fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCall } from './api-router';

const WELCOME_EMAIL_SENT_KEY = 'plannplate_welcome_email_sent_';

/**
 * Check if welcome email was already sent for this user
 */
async function wasWelcomeEmailSent(userId: string): Promise<boolean> {
  try {
    const sent = await AsyncStorage.getItem(WELCOME_EMAIL_SENT_KEY + userId);
    return sent === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark welcome email as sent for this user
 */
async function markWelcomeEmailSent(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(WELCOME_EMAIL_SENT_KEY + userId, 'true');
  } catch (error) {
    console.error('[Email] Failed to mark welcome email as sent:', error);
  }
}

/**
 * Send welcome email to a newly verified user - ONLY sends on first signup, not on subsequent logins
 */
export async function sendWelcomeEmail(
  userId: string,
  email: string,
  name: string,
  isNewUser: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    // Only send welcome email for NEW users (first signup), not on subsequent logins
    if (!isNewUser) {
      console.log('[Email] Skipping welcome email - user already exists (not a new signup)');
      return { success: true };
    }

    // Check if we already sent a welcome email to this user
    const alreadySent = await wasWelcomeEmailSent(userId);
    if (alreadySent) {
      console.log('[Email] Welcome email already sent to user:', userId);
      return { success: true };
    }

    console.log('[Email] Sending welcome email to new user:', email);

    const result = await apiCall<{ id: string }>('email-send', {
      to: email,
      template: 'welcome',
      data: {
        name: name,
        appName: 'PlanNplate',
      },
    });

    if (result.error) {
      console.error('[Email] Failed to send welcome email:', result.error);
      return { success: false, error: result.error };
    }

    // Mark as sent so we don't send again
    await markWelcomeEmailSent(userId);
    console.log('[Email] Welcome email sent successfully to:', email);
    return { success: true };
  } catch (error) {
    console.error('[Email] Error sending welcome email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send a generic email
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  template?: 'welcome' | 'password-reset' | 'verification' | 'notification' | 'custom';
  html?: string;
  text?: string;
  data?: Record<string, string>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await apiCall<{ id: string }>('email-send', options);
    if (result.error) {
      return { success: false, error: result.error };
    }
    return { success: true };
  } catch (error) {
    console.error('[Email] Error sending email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if email service is configured
 */
export async function isEmailServiceConfigured(): Promise<boolean> {
  try {
    const result = await apiCall<{ configured: boolean }>('email-send', {}, { requireAuth: false });
    return result.data?.configured ?? false;
  } catch {
    return false;
  }
}

/**
 * Send verification email to a new user
 */
export async function sendVerificationEmail(
  email: string,
  name: string,
  verifyUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[Email] Sending verification email to:', email);

    const result = await apiCall<{ id: string }>('email-send', {
      to: email,
      template: 'verification',
      data: {
        name: name,
        verifyUrl: verifyUrl,
      },
    });

    if (result.error) {
      console.error('[Email] Failed to send verification email:', result.error);
      return { success: false, error: result.error };
    }

    console.log('[Email] Verification email sent successfully to:', email);
    return { success: true };
  } catch (error) {
    console.error('[Email] Error sending verification email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}