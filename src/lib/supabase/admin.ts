import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../env";

/**
 * Service-role client. NEVER import this from a client component — the key
 * is read from a server-only env var (no NEXT_PUBLIC_ prefix) and bypasses RLS.
 * Only used by Super Admin server actions after an explicit role check.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
