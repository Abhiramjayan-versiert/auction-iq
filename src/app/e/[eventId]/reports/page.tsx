"use client";
import { useMemo } from "react";
import { Download, Printer } from "lucide-react";
import { cellLabel, contestedPlayers, fmtPct, fmtRating, generateInsights, predictCompetitor } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { RosterTable, useMoney } from "@/components/participant/shared";
import { useMyTeam } from "@/components/participant/NeedTeam";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";
import { downloadCsv } from "@/lib/utils";
import { analyticsWorkbook, downloadWorkbook } from "@/lib/data/excel";
import { FileSpreadsheet } from "lucide-react";

export default function Reports() {
  const { me, prompt } = useMyTeam();
  const { event, teamName, rules, players, transactions } = useEventData();
  const { intel } = useWorkspace();
  const m = useMoney();
  const insights = useMemo(() => (me ? generateInsights(intel, me.team.id) : []), [intel, me]);
  const preds = useMemo(() => intel.teams.filter((t) => t.team.id !== me?.team.id).map((t) => predictCompetitor(intel, t)), [intel, me]);
  const hot = useMemo(() => contestedPlayers(intel, 10), [intel]);
  if (!me) return prompt;
  const rank = intel.leaderboard.find((r) => r.teamId === me.team.id);
  const exportTeams = () =>
    downloadCsv(`${event!.name}-competitor-report.csv`, intel.teams.map((t) => ({
      team: t.team.name, players: t.rating.count, initial_purse: t.initialPurse, spent: t.spent, remaining: t.remaining, utilisation: fmtPct(t.utilization),
      max_single_bid: t.maxSingleBid, avg_rating: t.rating.average, total_rating: t.rating.total, projected_avg: t.projectedAverage, weighted: t.rating.weighted,
      batting: t.rating.batting, bowling: t.rating.bowling, balance: t.rating.balance, still_required: t.rules.slotsRequired, status: t.rules.status,
      includes_estimates: t.hasEstimates ? "yes" : "no", official_rank: intel.leaderboard.find((r) => r.teamId === t.team.id)?.officialRank,
    })));
  return (
    <div className="space-y-4 print:text-black">
      <PageHeader title="Strategic report" description={`${event!.name} · generated ${new Date().toLocaleString("en-IN")}`} actions={<><Button size="sm" variant="secondary" onClick={() => downloadWorkbook(`${event!.name} - AUCTION IQ.xlsx`, [{ name: "My insights", rows: insights.map((i) => ({ Priority: i.severity, Insight: i.title, Detected: i.detected, Action: i.action, Impact: i.impact, Confidence: i.confidence, Calculation: i.calculation })) }, ...analyticsWorkbook(intel, players, teamName, transactions)])}><FileSpreadsheet size={14} /> Excel workbook</Button><Button variant="outline" size="sm" onClick={exportTeams}><Download size={14} /> Competitor CSV</Button><Button size="sm" onClick={() => window.print()}><Printer size={14} /> Print / PDF</Button></>} />
      <Card>
        <CardHeader title={`${me.team.name} — position summary`} />
        <CardBody className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          {[
            ["Official rank", `#${rank?.officialRank} of ${intel.teams.length} (${rank?.eligible ? "eligible" : "not yet eligible"})`],
            ["Average rating", `${fmtRating(me.rating.average)} (projected ${fmtRating(me.projectedAverage)})`],
            ["Purse", `${m(me.remaining)} remaining of ${m(me.initialPurse)} (${fmtPct(me.utilization)} used)`],
            ["Free budget", `${m(me.discretionary)} after ${m(me.floorReserve)} reserve`],
            ["Still required", `${me.rules.slotsRequired}: ${[...new Set(me.rules.mandatoryPlan)].map(cellLabel).join(", ") || "none"}`],
            ["Squad status", me.rules.status],
            ["Weighted analytical score", fmtRating(me.rating.weighted)],
            ["Ranking formula", rules.ranking_formula],
          ].map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-line/30 py-1"><span className="text-muted">{k}</span><span className="tabular text-right">{v}</span></div>)}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Recommendations" />
        <CardBody>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {insights.map((i) => <li key={i.id}><b>{i.title}.</b> {i.detected} <span className="text-accent">{i.action}</span> <span className="text-xs text-faint">[{i.confidence} confidence · {i.calculation}]</span></li>)}
          </ol>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Competitor outlook" description="Analytical estimates, not confirmed intentions" />
        <CardBody className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead><tr className="text-left text-[11px] uppercase text-faint"><th>Team</th><th>Pressure</th><th className="text-right">Capacity</th><th>Likely next</th><th>Style</th></tr></thead>
            <tbody>{preds.sort((a, b) => b.biddingCapacity - a.biddingCapacity).map((p) => (
              <tr key={p.teamId} className="border-t border-line/40"><td className="py-1">{teamName(p.teamId)}</td><td>{p.pressure}</td><td className="text-right">{m(p.biddingCapacity)}</td><td>{p.likelyNext[0] ? `${cellLabel(p.likelyNext[0].cell)} (${p.likelyNext[0].confidence})` : "—"}</td><td>{p.spendingStyle}</td></tr>
            ))}</tbody>
          </table>
        </CardBody>
      </Card>
      {hot.length > 0 && (
        <Card>
          <CardHeader title="Contested players" />
          <CardBody className="text-sm">{hot.map((h) => <div key={h.player.id}>{h.player.name} ({fmtRating(h.player.overall)}): {h.interestedTeams.map((t) => t.teamName).join(", ")}</div>)}</CardBody>
        </Card>
      )}
      <Card>
        <CardHeader title="My roster" />
        <RosterTable team={me} />
      </Card>
    </div>
  );
}
