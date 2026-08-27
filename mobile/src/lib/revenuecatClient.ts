/**
 * RevenueCat Client Module
 *
 * This module provides a centralized RevenueCat SDK wrapper that gracefully handles
 * missing configuration. The app will work fine whether or not RevenueCat is configured.
 *
 * Environment Variables:
 * - EXPO_PUBLIC_VIBECODE_REVENUECAT_TEST_KEY: Used in development/test builds (both platforms)
 * - EXPO_PUBLIC_VIBECODE_REVENUECAT_APPLE_KEY: Used in production builds (iOS)
 * - EXPO_PUBLIC_VIBECODE_REVENUECAT_GOOGLE_KEY: Used in production builds (Android)
 * These are automatically injected into the workspace by the Vibecode service once the user sets up RevenueCat in the Payments tab.
 *
 * Platform Support:
 * - iOS/Android: Fully supported via app stores
 * - Web: Disabled (RevenueCat only supports native app stores)
 *
 * The module automatically selects the correct key based on __DEV__ mode.
 * 
 * This module is used to get the current customer info, offerings, and purchase packages.
 * These exported functions are found at the bottom of the file.
 */

import { Platform } from "react-native";
import Purchases, {
  type PurchasesOfferings,
  type CustomerInfo,
  type MakePurchaseResult,
  type PurchasesPackage,
  type PurchasesStoreProduct,
  type SubscriptionOption,
} from "react-native-purchases";

// Check if running on web
const isWeb = Platform.OS === "web";

// Check for environment keys. These RevenueCat SDK keys are PUBLIC client keys
// (designed to ship in the app), so we fall back to the known values when a
// build profile is missing the EXPO_PUBLIC_* env — otherwise a build cut from a
// profile without an `env` block (e.g. eas.json `preview`) silently disables the
// paywall. Env still wins when present.
const FALLBACK_REVENUECAT_TEST_KEY = "test_TDYtycKpCSihFZcSXqkDGJXvecl";
const FALLBACK_REVENUECAT_APPLE_KEY = "appl_twIltSRpbHfdtREIEbywimmFvBp";
const FALLBACK_REVENUECAT_GOOGLE_KEY = "goog_CvNmqdxQPrauotlExRcsCACMZFm";

const testKey =
  process.env.EXPO_PUBLIC_VIBECODE_REVENUECAT_TEST_KEY || FALLBACK_REVENUECAT_TEST_KEY;
const appleKey =
  process.env.EXPO_PUBLIC_VIBECODE_REVENUECAT_APPLE_KEY || FALLBACK_REVENUECAT_APPLE_KEY;
const googleKey =
  process.env.EXPO_PUBLIC_VIBECODE_REVENUECAT_GOOGLE_KEY || FALLBACK_REVENUECAT_GOOGLE_KEY;

// Use __DEV__ and Platform to determine which key to use
const getApiKey = (): string | undefined => {
  if (isWeb) return undefined;
  if (__DEV__) return testKey;

  // Production: use platform-specific key
  return Platform.OS === "ios" ? appleKey : googleKey;
};

const apiKey = getApiKey();

// Track if RevenueCat is enabled
const isEnabled = !!apiKey && !isWeb;

const LOG_PREFIX = "[RevenueCat]";

export type RevenueCatGuardReason =
  | "web_not_supported"
  | "not_configured"
  | "sdk_error";

export type RevenueCatResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: RevenueCatGuardReason; error?: unknown };

// Internal guard to get consistent success/failure results from RevenueCat.
const guardRevenueCatUsage = async <T>(
  action: string,
  operation: () => Promise<T>,
): Promise<RevenueCatResult<T>> => {
  if (isWeb) {
    console.log(
      `${LOG_PREFIX} ${action} skipped: payments are not supported on web.`,
    );
    return { ok: false, reason: "web_not_supported" };
  }

  if (!isEnabled) {
    console.log(`${LOG_PREFIX} ${action} skipped: RevenueCat not configured`);
    return { ok: false, reason: "not_configured" };
  }

  try {
    const data = await operation();
    return { ok: true, data };
  } catch (error) {
    console.log(`${LOG_PREFIX} ${action} failed:`, error);
    return { ok: false, reason: "sdk_error", error };
  }
};

