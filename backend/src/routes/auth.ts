import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";

const authRouter = new Hono();

// Initialize Supabase Admin client with service role key
const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[Auth] Missing Supabase credentials for admin operations");
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

/**
 * DELETE /api/auth/delete-account
 * Permanently deletes a user account from Supabase Auth
 * Requires the user's access token for authentication
 */
authRouter.delete("/delete-account", async (c) => {
  try {
    // Get the authorization header
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized - missing or invalid token" }, 401);
    }

    const accessToken = authHeader.replace("Bearer ", "");

    // Initialize admin client
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return c.json(
        { error: "Server configuration error - Supabase admin not configured" },
        500
      );
    }

    // Verify the token and get the user
    const {
      data: { user },
      error: verifyError,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (verifyError || !user) {
      console.error("[Auth] Token verification failed:", verifyError);
      return c.json({ error: "Unauthorized - invalid token" }, 401);
    }

    console.log("[Auth] Deleting user from Supabase Auth:", user.id);

    // Delete the user from Supabase Auth using admin API
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
      user.id
    );

    if (deleteError) {
      console.error("[Auth] Failed to delete user from Auth:", deleteError);
      return c.json(
        { error: "Failed to delete user from authentication system" },
        500
      );
    }

    console.log("[Auth] Successfully deleted user from Supabase Auth:", user.id);

    return c.json({
      success: true,
      message: "Account successfully deleted",
    });
  } catch (error) {
    console.error("[Auth] Unexpected error during account deletion:", error);
    return c.json({ error: "An unexpected error occurred" }, 500);
  }
});

export { authRouter };
