"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../env";

let client: SupabaseClient | null = null;

/** Browser client — uses only the public anon key; every query is subject to RLS. */
export function supabaseBrowser() {
  if (!client) client = createBrowserClient(SUPABASE_URL || "http://localhost:54321", SUPABASE_ANON_KEY || "anon");
  return client;
}
