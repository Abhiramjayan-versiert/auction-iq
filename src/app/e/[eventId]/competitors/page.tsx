"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { classifyTeams, FLAG_LABEL, fmtPct, fmtRating, predictCompetitor, type CompetitorFlag, type TeamAnalysis, cellLabel } from "@/lib/engine";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Badge, Dialog, PageHeader } from "@/components/ui/misc";
import { Button, buttonVariants } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/table";
import { RuleAlerts } from "@/components/domain/alerts";
import { ConfidenceBadge, SquadStatusBadge } from "@/components/domain/badges";
import { TeamChip } from "@/components/domain/team";
import { CompositionGrid, RosterTable, useMoney } from "@/components/participant/shared";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";

export default function Competitors() {
  const { event, myTeamId, rules } = useEventData();
  const { intel } = useWorkspace();
  const m = useMoney();
  const flags = useMemo(() => classifyTeams(intel), [intel]);
  const rank = useMemo(() => Object.fromEntries(intel.leaderboard.map((r) => [r.teamId, r])), [intel]);
  const [q, setQ] = useState("");
  const [flag, setFlag] = useState<CompetitorFlag | "">("");
  const [picked, setPicked] = useState<string[]>([]);
  const [detail, setDetail] = useState<TeamAnalysis | null>(null);
  const rows = intel.teams.filter((t) => (!q || t.team.name.toLowerCase().includes(q.toLowerCase())) && (!flag || flags[t.team.id]?.includes(flag)));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const cols: Column<TeamAnalysis>[] = [
    { key: "pick", header: "", cell: (t) => <input type="checkbox" checked={picked.includes(t.team.id)} onChange={() => toggle(t.team.id)} onClick={(e) => e.stopPropagation()} className="accent-lime-400" /> },
    { key: "rank", header: "#", cell: (t) => rank[t.team.id]?.officialRank, sort: (t) => -(rank[t.team.id]?.officialRank ?? 99) },
    { key: "team", header: "Team", cell: (t) => <span className="flex items-center gap-2"><TeamChip team={t.team} />{t.team.id === myTeamId && <Badge tone="accent">You</Badge>}{t.hasEstimates && <Badge tone="warn">est.</Badge>}</span>, sort: (t) => t.team.name },
    { key: "players", header: "Players", align: "right", cell: (t) => t.rating.count, sort: (t) => t.rating.count },
    { key: "spent", header: "Spent", align: "right", cell: (t) => m(t.spent), sort: (t) => t.spent },
    { key: "rem", header: "Remaining", align: "right", cell: (t) => <b className={cn(!t.purseSufficient && "text-danger")}>{m(t.remaining)}</b>, sort: (t) => t.remaining },
    { key: "util", header: "Used", align: "right", cell: (t) => fmtPct(t.utilization), sort: (t) => t.utilization },
    { key: "cap", header: "Max bid", align: "right", cell: (t) => m(t.maxSingleBid), sort: (t) => t.maxSingleBid },
    { key: "avg", header: "Avg", align: "right", cell: (t) => <b>{fmtRating(t.rating.average)}</b>, sort: (t) => t.rating.average },
    { key: "tot", header: "Total", align: "right", cell: (t) => fmtRating(t.rating.total), sort: (t) => t.rating.total },
    { key: "proj", header: "Projected", align: "right", cell: (t) => fmtRating(t.projectedAverage), sort: (t) => t.projectedAverage },
    { key: "slots", header: "Needs", align: "right", cell: (t) => t.rules.slotsRequired, sort: (t) => t.rules.slotsRequired },
    { key: "os", header: "IN/OS", align: "right", cell: (t) => `${t.indianCount}/${t.overseasCount}` },
    { key: "bat", header: "Bat", align: "right", cell: (t) => fmtRating(t.rating.batting), sort: (t) => t.rating.batting },
    { key: "bowl", header: "Bowl", align: "right", cell: (t) => fmtRating(t.rating.bowling), sort: (t) => t.rating.bowling },
    { key: "bal", header: "Balance", align: "right", cell: (t) => t.rating.balance.toFixed(0), sort: (t) => t.rating.balance },
    { key: "status", header: "Rules", cell: (t) => <SquadStatusBadge status={t.rules.status} />, sort: (t) => t.rules.status },
  ];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Competitor intelligence"
        description="Every team, from official records plus your private observations (labelled)."
        actions={
          <>
            <Link href={`/e/${event!.id}/purse-planner?tab=competitors`} className={buttonVariants({ variant: "outline", size: "sm" })}>Purse calculator</Link>
            <Link href={`/e/${event!.id}/compare?teams=${picked.join(",")}`} className={buttonVariants({ size: "sm", className: picked.length < 2 ? "pointer-events-none opacity-50" : "" })}>Compare {picked.length || ""} selected</Link>
          </>
        }
      />
      <div className="grid gap-3 md:grid-cols-4">
        {(["financially_strong", "financially_weak", "aggressive_spender", "high_quality", "category_shortage", "best_positioned"] as CompetitorFlag[]).slice(0, 4).map((f) => {
          const list = intel.teams.filter((t) => flags[t.team.id]?.includes(f));
          return (
            <Card key={f} className="p-3">
              <div className="text-[11px] uppercase text-faint">{FLAG_LABEL[f]}</div>
              <div className="mt-1 flex flex-wrap gap-1">{list.length ? list.slice(0, 8).map((t) => <Badge key={t.team.id}>{t.team.short_name || t.team.name}</Badge>) : <span className="text-xs text-muted">None</span>}</div>
            </Card>
          );
        })}
      </div>
      <Card>
        <div className="flex flex-wrap gap-2 p-3">
          <Input placeholder="Search teams…" className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="max-w-xs" value={flag} onChange={(e) => setFlag(e.target.value as CompetitorFlag | "")}>
            <option value="">All teams</option>
            {(Object.keys(FLAG_LABEL) as CompetitorFlag[]).map((f) => <option key={f} value={f}>{FLAG_LABEL[f]}</option>)}
          </Select>
          <span className="ml-auto self-center text-xs text-faint">Max bid = largest bid a team can make and still complete its mandatory squad at floor prices ({rules.currency}).</span>
        </div>
        <DataTable rows={rows} columns={cols} rowKey={(t) => t.team.id} initialSort={{ key: "rank", dir: "desc" }} onRowClick={setDetail} rowClassName={(t) => (t.team.id === myTeamId ? "bg-accent/5" : undefined)} dense />
      </Card>
      {detail && <TeamDetail t={detail} onClose={() => setDetail(null)} flags={flags[detail.team.id] ?? []} />}
    </div>
  );
}

