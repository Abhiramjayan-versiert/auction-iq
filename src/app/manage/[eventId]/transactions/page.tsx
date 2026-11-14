"use client";
import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { fmtMoney } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { Badge, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useEventData } from "@/hooks/useEventData";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ActivityRow } from "@/lib/types/db";
import { cn, downloadCsv, fmtDate } from "@/lib/utils";

export default function Transactions() {
  const { event, transactions, playerById, teamName, rules, teams } = useEventData();
  const [team, setTeam] = useState("");
  const [status, setStatus] = useState("");
  const [logs, setLogs] = useState<ActivityRow[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().from("activity_logs").select("*").eq("event_id", event!.id).order("created_at", { ascending: false }).limit(300);
    setLogs((data ?? []) as ActivityRow[]);
  }, [event]);
  useEffect(() => void load(), [load, transactions.length]);
  const m = (n: number | null | undefined) => fmtMoney(n, rules.currency);
  const list = transactions.filter((t) => (!team || t.team_id === team) && (!status || t.status === status));
  const exportCsv = () => downloadCsv(`${event!.name}-transactions.csv`, list.map((t) => ({ seq: t.seq, time: t.created_at, player: playerById[t.player_id]?.name, type: t.type, team: teamName(t.team_id), amount: t.amount, status: t.status, voided_reason: t.voided_reason, note: t.note })));
  return (
    <div className="space-y-4">
      <PageHeader title="Transactions & activity" description="Complete, immutable history. Voided entries are kept for audit." actions={<Button variant="outline" size="sm" onClick={exportCsv}><Download size={14} /> Export CSV</Button>} />
      <Card>
        <div className="flex gap-2 p-3">
          <Select className="w-48" value={team} onChange={(e) => setTeam(e.target.value)}><option value="">All teams</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          <Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="voided">Voided</option></Select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead><tr className="border-b border-line/70 text-left text-[11px] uppercase text-faint"><th className="px-3 py-2">#</th><th>Time</th><th>Player</th><th>Result</th><th className="text-right">Amount</th><th>Status</th><th>Note</th></tr></thead>
            <tbody>{list.map((t) => (
              <tr key={t.id} className={cn("border-b border-line/40", t.status === "voided" && "opacity-50")}>
                <td className="px-3 py-1.5 text-faint">{t.seq}</td><td className="text-xs">{fmtDate(t.created_at)}</td><td>{playerById[t.player_id]?.name ?? "—"}</td>
                <td>{t.type === "sale" ? teamName(t.team_id) : <Badge tone="warn">unsold</Badge>}</td><td className="text-right">{t.type === "sale" ? m(t.amount) : "—"}</td>
                <td>{t.status === "active" ? <Badge tone="ok">active</Badge> : <Badge>{t.voided_reason ?? "voided"}</Badge>}</td><td className="text-xs text-muted">{t.note}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardHeader title="Activity log" action={<Button size="sm" variant="ghost" onClick={load}>Refresh</Button>} />
        <CardBody>
          <ul className="max-h-96 divide-y divide-line/40 overflow-y-auto text-xs">
            {logs.map((l) => (
              <li key={l.id} className="flex gap-3 py-1.5"><span className="w-36 shrink-0 text-faint">{fmtDate(l.created_at)}</span><Badge>{l.action}</Badge><span className="truncate font-mono text-muted">{JSON.stringify(l.details)}</span></li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
