import "server-only";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "./env";
import { supabaseServer } from "./supabase/server";
import type { ProfileRow } from "./types/db";

/** Server-side: current user + profile, or redirect to login. */
export async function requireProfile(next = "/dashboard") {
  if (!isSupabaseConfigured()) redirect("/setup");
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/login?error=profile");
  if ((profile as ProfileRow).status === "suspended") redirect("/suspended");
  return { sb, user, profile: profile as ProfileRow };
}

export async function requireSuperAdmin() {
  const ctx = await requireProfile("/admin");
  if (ctx.profile.platform_role !== "super_admin") redirect("/dashboard?denied=admin");
  return ctx;
}

export async function requireEventManager(eventId: string) {
  const ctx = await requireProfile(`/manage/${eventId}`);
  const { data } = await ctx.sb.rpc("can_manage_event", { p_event: eventId });
  if (!data) redirect("/dashboard?denied=event");
  return ctx;
}

export async function requireEventMember(eventId: string) {
  const ctx = await requireProfile(`/e/${eventId}`);
  const { data } = await ctx.sb.rpc("is_event_member", { p_event: eventId });
  if (!data) redirect("/dashboard?denied=event");
  return ctx;
}
