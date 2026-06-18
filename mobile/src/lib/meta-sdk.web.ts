const LOG_PREFIX = '[Meta SDK Web]';

/**
 * Mock initialization for web builds
 */
export const initializeMetaSDK = async (): Promise<void> => {
  console.log(`${LOG_PREFIX} Initialization skipped on web`);
};

/**
 * Mock event logger for web builds
 */
export const logMetaEvent = async (
  eventName: string,
  parameters: Record<string, any> = {}
): Promise<void> => {
  console.log(`${LOG_PREFIX} Event ${eventName} skipped on web`, parameters);
};

/**
 * Mock purchase logger for web builds
 */
export const logMetaPurchase = async (
  amount: number,
  currency: string,
  parameters: Record<string, any> = {}
): Promise<void> => {
  console.log(`${LOG_PREFIX} Purchase logged skipped on web: ${amount} ${currency}`, parameters);
};
