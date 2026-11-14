import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge, Empty, PageHeader } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import type { EventRow } from "@/lib/types/db";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Assigned events" };

export default async function ManageList() {
  const { sb, user, profile } = await requireProfile("/manage");
  if (profile.platform_role === "participant") redirect("/dashboard?denied=auctioneer");
  let events: EventRow[] = [];
  if (profile.platform_role === "super_admin") {
    const { data } = await sb.from("events").select("*, organizations(name)").order("starts_at", { ascending: false });
    events = (data ?? []) as EventRow[];
  } else {
    const { data } = await sb.from("event_members").select("events(*, organizations(name))").eq("user_id", user.id).eq("role", "auctioneer").eq("status", "approved");
    events = ((data ?? []) as unknown as { events: EventRow }[]).map((r) => r.events);
  }
  return (
    <div>
      <PageHeader title="Assigned events" description={profile.platform_role === "super_admin" ? "As Super Admin you can manage every event." : "Events you are authorised to run."} />
      {!events.length ? <Empty title="No events assigned">A Super Admin assigns auctioneers to events.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {events.map((e) => (
            <Card key={e.id} className="p-4">
              <div className="flex justify-between gap-2">
                <div className="min-w-0"><div className="truncate font-semibold">{e.name}</div><div className="text-xs text-muted">{e.organizations?.name ?? "—"} · {fmtDate(e.starts_at)}</div></div>
                <Badge tone={e.status === "live" ? "accent" : "neutral"}>{e.status}</Badge>
              </div>
              <div className="mt-2 text-xs text-muted">Invite code <span className="font-mono text-fg">{e.invite_code}</span></div>
              <div className="mt-3 flex gap-2">
                <Link href={`/manage/${e.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Manage</Link>
                <Link href={`/manage/${e.id}/control-room`} className={buttonVariants({ size: "sm" })}>Control room</Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
