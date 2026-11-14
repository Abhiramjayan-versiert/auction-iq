"use client";
import Link from "next/link";
import { useMemo } from "react";
import { classifyTeams, generateInsights, fmtRating, fmtPct } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, Progress, Stat } from "@/components/ui/misc";
import { RuleAlerts } from "@/components/domain/alerts";
import { InsightCard } from "@/components/domain/insight";
import { SquadStatusBadge } from "@/components/domain/badges";
import { TeamChip } from "@/components/domain/team";
import { PlayerName, useMoney } from "@/components/participant/shared";
import { useMyTeam } from "@/components/participant/NeedTeam";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";
import { fmtTime } from "@/lib/utils";

export default function ParticipantDashboard() {
  const { me, prompt } = useMyTeam();
  const { event, session, playerById, transactions, teamName, rules } = useEventData();
  const { intel } = useWorkspace();
  const m = useMoney();
  const insights = useMemo(() => (me ? generateInsights(intel, me.team.id) : []), [intel, me]);
  const flags = useMemo(() => classifyTeams(intel), [intel]);
  if (!me) return prompt;
  const others = intel.teams.filter((t) => t.team.id !== me.team.id);
  const rated = intel.teams.filter((t) => t.rating.average !== null);
  const by = <T,>(arr: T[], f: (x: T) => number, dir = -1) => [...arr].sort((a, b) => dir * (f(a) - f(b)))[0];
  const highest = by(rated, (t) => t.rating.average ?? 0);
  const lowest = by(rated, (t) => t.rating.average ?? 0, 1);
  const richest = by(intel.teams, (t) => t.remaining);
  const poorest = by(intel.teams, (t) => t.remaining, 1);
  const spender = by(intel.teams, (t) => t.spent);
  const balanced = by(intel.teams, (t) => t.rating.balance);
  const leader = intel.leaderboard[0] ? intel.byId[intel.leaderboard[0].teamId] : null;
  const myRow = intel.leaderboard.find((r) => r.teamId === me.team.id);
  const current = session?.current_player_id ? playerById[session.current_player_id] : null;
  const sales = transactions.filter((t) => t.status === "active" && t.type === "sale");
  const latest = sales[0];
  const tight = me.discretionary < 0 ? "danger" : me.discretionary < me.floorReserve * 0.25 ? "warn" : undefined;
  const crit = insights.filter((i) => i.severity === "critical" || i.severity === "warning");
  const opp = insights.filter((i) => i.severity === "opportunity" || i.severity === "info");
  const pill = (label: string, t: typeof highest | undefined, v: (x: NonNullable<typeof highest>) => string) =>
    t ? (
      <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
        <span className="text-muted">{label}</span>
        <span className="flex items-center gap-2"><TeamChip team={t.team} /><span className="tabular text-xs text-faint">{v(t)}</span></span>
      </div>
    ) : null;
  return (
    <div className="space-y-4">
      {/* MY TEAM */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 px-4 pt-4">
          <TeamChip team={me.team} className="text-lg font-semibold" />
          <SquadStatusBadge status={me.rules.status} />
          {me.hasEstimates && <Badge tone="warn">includes your estimates</Badge>}
          <span className="ml-auto text-xs text-muted">Official rank <b className="text-fg">#{myRow?.officialRank ?? "—"}</b> of {intel.teams.length} · {myRow?.eligible ? "eligible" : "not yet eligible"}</span>
        </div>
        <CardBody className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          <Stat label="Remaining purse" value={m(me.remaining)} sub={`of ${m(me.initialPurse)}`} tone="accent" />
          <Stat label="Total spent" value={m(me.spent)} sub={`${fmtPct(me.utilization)} used`} />
          <Stat label="Free budget" value={m(me.discretionary)} sub={`reserve ${m(me.floorReserve)}`} tone={tight} />
          <Stat label="Players" value={`${me.rating.count} / ${rules.squad_min === rules.squad_max ? rules.squad_max : `${rules.squad_min}–${rules.squad_max}`}`} sub={`${me.rules.slotsRequired} required · ${me.rules.slotsRemaining} slots left`} />
          <Stat label="Average rating" value={fmtRating(me.rating.average)} sub={`projected ${fmtRating(me.projectedAverage)}`} />
        </CardBody>
        <div className="px-4 pb-4"><Progress value={me.utilization} tone={tight ?? "accent"} /></div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* LIVE */}
        <Card>
          <CardHeader title="Live auction" description={session ? `Session: ${session.status.replace("_", " ")}` : "—"} action={<Link href={`/e/${event!.id}/live`} className="text-xs text-accent">Open live workspace →</Link>} />
          <CardBody className="space-y-3">
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="text-[11px] uppercase text-faint">On the block</div>
              {current ? (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <PlayerName p={current} sub />
                  <span className="text-right"><b className="tabular text-accent">{fmtRating(current.overall)}</b><div className="text-[11px] text-faint">base {m(current.base_price)}</div></span>
                </div>
              ) : <div className="mt-1 text-sm text-muted">Waiting for the auctioneer…</div>}
              {session?.current_bid && session.bidding_open && <div className="mt-2 text-xs text-muted">Announced bid: <b className="text-fg">{m(session.current_bid)}</b> {session.current_bid_team_id && `· ${teamName(session.current_bid_team_id)}`}</div>}
            </div>
            {latest && playerById[latest.player_id] && (
              <div className="text-sm">
                <div className="text-[11px] uppercase text-faint">Latest sale</div>
                <div className="mt-1 flex justify-between"><span>{playerById[latest.player_id].name}</span><span className="tabular">{m(latest.amount)} → <b>{teamName(latest.team_id)}</b></span></div>
              </div>
            )}
            <ul className="space-y-1 text-xs">
              {sales.slice(1, 6).map((t) => (
                <li key={t.id} className="flex justify-between text-muted"><span className="truncate">{fmtTime(t.created_at)} · {playerById[t.player_id]?.name}</span><span className="tabular">{m(t.amount)} · {teamName(t.team_id)}</span></li>
              ))}
            </ul>
          </CardBody>
        </Card>

        {/* COMPETITORS */}
        <Card>
          <CardHeader title="Competitor overview" description={`${others.length} competing teams`} action={<Link href={`/e/${event!.id}/competitors`} className="text-xs text-accent">All competitors →</Link>} />
          <CardBody>
            {pill("Projected leader", leader ?? undefined, (t) => fmtRating(t.official))}
            {pill("Highest rated", highest, (t) => fmtRating(t.rating.average))}
            {pill("Lowest rated", lowest, (t) => fmtRating(t.rating.average))}
            {pill("Most purse left", richest, (t) => m(t.remaining))}
            {pill("Least purse left", poorest, (t) => m(t.remaining))}
            {pill("Highest spending", spender, (t) => m(t.spent))}
            {pill("Most balanced", balanced, (t) => `${t.rating.balance.toFixed(0)}/100`)}
            <div className="mt-2 flex flex-wrap gap-1">
              {others.filter((t) => flags[t.team.id]?.includes("financially_weak")).slice(0, 6).map((t) => <Badge key={t.team.id} tone="warn">{t.team.short_name || t.team.name} low funds</Badge>)}
            </div>
          </CardBody>
        </Card>

        {/* RULES */}
        <Card>
          <CardHeader title="Squad validity" description="Live check against this event's rules" />
          <CardBody><RuleAlerts alerts={me.rules.alerts} /></CardBody>
        </Card>
      </div>

      {/* INTELLIGENCE */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Critical warnings & priorities" />
          <CardBody className="space-y-2">{crit.length ? crit.map((i) => <InsightCard key={i.id} insight={i} />) : <p className="text-xs text-muted">No warnings right now.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Opportunities & competitor weaknesses" />
          <CardBody className="space-y-2">{opp.length ? opp.slice(0, 8).map((i) => <InsightCard key={i.id} insight={i} />) : <p className="text-xs text-muted">Opportunities appear as the auction develops.</p>}</CardBody>
        </Card>
      </div>
    </div>
  );
}