function TeamDetail({ t, onClose, flags }: { t: TeamAnalysis; onClose: () => void; flags: CompetitorFlag[] }) {
  const { intel } = useWorkspace();
  const m = useMoney();
  const pred = predictCompetitor(intel, t);
  return (
    <Dialog open onClose={onClose} title={<TeamChip team={t.team} />} wide>
      <div className="flex flex-wrap gap-1">{flags.map((f) => <Badge key={f}>{FLAG_LABEL[f]}</Badge>)}<Badge tone={pred.pressure === "critical" || pred.pressure === "high" ? "danger" : pred.pressure === "medium" ? "warn" : "ok"}>Spending pressure: {pred.pressure}</Badge><Badge>{pred.spendingStyle}</Badge></div>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-medium text-faint">Composition</div>
          <CompositionGrid team={t} />
          <div className="mt-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted">Remaining / reserve</span><span className="tabular">{m(t.remaining)} / {m(t.floorReserve)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Bidding capacity</span><span className="tabular">{m(pred.biddingCapacity)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Budget exhaustion risk</span><span>{pred.budgetExhaustionRisk ? "Yes" : "No"}</span></div>
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-faint">Predicted next purchases (analytical estimate, not confirmed intent)</div>
          <p className="text-sm">{pred.summary}</p>
          <ul className="mt-2 space-y-2">
            {pred.likelyNext.slice(0, 3).map((n) => (
              <li key={n.cell} className="rounded-md bg-surface-2 p-2 text-xs">
                <div className="flex justify-between"><b>{cellLabel(n.cell)}</b><ConfidenceBadge c={n.confidence} /></div>
                <ul className="mt-1 list-disc pl-4 text-muted">{n.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
              </li>
            ))}
          </ul>
          <div className="mt-3"><RuleAlerts alerts={t.rules.alerts} compact hideInfo /></div>
        </div>
      </div>
      <div className="mt-4"><RosterTable team={t} /></div>
      <div className="mt-3 text-right"><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div>
    </Dialog>
  );
}
