// Friendly purchase error messages.
//
// The RevenueCat wrapper (`purchasePackage` in revenuecatClient.ts) returns
// only three reason codes — `web_not_supported`, `not_configured`,
// `sdk_error`. Everything that comes back from the App Store / Google Play /
// the RC SDK itself lands under `sdk_error` with the original Error attached.
//
// This helper takes that pair and decides:
//   • Whether to show the user anything (cancellation is silent).
//   • The headline + body for the Alert.
//   • An optional one-line hint when we can recognise the failure mode.
//
// Pattern-matched substrings are based on the strings the Apple SDK + Play
// Billing surface today. They're stable enough that a simple includes()
// check is fine; if Apple changes the wording we'll fall through to the
// generic case and the user still gets a sensible alert (not silent
// failure, like before this helper existed).

export interface FriendlyPurchaseError {
  title: string;
  message: string;
  hint?: string;
}

// User dismissed the App Store / Play Billing sheet — return null so the
// caller stays silent. Distinguished from real failures because we don't
// want a "Purchase Failed" toast every time a user backs out.
function looksLikeCancellation(raw?: string): boolean {
  if (!raw) return false;
  const r = raw.toLowerCase();
  return (
    r.includes('cancel') ||
    r.includes('user denied') ||
    r.includes('skerrordomain error 2') // iOS cancellation code
  );
}

function looksLikeNetworkError(raw: string): boolean {
  const r = raw.toLowerCase();
  return (
    r.includes('network') ||
    r.includes('connection') ||
    r.includes('timeout') ||
    r.includes('offline')
  );
}

function looksLikePaymentPending(raw: string): boolean {
  const r = raw.toLowerCase();
  return r.includes('pending') || r.includes('deferred');
}

function looksLikePurchasesDisabled(raw: string): boolean {
  const r = raw.toLowerCase();
  return (
    r.includes('not allowed') ||
    r.includes('parental') ||
    r.includes('screen time') ||
    r.includes('restricted')
  );
}

function looksLikeProductUnavailable(raw: string): boolean {
  const r = raw.toLowerCase();
  return (
    r.includes('product') && (r.includes('not found') || r.includes('unavailable'))
  );
}

function looksLikePaymentDeclined(raw: string): boolean {
  const r = raw.toLowerCase();
  return (
    r.includes('declined') ||
    r.includes('insufficient') ||
    r.includes('card') ||
    r.includes('payment') && r.includes('fail')
  );
}

export function friendlyPurchaseError(
  reason: string,
  raw?: Error,
): FriendlyPurchaseError | null {
  const rawMessage = raw?.message ?? '';

  // Wrapper-level reasons first — these don't carry a raw error.
  if (reason === 'web_not_supported') {
    return {
      title: 'Not supported here',
      message: 'Subscriptions can only be purchased from the iOS or Android app, not the web preview.',
    };
  }
  if (reason === 'not_configured') {
    return {
      title: 'Subscriptions unavailable',
      message: "We couldn't reach the App Store right now. Please try again in a moment.",
      hint: 'If this keeps happening, restart the app and try Restore purchases.',
    };
  }

  // From here on we're inside `sdk_error` (or something unknown).
  // Cancellation = silent.
  if (looksLikeCancellation(rawMessage)) return null;

  if (looksLikeNetworkError(rawMessage)) {
    return {
      title: 'Connection problem',
      message: "Couldn't reach the App Store. Check your connection and try again.",
    };
  }

  if (looksLikePaymentPending(rawMessage)) {
    return {
      title: 'Payment pending',
      message: "Apple is still processing your payment. We'll unlock Premium as soon as it confirms — usually within a minute.",
      hint: 'You can close this and check back shortly. No need to pay again.',
    };
  }

  if (looksLikePurchasesDisabled(rawMessage)) {
    return {
      title: 'Purchases disabled',
      message: "In-app purchases are turned off on this device.",
      hint: 'Check Screen Time / parental controls in Settings, then try again.',
    };
  }

  if (looksLikeProductUnavailable(rawMessage)) {
    return {
      title: 'Plan unavailable',
      message: "This subscription plan isn't available in your region right now.",
      hint: "Try Restore purchases if you've subscribed before, or contact support.",
    };
  }

  if (looksLikePaymentDeclined(rawMessage)) {
    return {
      title: 'Payment declined',
      message: 'Your bank declined the payment.',
      hint: 'Try a different card in your Apple ID, or check with your bank.',
    };
  }

  // Generic fallback — surface SOMETHING so silent failures stop.
  return {
    title: 'Purchase failed',
    message: rawMessage
      ? `${rawMessage.slice(0, 140)}${rawMessage.length > 140 ? '…' : ''}`
      : "Something went wrong on the App Store side.",
    hint: 'Try again, or use Restore purchases if you already subscribed.',
  };
}
