import assert from 'node:assert/strict';
import {
  buildFirebaseAnalyticsCommand,
  normalizeFirebaseUserId,
} from '../src/lib/firebase-analytics-policy';

const signup = buildFirebaseAnalyticsCommand('auth_signup', {
  method: 'google',
  email: 'must-not-leak@example.com',
  name: 'Must Not Leak',
  recipe_name: 'Must Not Leak',
});
assert.deepEqual(signup, {
  name: 'sign_up',
  params: { method: 'google' },
});

assert.deepEqual(
  buildFirebaseAnalyticsCommand('auth_signup', { method: 'free-form-value' }),
  { name: 'sign_up', params: { method: 'unknown' } },
);
assert.deepEqual(
  buildFirebaseAnalyticsCommand('onboarding_completed', {
    dietary_preferences: ['must-not-leak'],
    allergies: ['must-not-leak'],
  }),
  { name: 'onboarding_complete' },
);
assert.deepEqual(
  buildFirebaseAnalyticsCommand('meal_plan_created', {
    recipe_names: ['must-not-leak'],
    free_text: 'must-not-leak',
  }),
  { name: 'meal_plan_created' },
);
assert.equal(buildFirebaseAnalyticsCommand('auth_login', { method: 'email' }), null);
assert.equal(buildFirebaseAnalyticsCommand('screen_view', { screen: 'home' }), null);
assert.equal(buildFirebaseAnalyticsCommand('purchase_completed'), null);

const paidPurchase = buildFirebaseAnalyticsCommand(
  'purchase_completed',
  { email: 'must-not-leak@example.com' },
  {
    verifiedSubscription: {
      transactionId: 'transaction-1',
      value: 9.99,
      currency: 'aud',
      productId: 'premium.monthly',
      planId: '$rc_monthly',
      isTrial: false,
    },
  },
);
assert.deepEqual(paidPurchase, {
  name: 'purchase',
  params: {
    transaction_id: 'transaction-1',
    value: 9.99,
    currency: 'AUD',
    items: [
      {
        item_id: 'premium.monthly',
        item_category: 'subscription',
        item_variant: '$rc_monthly',
        price: 9.99,
        quantity: 1,
      },
    ],
  },
});

const trial = buildFirebaseAnalyticsCommand('purchase_completed', undefined, {
  verifiedSubscription: {
    transactionId: 'transaction-2',
    value: 9.99,
    currency: 'AUD',
    productId: 'premium.monthly',
    planId: '$rc_monthly',
    isTrial: true,
  },
});
assert.deepEqual(trial, {
  name: 'trial_started',
  params: {
    transaction_id: 'transaction-2',
    product_id: 'premium.monthly',
    plan_id: '$rc_monthly',
  },
});

assert.equal(
  buildFirebaseAnalyticsCommand('purchase_completed', undefined, {
    verifiedSubscription: {
      transactionId: '',
      value: Number.NaN,
      currency: 'not-a-currency',
      productId: '',
      planId: '',
      isTrial: false,
    },
  }),
  null,
);

const uuid = '550e8400-e29b-41d4-a716-446655440000';
assert.equal(normalizeFirebaseUserId(uuid), uuid);
assert.equal(normalizeFirebaseUserId('must-not-leak@example.com'), null);
assert.equal(normalizeFirebaseUserId(null), null);

console.log('Firebase Analytics policy tests passed.');
