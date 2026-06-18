import { Platform, NativeModules } from 'react-native';
import { Settings, AppEventsLogger } from 'react-native-fbsdk-next';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';

const LOG_PREFIX = '[Meta SDK]';

// Detect if FBSDK native modules are present (not present in Expo Go or standard dev client without FBSDK configured)
const hasFBSettings = !!NativeModules.FBSettings;
const hasFBAppEvents = !!NativeModules.FBAppEventsLogger;
const isMetaSDKSupported = hasFBSettings && hasFBAppEvents;

/**
 * Initialize Meta SDK and request tracking consent for iOS
 */
export const initializeMetaSDK = async (): Promise<void> => {
  if (!isMetaSDKSupported) {
    console.log(`${LOG_PREFIX} Native modules not available (e.g. running in Expo Go or dev client missing FBSDK). SDK initialized as mock.`);
    return;
  }

  // Defer native initialization to prevent iOS UIApplication startup timing/threading crash when requesting permissions
  setTimeout(async () => {
    try {
      // 1. Initialize Meta SDK
      Settings.initializeSDK();
      console.log(`${LOG_PREFIX} SDK initialized`);

      // 2. Request tracking permission (iOS specific, resolves immediately on Android)
      const { status } = await requestTrackingPermissionsAsync();
      const isGranted = status === 'granted';

      if (Platform.OS === 'ios') {
        // Set advertiser tracking enabled for iOS 14.5+
        await Settings.setAdvertiserTrackingEnabled(isGranted);
      }
      
      console.log(`${LOG_PREFIX} Advertiser tracking enabled: ${isGranted}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Initialization error:`, error);
    }
  }, 1500);
};

/**
 * Log a standard or custom Meta Event
 */
export const logMetaEvent = async (
  eventName: string,
  parameters: Record<string, any> = {}
): Promise<void> => {
  if (!isMetaSDKSupported) {
    console.log(`${LOG_PREFIX} Event ${eventName} skipped (native SDK not available)`);
    return;
  }

  try {
    AppEventsLogger.logEvent(eventName, parameters);
    console.log(`${LOG_PREFIX} Event logged: ${eventName}`, parameters);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error logging event ${eventName}:`, error);
  }
};

/**
 * Log a purchase event to Meta with value and currency parameters
 */
export const logMetaPurchase = async (
  amount: number,
  currency: string,
  parameters: Record<string, any> = {}
): Promise<void> => {
  if (!isMetaSDKSupported) {
    console.log(`${LOG_PREFIX} Purchase log skipped (native SDK not available): ${amount} ${currency}`);
    return;
  }

  try {
    AppEventsLogger.logPurchase(amount, currency, parameters);
    console.log(`${LOG_PREFIX} Purchase logged: ${amount} ${currency}`, parameters);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error logging purchase:`, error);
  }
};

