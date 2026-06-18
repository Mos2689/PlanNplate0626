-- Create api_rate_limits table for server-side rate limiting
-- This table tracks API usage per user with a rolling window

CREATE TABLE IF NOT EXISTS api_rate_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window_start ON api_rate_limits(window_start);

-- Enable Row Level Security
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (used by Edge Functions)
CREATE POLICY "Service role can manage rate limits"
  ON api_rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Users can only read their own rate limit (optional, for transparency)
CREATE POLICY "Users can read own rate limit"
  ON api_rate_limits
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Add comment for documentation
COMMENT ON TABLE api_rate_limits IS 'Tracks API rate limits per user. 50 requests per hour rolling window.';
COMMENT ON COLUMN api_rate_limits.window_start IS 'Start of the current rate limit window';
COMMENT ON COLUMN api_rate_limits.count IS 'Number of requests in the current window';
