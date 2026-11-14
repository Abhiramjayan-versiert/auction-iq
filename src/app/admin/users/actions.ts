"use server";
import { requireSuperAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

type Result = { ok: true; message: string } | { ok: false; message: string };

/** Super Admin only: actions that need the service-role key run exclusively on the server. */
export async function createUserAction(input: { email: string; full_name: string; password: string; role: "participant" | "auctioneer" | "super_admin"; college?: string }): Promise<Result> {
  const { sb } = await requireSuperAdmin();
  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin.auth.admin.createUser({ email: input.email, password: input.password, email_confirm: true, user_metadata: { full_name: input.full_name, college: input.college } });
    if (error) return { ok: false, message: error.message };
    if (input.role !== "participant") {
      const { error: e2 } = await sb.rpc("admin_set_user", { p_user: data.user.id, p_role: input.role, p_status: "active" });
      if (e2) return { ok: false, message: e2.message };
    }
    return { ok: true, message: `Created ${input.email}` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function deleteUserAction(userId: string): Promise<Result> {
  const { user } = await requireSuperAdmin();
  if (userId === user.id) return { ok: false, message: "You cannot delete your own account." };
  try {
    const { error } = await supabaseAdmin().auth.admin.deleteUser(userId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Account deleted. Official auction records keep the transaction history." };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function sendRecoveryAction(email: string): Promise<Result> {
  await requireSuperAdmin();
  // Implicit flow: the link must work on the user's own device, not the admin's browser (PKCE verifier lives there).
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${SITE_URL}/reset-password` });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `Recovery email sent to ${email}` };
}
