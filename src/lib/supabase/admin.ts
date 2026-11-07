import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role client: bypasses RLS. Only use on the server, and only after the caller's
 * access has been checked (admin with 2FA, a verified client session, or a signed guest cookie).
 */
export function createServiceClient() {
  return createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
