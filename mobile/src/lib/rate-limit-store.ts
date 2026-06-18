import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RateLimitStatus {
  hourly_requests: number;
  daily_requests: number;
  hour_window_start: number; // timestamp in ms
  day_window_start: number; // timestamp in ms
  last_request_time: number; // timestamp in ms
}

const HOURLY_LIMIT = 300;
const DAILY_LIMIT = 1000;
const STORAGE_KEY = 'rate_limit_status';
const HOUR_IN_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Get current rate limit status for the user
 * Automatically resets counters if windows have expired
 */
export async function getRateLimitStatus(): Promise<RateLimitStatus> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    const now = Date.now();

    if (!stored) {
      // First time - initialize
      const initial: RateLimitStatus = {
        hourly_requests: 0,
        daily_requests: 0,
        hour_window_start: now,
        day_window_start: now,
        last_request_time: now,
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }

    const status: RateLimitStatus = JSON.parse(stored);

    // Check if hour window has expired (reset if > 1 hour old)
    if (now - status.hour_window_start >= HOUR_IN_MS) {
      status.hourly_requests = 0;
      status.hour_window_start = now;
    }

    // Check if day window has expired (reset if > 24 hours old)
    if (now - status.day_window_start >= DAY_IN_MS) {
      status.daily_requests = 0;
      status.day_window_start = now;
    }

    return status;
  } catch (error) {
    console.error('[RateLimit] Error getting status:', error);
    // Return default if storage fails
    return {
      hourly_requests: 0,
      daily_requests: 0,
      hour_window_start: Date.now(),
      day_window_start: Date.now(),
      last_request_time: Date.now(),
    };
  }
}

/**
 * Check if a request can proceed based on rate limits
 * @param recipesToGenerate - Number of API calls that will be made
 * @returns { allowed: boolean, reason?: string, remaining_hour, remaining_day, reset_times }
 */
export async function checkRateLimit(recipesToGenerate: number): Promise<{
  allowed: boolean;
  reason?: string;
  remaining_hour: number;
  remaining_day: number;
  hourly_reset_at: Date;
  daily_reset_at: Date;
}> {
  const status = await getRateLimitStatus();
  const now = Date.now();

  // Calculate remaining requests
  const remaining_hour = HOURLY_LIMIT - status.hourly_requests;
  const remaining_day = DAILY_LIMIT - status.daily_requests;

  // Calculate reset times
  const hourly_reset_at = new Date(status.hour_window_start + HOUR_IN_MS);
  const daily_reset_at = new Date(status.day_window_start + DAY_IN_MS);

  // Check if request would exceed limits
  if (status.hourly_requests + recipesToGenerate > HOURLY_LIMIT) {
    console.warn(
      `[RateLimit] Hourly limit would be exceeded. Current: ${status.hourly_requests}, Requested: ${recipesToGenerate}, Limit: ${HOURLY_LIMIT}`
    );
    return {
      allowed: false,
      reason: `Hourly limit exceeded. You've used ${status.hourly_requests}/${HOURLY_LIMIT} API calls this hour. Resets at ${hourly_reset_at.toLocaleTimeString()}`,
      remaining_hour,
      remaining_day,
      hourly_reset_at,
      daily_reset_at,
    };
  }

  if (status.daily_requests + recipesToGenerate > DAILY_LIMIT) {
    console.warn(
      `[RateLimit] Daily limit would be exceeded. Current: ${status.daily_requests}, Requested: ${recipesToGenerate}, Limit: ${DAILY_LIMIT}`
    );
    return {
      allowed: false,
      reason: `Daily limit exceeded. You've used ${status.daily_requests}/${DAILY_LIMIT} API calls today. Resets at ${daily_reset_at.toLocaleDateString()} ${daily_reset_at.toLocaleTimeString()}`,
      remaining_hour,
      remaining_day,
      hourly_reset_at,
      daily_reset_at,
    };
  }

  return {
    allowed: true,
    remaining_hour,
    remaining_day,
    hourly_reset_at,
    daily_reset_at,
  };
}

/**
 * Increment rate limit counters after successful API call
 * @param apiCallsCount - Number of API calls that were made
 */
export async function incrementRateLimit(apiCallsCount: number): Promise<void> {
  try {
    const status = await getRateLimitStatus();

    status.hourly_requests += apiCallsCount;
    status.daily_requests += apiCallsCount;
    status.last_request_time = Date.now();

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(status));

    console.log(
      `[RateLimit] Incremented by ${apiCallsCount}. Hourly: ${status.hourly_requests}/${HOURLY_LIMIT}, Daily: ${status.daily_requests}/${DAILY_LIMIT}`
    );
  } catch (error) {
    console.error('[RateLimit] Error incrementing rate limit:', error);
  }
}

/**
 * Get formatted remaining requests string for UI
 */
export async function getRemainingCallsText(): Promise<string> {
  const status = await getRateLimitStatus();
  const remaining_hour = HOURLY_LIMIT - status.hourly_requests;
  const remaining_day = DAILY_LIMIT - status.daily_requests;

  return `${remaining_hour}/${HOURLY_LIMIT} this hour • ${remaining_day}/${DAILY_LIMIT} today`;
}

/**
 * Reset rate limit (for testing or admin purposes)
 */
export async function resetRateLimit(): Promise<void> {
  try {
    const now = Date.now();
    const initial: RateLimitStatus = {
      hourly_requests: 0,
      daily_requests: 0,
      hour_window_start: now,
      day_window_start: now,
      last_request_time: now,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    console.log('[RateLimit] Rate limit reset');
  } catch (error) {
    console.error('[RateLimit] Error resetting rate limit:', error);
  }
}

/**
 * Get detailed status for debugging
 */
export async function getDetailedStatus(): Promise<{
  hourly_used: number;
  hourly_limit: number;
  hourly_remaining: number;
  hourly_percentage: number;
  hourly_reset_at: Date;
  daily_used: number;
  daily_limit: number;
  daily_remaining: number;
  daily_percentage: number;
  daily_reset_at: Date;
  last_request_time: Date;
}> {
  const status = await getRateLimitStatus();
  const now = Date.now();

  const hourly_remaining = HOURLY_LIMIT - status.hourly_requests;
  const daily_remaining = DAILY_LIMIT - status.daily_requests;

  return {
    hourly_used: status.hourly_requests,
    hourly_limit: HOURLY_LIMIT,
    hourly_remaining,
    hourly_percentage: Math.round((status.hourly_requests / HOURLY_LIMIT) * 100),
    hourly_reset_at: new Date(status.hour_window_start + HOUR_IN_MS),
    daily_used: status.daily_requests,
    daily_limit: DAILY_LIMIT,
    daily_remaining,
    daily_percentage: Math.round((status.daily_requests / DAILY_LIMIT) * 100),
    daily_reset_at: new Date(status.day_window_start + DAY_IN_MS),
    last_request_time: new Date(status.last_request_time),
  };
}
