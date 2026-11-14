import { requireSuperAdmin } from "@/lib/auth";
import type { EventRow, ProfileRow } from "@/lib/types/db";
import { EventsClient } from "./EventsClient";

export const metadata = { title: "Events" };

export default async function EventsPage() {
  const { sb } = await requireSuperAdmin();
  const [ev, orgs, auc, members] = await Promise.all([
    sb.from("events").select("*, organizations(name)").order("created_at", { ascending: false }),
    sb.from("organizations").select("id, name").order("name"),
    sb.from("profiles").select("id, full_name, email, platform_role").in("platform_role", ["auctioneer", "super_admin"]).eq("status", "active"),
    sb.from("event_members").select("event_id, user_id, role, status").eq("role", "auctioneer"),
  ]);
  return (
    <EventsClient
      events={(ev.data ?? []) as EventRow[]}
      orgs={(orgs.data ?? []) as { id: string; name: string }[]}
      auctioneers={(auc.data ?? []) as Pick<ProfileRow, "id" | "full_name" | "email" | "platform_role">[]}
      assignments={(members.data ?? []) as { event_id: string; user_id: string }[]}
    />
  );
}