// Initialize RevenueCat if key exists
if (isEnabled) {
  try {
    // Set up custom log handler to suppress Test Store and expected errors
    // These are non-errors thrown as errors by the SDK, and will be confusing to the user.
    Purchases.setLogHandler((logLevel, message) => {

      // Log ERROR messages normally
      if (logLevel === Purchases.LOG_LEVEL.ERROR) {
        console.log(LOG_PREFIX, message);
      }
    });

    Purchases.configure({ apiKey: apiKey! });
    console.log(`${LOG_PREFIX} SDK initialized successfully`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to initialize:`, error);
  }
}

/**
 * Check if RevenueCat is configured and enabled
 *
 * @returns true if RevenueCat is configured with valid API keys
 *
 * @example
 * if (isRevenueCatEnabled()) {
 *   // Show subscription features
 * } else {
 *   // Hide or disable subscription UI
 * }
 */
export const isRevenueCatEnabled = (): boolean => {
  return isEnabled;
};

/**
 * Get available offerings from RevenueCat
 *
 * @returns RevenueCatResult containing PurchasesOfferings data or a failure reason
 *
 * @example
 * const offeringsResult = await getOfferings();
 * if (offeringsResult.ok && offeringsResult.data.current) {
 *   // Display packages from offeringsResult.data.current.availablePackages
 * }
 */
export const getOfferings = (): Promise<
  RevenueCatResult<PurchasesOfferings>
> => {
  return guardRevenueCatUsage("getOfferings", () => Purchases.getOfferings());
};

/**
 * Purchase a package
 *
 * @param packageToPurchase - The package to purchase
 * @returns RevenueCatResult containing the verified purchase result or a failure reason
 *
 * @example
 * const purchaseResult = await purchasePackage(selectedPackage);
 * if (purchaseResult.ok) {
 *   // Purchase successful, check entitlements
 * }
 */
export const purchasePackage = (
  packageToPurchase: PurchasesPackage,
): Promise<RevenueCatResult<MakePurchaseResult>> => {
  return guardRevenueCatUsage("purchasePackage", () =>
    Purchases.purchasePackage(packageToPurchase),
  );
};

/**
 * Get current customer info including active entitlements
 *
 * @returns RevenueCatResult containing CustomerInfo data or a failure reason
 *
 * @example
 * const customerInfoResult = await getCustomerInfo();
 * if (
 *   customerInfoResult.ok &&
 *   customerInfoResult.data.entitlements.active["premium"]
 * ) {
 *   // User has active premium entitlement
 * }
 */
export const getCustomerInfo = (): Promise<RevenueCatResult<CustomerInfo>> => {
  return guardRevenueCatUsage("getCustomerInfo", () =>
    Purchases.getCustomerInfo(),
  );
};

/**
 * Restore previous purchases
 *
 * @returns RevenueCatResult containing CustomerInfo data or a failure reason
 *
 * @example
 * const restoreResult = await restorePurchases();
 * if (restoreResult.ok) {
 *   // Purchases restored successfully
 * }
 */
export const restorePurchases = (): Promise<
  RevenueCatResult<CustomerInfo>
> => {
  return guardRevenueCatUsage("restorePurchases", () =>
    Purchases.restorePurchases(),
  );
};

/**
 * Set user ID for RevenueCat (useful for cross-platform user tracking)
 *
 * @param userId - The user ID to set
 * @returns RevenueCatResult<void> describing success/failure
 *
 * @example
 * const result = await setUserId(user.id);
 * if (!result.ok) {
 *   // Handle failure case
 * }
 */
export const setUserId = (userId: string): Promise<RevenueCatResult<void>> => {
  return guardRevenueCatUsage("setUserId", async () => {
    await Purchases.logIn(userId);
  });
};

/**
 * Log out the current user
 *
 * @returns RevenueCatResult<void> describing success/failure
 *
 * @example
 * const result = await logoutUser();
 * if (!result.ok) {
 *   // Handle failure case
 * }
 */
export const logoutUser = (): Promise<RevenueCatResult<void>> => {
  return guardRevenueCatUsage("logoutUser", async () => {
    await Purchases.logOut();
  });
};

/**
 * Check if user has a specific entitlement active
 *
 * @param entitlementId - The entitlement identifier (e.g., "premium", "pro")
 * @returns RevenueCatResult<boolean> describing entitlement state or failure
 *
 * @example
 * const premiumResult = await hasEntitlement("premium");
 * if (premiumResult.ok && premiumResult.data) {
 *   // Show premium features
 * }
 */
export const hasEntitlement = async (
  entitlementId: string,
): Promise<RevenueCatResult<boolean>> => {
  const customerInfoResult = await getCustomerInfo();

  if (!customerInfoResult.ok) {
    return {
      ok: false,
      reason: customerInfoResult.reason,
      error: customerInfoResult.error,
    };
  }

  const isActive = Boolean(
    customerInfoResult.data.entitlements.active?.[entitlementId],
  );
  return { ok: true, data: isActive };
};

/**
 * Check if user has any active subscription
 *
 * @returns RevenueCatResult<boolean> describing subscription state or failure
 *
 * @example
 * const subscriptionResult = await hasActiveSubscription();
 * if (subscriptionResult.ok && subscriptionResult.data) {
 *   // User is a paying subscriber
 * }
 */
export const hasActiveSubscription = async (): Promise<
  RevenueCatResult<boolean>
> => {
  const customerInfoResult = await getCustomerInfo();

  if (!customerInfoResult.ok) {
    return {
      ok: false,
      reason: customerInfoResult.reason,
      error: customerInfoResult.error,
    };
  }

  const hasSubscription =
    Object.keys(customerInfoResult.data.entitlements.active || {}).length > 0;
  return { ok: true, data: hasSubscription };
};

/**
 * Get a specific package from the current offering
 *
 * @param packageIdentifier - The package identifier (e.g., "$rc_monthly", "$rc_annual")
 * @returns RevenueCatResult containing the package (or null) or a failure reason
 *
 * @example
 * const packageResult = await getPackage("$rc_monthly");
 * if (packageResult.ok && packageResult.data) {
 *   // Display monthly subscription option
 * }
 */
export const getPackage = async (
  packageIdentifier: string,
): Promise<RevenueCatResult<PurchasesPackage | null>> => {
  const offeringsResult = await getOfferings();

  if (!offeringsResult.ok) {
    return {
      ok: false,
      reason: offeringsResult.reason,
      error: offeringsResult.error,
    };
  }

  const pkg =
    offeringsResult.data.current?.availablePackages.find(
      (availablePackage) => availablePackage.identifier === packageIdentifier,
    ) ?? null;

  return { ok: true, data: pkg };
};

/**
 * Get a package from the current offering by its underlying STORE PRODUCT id
 * (e.g. "monthly_sub_3.99") rather than its RevenueCat package identifier.
 * Used for standalone products that don't sit on a standard package alias.
 */
export const getPackageByProductId = async (
  productId: string,
): Promise<RevenueCatResult<PurchasesPackage | null>> => {
  const offeringsResult = await getOfferings();
  if (!offeringsResult.ok) {
    return { ok: false, reason: offeringsResult.reason, error: offeringsResult.error };
  }
  const pkg =
    offeringsResult.data.current?.availablePackages.find(
      (p) => p.product.identifier === productId,
    ) ?? null;
  return { ok: true, data: pkg };
};

/**
 * A minimal, UI-ready snapshot of the user's active premium subscription,
 * read from the RevenueCat `premium` entitlement. Powers the Manage
 * Membership sheet: what plan they're on, when it renews or lapses, whether
 * it's set to auto-renew, and the store-native URL to manage/cancel it.
 */
export interface SubscriptionManagementInfo {
  isActive: boolean;
  productIdentifier: string | null;
  expirationDate: string | null; // ISO string, or null for lifetime
  willRenew: boolean;
  periodType: string | null; // 'NORMAL' | 'INTRO' | 'TRIAL'
  store: string | null; // 'APP_STORE' | 'PLAY_STORE' | ...
  managementURL: string | null; // native subscription-management deep link
}

/**
 * Read the current user's premium subscription details for the Manage
 * Membership surface. Returns a failure result if RevenueCat is unavailable;
 * callers should fall back to a store deep link in that case.
 */
export const getManagementInfo = async (): Promise<
  RevenueCatResult<SubscriptionManagementInfo>
> => {
  const customerInfoResult = await getCustomerInfo();
  if (!customerInfoResult.ok) {
    return {
      ok: false,
      reason: customerInfoResult.reason,
      error: customerInfoResult.error,
    };
  }

  const info = customerInfoResult.data;
  const premium = info.entitlements.active?.['premium'] ?? null;

  return {
    ok: true,
    data: {
      isActive: Boolean(premium),
      productIdentifier: premium?.productIdentifier ?? null,
      expirationDate: premium?.expirationDate ?? null,
      willRenew: premium?.willRenew ?? false,
      periodType: premium?.periodType ?? null,
      store: premium?.store ?? null,
      managementURL: info.managementURL ?? null,
    },
  };
};

/**
 * Google Play only. Find the subscription option that carries a paid,
 * pay-up-front intro offer (e.g. "$29.99 first year, then $6.99/mo") on a
 * product.
 *
 * On Google Play, intro pricing lives on `product.subscriptionOptions` — NOT on
 * `product.introPrice`, which reflects only the base plan / default option. The
 * offer is a NON-base-plan option whose intro phase is a real paid charge
 * (amount > 0, i.e. not a free trial). It must be PURCHASED via that specific
 * option (`purchaseSubscriptionOption`), because `purchasePackage` buys the base
 * plan and skips the offer.
 *
 * Returns null on iOS, when the product is missing, or when no such offer
 * exists. When several qualify, a SINGLE_PAYMENT (pay-up-front) offer wins.
 */
export const findAndroidIntroOption = (
  product: PurchasesStoreProduct | null | undefined,
): SubscriptionOption | null => {
  if (Platform.OS !== "android" || !product) return null;
  const options = product.subscriptionOptions ?? [];
  const paidIntros = options.filter(
    (opt) =>
      !opt.isBasePlan &&
      !!opt.introPhase &&
      opt.introPhase.price.amountMicros > 0,
  );
  if (paidIntros.length === 0) return null;
  // Prefer a true pay-up-front (single payment) offer when more than one paid
  // intro exists; otherwise take the first paid intro.
  const singlePayment = paidIntros.find(
    (opt) => opt.introPhase?.offerPaymentMode === "SINGLE_PAYMENT",
  );
  return singlePayment ?? paidIntros[0];
};

/**
 * The formatted intro price for the Android offer on a product (e.g. "$29.99"),
 * or null if there's no such offer / not on Android.
 */
export const androidIntroPriceString = (
  product: PurchasesStoreProduct | null | undefined,
): string | null => {
  const option = findAndroidIntroOption(product);
  return option?.introPhase?.price.formatted ?? null;
};

/**
 * Purchase a specific Google Play subscription option — required to apply an
 * offer that lives on a non-default option (see `findAndroidIntroOption`).
 */
export const purchaseSubscriptionOption = (
  option: SubscriptionOption,
): Promise<RevenueCatResult<MakePurchaseResult>> => {
  return guardRevenueCatUsage("purchaseSubscriptionOption", () =>
    Purchases.purchaseSubscriptionOption(option),
  );
};

export type IntroEligibility = 'eligible' | 'ineligible' | 'unknown';

/**
 * Whether the user is eligible for a product's introductory offer.
 *
 * iOS returns a real answer; Android always returns UNKNOWN (Play enforces
 * eligibility at purchase). Callers should only PROMISE the intro price when
 * this is 'eligible' — otherwise StoreKit would charge the standard price.
 */
export const checkIntroEligibility = async (
  productId: string,
): Promise<RevenueCatResult<IntroEligibility>> => {
  return guardRevenueCatUsage("checkIntroEligibility", async () => {
    const map = await Purchases.checkTrialOrIntroductoryPriceEligibility([productId]);
    const status = map[productId]?.status;
    const E = Purchases.INTRO_ELIGIBILITY_STATUS;
    if (status === E.INTRO_ELIGIBILITY_STATUS_ELIGIBLE) return "eligible";
    if (status === E.INTRO_ELIGIBILITY_STATUS_INELIGIBLE) return "ineligible";
    return "unknown";
  });
};
