export type VerifiedSubscriptionConversion = {
  transactionId: string;
  value: number;
  currency: string;
  productId: string;
  planId: string;
  isTrial: boolean;
};

export type FirebaseTrackContext = {
  verifiedSubscription?: VerifiedSubscriptionConversion;
};

export type FirebaseAnalyticsCommand =
  | { name: 'sign_up'; params: { method: string } }
  | { name: 'onboarding_complete' }
  | { name: 'meal_plan_created' }
  | {
      name: 'trial_started';
      params: {
        transaction_id: string;
        product_id: string;
        plan_id: string;
      };
    }
  | {
      name: 'purchase';
      params: {
        transaction_id: string;
        value: number;
        currency: string;
        items: {
          item_id: string;
          item_category: 'subscription';
          item_variant: string;
          price: number;
          quantity: 1;
        }[];
      };
    };

const AUTH_METHODS = new Set(['email', 'google', 'facebook', 'apple']);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const safeAuthMethod = (value: unknown): string => {
  return typeof value === 'string' && AUTH_METHODS.has(value) ? value : 'unknown';
};

const safeCurrency = (value: string): string | null => {
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
};

const buildSubscriptionCommand = (
  conversion: VerifiedSubscriptionConversion,
): FirebaseAnalyticsCommand | null => {
  const transactionId = conversion.transactionId.trim();
  const productId = conversion.productId.trim();
  const planId = conversion.planId.trim();
  const currency = safeCurrency(conversion.currency);
  if (
    !transactionId ||
    !productId ||
    !planId ||
    !currency ||
    !Number.isFinite(conversion.value) ||
    conversion.value < 0
  ) {
    return null;
  }

  if (conversion.isTrial) {
    return {
      name: 'trial_started',
      params: {
        transaction_id: transactionId,
        product_id: productId,
        plan_id: planId,
      },
    };
  }

  return {
    name: 'purchase',
    params: {
      transaction_id: transactionId,
      value: conversion.value,
      currency,
      items: [
        {
          item_id: productId,
          item_category: 'subscription',
          item_variant: planId,
          price: conversion.value,
          quantity: 1,
        },
      ],
    },
  };
};

/** Pure allowlist: arbitrary PostHog properties never pass through. */
export const buildFirebaseAnalyticsCommand = (
  event: string,
  postHogProps?: Record<string, any>,
  context?: FirebaseTrackContext,
): FirebaseAnalyticsCommand | null => {
  switch (event) {
    case 'auth_signup':
      return {
        name: 'sign_up',
        params: { method: safeAuthMethod(postHogProps?.method) },
      };
    case 'onboarding_completed':
      return { name: 'onboarding_complete' };
    case 'meal_plan_created':
      return { name: 'meal_plan_created' };
    case 'purchase_completed':
      return context?.verifiedSubscription
        ? buildSubscriptionCommand(context.verifiedSubscription)
        : null;
    default:
      return null;
  }
};

export const normalizeFirebaseUserId = (userId: string | null): string | null => {
  return userId && UUID_PATTERN.test(userId) ? userId : null;
};
