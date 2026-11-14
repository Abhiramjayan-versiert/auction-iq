import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader, Empty } from "@/components/ui/misc";
import { requireProfile } from "@/lib/auth";
import type { EventRow } from "@/lib/types/db";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "My auctions" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { sb, user, profile } = await requireProfile();
  const sp = await searchParams;
  const { data: memberships } = await sb
    .from("event_members")
    .select("role, status, events(*, organizations(name))")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });
  const { data: teams } = await sb.from("team_members").select("event_id, teams(name, short_name)").eq("user_id", user.id);
  const teamByEvent = new Map((teams ?? []).map((t) => [t.event_id, t.teams as unknown as { name: string } | null]));
  const rows = (memberships ?? []) as unknown as { role: string; status: string; events: EventRow }[];
  return (
    <div>
      <PageHeader
        title={`Hi ${profile.full_name.split(" ")[0] || "there"}`}
        description="Your auctions. Open one to get your live intelligence workspace."
        actions={<Link href="/join" className={buttonVariants({})}>Join with invite code</Link>}
      />
      {sp.denied && <p className="mb-4 rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger">You do not have access to that area.</p>}
      {profile.requested_role === "auctioneer" && profile.platform_role === "participant" && (
        <p className="mb-4 rounded-md border border-warn/40 bg-warn/10 p-2 text-xs text-warn">Your auctioneer access request is awaiting Super Admin approval.</p>
      )}
      {rows.length === 0 ? (
        <Empty title="You haven't joined an auction yet">Ask your organiser for an invitation code, or browse public events.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ role, status, events: e }) => {
            const href = role === "auctioneer" ? `/manage/${e.id}` : status === "approved" ? (teamByEvent.get(e.id) ? `/e/${e.id}` : `/e/${e.id}/select-team`) : "#";
            return (
              <Card key={e.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{e.name}</div>
                    <div className="text-xs text-muted">{e.organizations?.name ?? "—"} · {fmtDate(e.starts_at)}</div>
                  </div>
                  <Badge tone={e.status === "live" ? "accent" : e.status === "completed" ? "info" : "neutral"}>{e.status}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <Badge>{role}</Badge>
                  {status !== "approved" && <Badge tone="warn">{status}</Badge>}
                  {teamByEvent.get(e.id) && <Badge tone="accent">{teamByEvent.get(e.id)!.name}</Badge>}
                </div>
                {status === "approved" ? (
                  <Link href={href} className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-4 w-full" })}>
                    {role === "auctioneer" ? "Open control panel" : teamByEvent.get(e.id) ? "Open workspace" : "Select your team"} <ArrowRight size={14} />
                  </Link>
                ) : (
                  <p className="mt-4 text-xs text-muted">{status === "pending" ? "Waiting for organiser approval." : "Access not available."}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
