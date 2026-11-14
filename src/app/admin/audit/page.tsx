"use client";
import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Badge, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ActivityRow } from "@/lib/types/db";
import { downloadCsv, fmtDate } from "@/lib/utils";

export default function Audit() {
  const [rows, setRows] = useState<(ActivityRow & { profiles?: { full_name: string; email: string } | null; events?: { name: string } | null })[]>([]);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(200);
  const load = useCallback(async () => {
    let query = supabaseBrowser().from("activity_logs").select("*, profiles:actor_id(full_name, email), events(name)").order("created_at", { ascending: false }).limit(limit);
    if (q) query = query.ilike("action", `%${q}%`);
    const { data } = await query;
    setRows((data ?? []) as never);
  }, [q, limit]);
  useEffect(() => void load(), [load]);
  return (
    <div className="space-y-4">
      <PageHeader title="Audit logs" description="Every official write, membership change and admin action." actions={<Button variant="outline" size="sm" onClick={() => downloadCsv("audit-log.csv", rows.map((r) => ({ time: r.created_at, actor: r.profiles?.email, event: r.events?.name, action: r.action, entity: r.entity, entity_id: r.entity_id, details: JSON.stringify(r.details) })))}><Download size={14} /> Export</Button>} />
      <Input className="max-w-xs" placeholder="Filter by action (e.g. transaction)" value={q} onChange={(e) => setQ(e.target.value)} />
      <Card className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-line/70 text-left text-[11px] uppercase text-faint"><th className="px-3 py-2">Time</th><th>Actor</th><th>Event</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-b border-line/40"><td className="px-3 py-1.5 whitespace-nowrap text-faint">{fmtDate(r.created_at)}</td><td>{r.profiles?.full_name || r.profiles?.email || "system"}</td><td>{r.events?.name ?? "—"}</td><td><Badge>{r.action}</Badge></td><td className="max-w-md truncate font-mono text-muted">{JSON.stringify(r.details)}</td></tr>
          ))}</tbody>
        </table>
      </Card>
      {rows.length >= limit && <Button variant="ghost" onClick={() => setLimit(limit + 200)}>Load more</Button>}
    </div>
  );
}
