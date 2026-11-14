import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, PageHeader, Stat } from "@/components/ui/misc";
import { requireSuperAdmin } from "@/lib/auth";
import { fmtDate } from "@/lib/utils";
import { ActivityChart } from "./ActivityChart";
import type { ActivityRow } from "@/lib/types/db";

export const metadata = { title: "Super Admin" };

interface Stats { [k: string]: number | { day: string; count: number }[] }

export default async function AdminDashboard() {
  const { sb } = await requireSuperAdmin();
  const [{ data: s, error }, { data: logs }, { data: health }] = await Promise.all([
    sb.rpc("admin_platform_stats"),
    sb.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(12),
    sb.from("platform_settings").select("key").limit(1),
  ]);
  const st = (s ?? {}) as Stats;
  const n = (k: string) => (typeof st[k] === "number" ? (st[k] as number) : 0);
  return (
    <div className="space-y-4">
      <PageHeader title="Platform dashboard" description="Everything happening across AUCTION IQ." />
      {error && <p className="text-sm text-danger">{error.message}</p>}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="Registered users" value={n("users")} sub={`${n("suspended")} suspended`} />
        <Stat label="Participants" value={n("participants")} />
        <Stat label="Auctioneers" value={n("auctioneers")} sub={n("pending_auctioneers") ? <Link href="/admin/users?filter=pending" className="text-warn">{n("pending_auctioneers")} awaiting approval</Link> : "none pending"} />
        <Stat label="Active events" value={n("active_events")} sub={`${n("live_events")} live now`} tone="accent" />
        <Stat label="Active sessions" value={n("active_sessions")} />
        <Stat label="Upcoming events" value={n("upcoming_events")} />
        <Stat label="Completed events" value={n("completed_events")} />
        <Stat label="Teams" value={n("teams")} />
        <Stat label="Event players" value={n("players")} sub={`${n("library_players")} in library`} />
        <Stat label="Official transactions" value={n("transactions")} />
        <Stat label="Participant trackers" value={n("trackers")} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Registrations & activity (30 days)" />
          <CardBody><ActivityChart registrations={(st.registrations as { day: string; count: number }[]) ?? []} activity={(st.activity as { day: string; count: number }[]) ?? []} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="System health" />
          <CardBody className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">Database</span><Badge tone={health ? "ok" : "danger"}>{health ? "reachable" : "error"}</Badge></div>
            <div className="flex justify-between"><span className="text-muted">Auth</span><Badge tone="ok">ok</Badge></div>
            <div className="flex justify-between"><span className="text-muted">Service role (server)</span><Badge tone={process.env.SUPABASE_SERVICE_ROLE_KEY ? "ok" : "warn"}>{process.env.SUPABASE_SERVICE_ROLE_KEY ? "configured" : "missing"}</Badge></div>
            <div className="flex justify-between"><span className="text-muted">Realtime</span><Badge tone="ok">via Supabase</Badge></div>
            <div className="flex justify-between"><span className="text-muted">Optional AI narration</span><Badge>{process.env.ANTHROPIC_API_KEY ? "configured" : "not configured"}</Badge></div>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Recent platform activity" action={<Link href="/admin/audit" className="text-xs text-accent">Full audit log →</Link>} />
        <CardBody>
          <ul className="divide-y divide-line/40 text-xs">
            {((logs ?? []) as ActivityRow[]).map((l) => <li key={l.id} className="flex gap-3 py-1.5"><span className="w-36 shrink-0 text-faint">{fmtDate(l.created_at)}</span><Badge>{l.action}</Badge><span className="truncate text-muted">{l.entity} {l.entity_id}</span></li>)}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
