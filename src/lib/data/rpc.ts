"use client";
import { toast } from "sonner";
import { supabaseBrowser } from "../supabase/client";

/** Calls a Postgres RPC, surfacing database-level validation errors to the user. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>, success?: string): Promise<T | null> {
  const { data, error } = await supabaseBrowser().rpc(fn, args);
  if (error) {
    toast.error(error.message);
    return null;
  }
  if (success) toast.success(success);
  return (data as T) ?? (true as unknown as T);
}
