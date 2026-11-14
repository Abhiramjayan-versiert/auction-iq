import { requireSuperAdmin } from "@/lib/auth";
import type { ProfileRow } from "@/lib/types/db";
import { UsersClient } from "./UsersClient";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const { sb, user } = await requireSuperAdmin();
  const { data } = await sb.from("profiles").select("*").order("created_at", { ascending: false });
  return <UsersClient initial={(data ?? []) as ProfileRow[]} selfId={user.id} />;
}
