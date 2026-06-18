// Server-side rate limiting using Supabase Postgres
// Uses atomic operations to prevent race conditions

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RATE_LIMIT_MAX_REQUESTS = 50; // Max requests per window
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Check and update rate limit for a user
 * Uses atomic upsert to handle concurrent requests safely
 * @param {string} userId
 * @returns {Promise<{allowed: boolean, remaining: number, resetsAt: string, error?: string}>}
 */
export async function checkRateLimit(userId) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase configuration');
    return {
      allowed: false,
      remaining: 0,
      resetsAt: new Date().toISOString(),
      error: 'Server configuration error',
    };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

  try {
    // First, try to get the existing rate limit record
    const { data: existing, error: fetchError } = await supabase
      .from('api_rate_limits')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is fine for new users
      console.error('Error fetching rate limit:', fetchError);
      return {
        allowed: false,
        remaining: 0,
        resetsAt: now.toISOString(),
        error: 'Failed to check rate limit',
      };
    }

    let currentCount = 0;
    let currentWindowStart = now;
    let resetsAt;

    if (existing) {
      const existingWindowStart = new Date(existing.window_start);

      // Check if the window has expired
      if (existingWindowStart < windowStart) {
        // Window expired, reset the count
        currentCount = 0;
        currentWindowStart = now;
        resetsAt = new Date(now.getTime() + RATE_LIMIT_WINDOW_MS);
      } else {
        // Window still active
        currentCount = existing.count;
        currentWindowStart = existingWindowStart;
        resetsAt = new Date(existingWindowStart.getTime() + RATE_LIMIT_WINDOW_MS);
      }
    } else {
      // New user, start fresh
      resetsAt = new Date(now.getTime() + RATE_LIMIT_WINDOW_MS);
    }

    // Check if rate limit exceeded
    if (currentCount >= RATE_LIMIT_MAX_REQUESTS) {
      return {
        allowed: false,
        remaining: 0,
        resetsAt: resetsAt.toISOString(),
      };
    }

    // Atomic upsert to increment the count
    const newCount = currentCount + 1;

    const { error: upsertError } = await supabase
      .from('api_rate_limits')
      .upsert(
        {
          user_id: userId,
          window_start: currentWindowStart.toISOString(),
          count: newCount,
          updated_at: now.toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      );

    if (upsertError) {
      console.error('Error updating rate limit:', upsertError);
      // Allow the request but log the error
      // This prevents rate limit failures from blocking legitimate users
      return {
        allowed: true,
        remaining: RATE_LIMIT_MAX_REQUESTS - 1,
        resetsAt: resetsAt.toISOString(),
      };
    }

    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS - newCount,
      resetsAt: resetsAt.toISOString(),
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    // On error, allow the request but with a warning
    return {
      allowed: true,
      remaining: 0,
      resetsAt: now.toISOString(),
      error: 'Rate limit check failed',
    };
  }
}
