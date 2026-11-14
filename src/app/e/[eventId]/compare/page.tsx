"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { fmtPct, fmtRating, type TeamAnalysis } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, PageHeader } from "@/components/ui/misc";
import { SquadStatusBadge } from "@/components/domain/badges";
import { StrengthRadar } from "@/components/domain/charts";
import { TeamChip } from "@/components/domain/team";
import { useMoney } from "@/components/participant/shared";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";

function Compare() {
  const { myTeamId, rules } = useEventData();
  const { intel } = useWorkspace();
  const m = useMoney();
  const initial = useSearchParams().get("teams");
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const base = initial ? initial.split(",").filter(Boolean) : [];
    if (myTeamId && !base.includes(myTeamId)) base.unshift(myTeamId);
    setIds(base.slice(0, 6));
  }, [initial, myTeamId]);
  const teams = ids.map((id) => intel.byId[id]).filter(Boolean) as TeamAnalysis[];
  const rank = Object.fromEntries(intel.leaderboard.map((r) => [r.teamId, r.officialRank]));
  const rows: [string, (t: TeamAnalysis) => number | null, (t: TeamAnalysis) => string, "high" | "low"][] = [
    ["Official rank", (t) => rank[t.team.id], (t) => `#${rank[t.team.id]}`, "low"],
    ["Remaining purse", (t) => t.remaining, (t) => m(t.remaining), "high"],
    ["Free budget", (t) => t.discretionary, (t) => m(t.discretionary), "high"],
    ["Max single bid", (t) => t.maxSingleBid, (t) => m(t.maxSingleBid), "high"],
    ["Spent", (t) => t.spent, (t) => `${m(t.spent)} (${fmtPct(t.utilization)})`, "low"],
    ["Players", (t) => t.rating.count, (t) => String(t.rating.count), "high"],
    ["Still required", (t) => t.rules.slotsRequired, (t) => String(t.rules.slotsRequired), "low"],
    ["Average rating", (t) => t.rating.average, (t) => fmtRating(t.rating.average), "high"],
    ["Total rating", (t) => t.rating.total, (t) => fmtRating(t.rating.total), "high"],
    ["Projected average", (t) => t.projectedAverage, (t) => fmtRating(t.projectedAverage), "high"],
    ["Weighted (analytical)", (t) => t.rating.weighted, (t) => fmtRating(t.rating.weighted), "high"],
    ["Batting", (t) => t.rating.batting, (t) => fmtRating(t.rating.batting), "high"],
    ["Bowling", (t) => t.rating.bowling, (t) => fmtRating(t.rating.bowling), "high"],
    ["All-rounders", (t) => t.rating.allrounder, (t) => fmtRating(t.rating.allrounder), "high"],
    ["Balance", (t) => t.rating.balance, (t) => `${t.rating.balance.toFixed(0)}/100`, "high"],
    ["Overseas / Indian", () => null, (t) => `${t.overseasCount} / ${t.indianCount}`, "high"],
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Team comparison" description="Side-by-side, best value highlighted." />
      <Card className="p-3">
        <div className="flex flex-wrap gap-1.5">
          {intel.teams.map((t) => (
            <button key={t.team.id} onClick={() => setIds((p) => (p.includes(t.team.id) ? p.filter((x) => x !== t.team.id) : [...p, t.team.id].slice(-6)))}
              className={cn("rounded-md border px-2 py-1 text-xs cursor-pointer", ids.includes(t.team.id) ? "border-accent/60 bg-accent/10 text-accent" : "border-line text-muted hover:text-fg")}>
              {t.team.short_name || t.team.name}
            </button>
          ))}
        </div>
      </Card>
      {teams.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead>
                <tr className="border-b border-line/70">
                  <th className="px-3 py-2 text-left text-[11px] uppercase text-faint">Metric</th>
                  {teams.map((t) => <th key={t.team.id} className="px-3 py-2 text-right"><TeamChip team={t.team} className="justify-end" /></th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, val, show, best]) => {
                  const vs = teams.map(val).filter((x): x is number => x !== null);
                  const top = vs.length ? (best === "high" ? Math.max(...vs) : Math.min(...vs)) : null;
                  return (
                    <tr key={label} className="border-b border-line/40">
                      <td className="px-3 py-1.5 text-muted">{label}</td>
                      {teams.map((t) => <td key={t.team.id} className={cn("px-3 py-1.5 text-right", teams.length > 1 && val(t) === top && "font-semibold text-accent")}>{show(t)}</td>)}
                    </tr>
                  );
                })}
                <tr>
                  <td className="px-3 py-1.5 text-muted">Rule status</td>
                  {teams.map((t) => <td key={t.team.id} className="px-3 py-1.5 text-right"><SquadStatusBadge status={t.rules.status} /></td>)}
                </tr>
              </tbody>
            </table>
          </Card>
          <Card>
            <CardHeader title="Strength profiles" />
            <CardBody><StrengthRadar teams={teams.slice(0, 4).map((t) => ({ name: t.team.short_name || t.team.name, rating: t.rating }))} scale={rules.rating_scale_max} height={300} /></CardBody>
            {teams.length > 4 && <p className="px-4 pb-3 text-[11px] text-faint">Chart shows the first 4 teams.</p>}
            <div className="px-4 pb-4 flex flex-wrap gap-1">{teams.filter((t) => t.hasEstimates).map((t) => <Badge key={t.team.id} tone="warn">{t.team.short_name || t.team.name}: includes estimates</Badge>)}</div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense><Compare /></Suspense>;
}
