"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Crosshair, Radio, Swords, Target } from "lucide-react";
import { askCopilot, cellLabel, classifyTeams, fmtPct, fmtRating, generateInsights, weaknessScan } from "@/lib/engine";
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
import { cn, fmtTime } from "@/lib/utils";

/** AUCTION WAR ROOM — the participant's mobile-first home screen. */
export default function WarRoom() {
  const { me, prompt } = useMyTeam();
  const { event, session, playerById, transactions, teamName, rules, isTracker, players } = useEventData();
  const { intel, strategy } = useWorkspace();
  const m = useMoney();
  const insights = useMemo(() => (me ? generateInsights(intel, me.team.id) : []), [intel, me]);
  const flags = useMemo(() => classifyTeams(intel), [intel]);
  const next = useMemo(() => (me ? askCopilot("What should my next three purchases focus on?", { a: intel, myTeamId: me.team.id, strategy, players }) : null), [intel, me, strategy, players]);
  const weaknesses = useMemo(() => (me ? weaknessScan(intel, me.team.id) : []), [intel, me]);
  if (!me) return prompt;
  const b = `/e/${event!.id}`;
  const lb = intel.leaderboard;
  const myRow = lb.find((r) => r.teamId === me.team.id);
  const myIdx = lb.findIndex((r) => r.teamId === me.team.id);
  const rivalRow = myIdx > 0 ? lb[myIdx - 1] : lb[1];
  const rival = rivalRow ? intel.byId[rivalRow.teamId] : null;
  const others = intel.teams.filter((t) => t.team.id !== me.team.id);
  const rated = intel.teams.filter((t) => t.rating.average !== null);
  const by = <T,>(arr: T[], f: (x: T) => number, dir = -1) => [...arr].filter((x) => !Number.isNaN(f(x))).sort((a, c) => dir * (f(a) - f(c)))[0];
  const highest = by(rated, (t) => t.rating.average ?? 0);
  const richest = by(intel.teams, (t) => t.remaining);
  const poorest = by(intel.teams, (t) => t.remaining, 1);
  const spender = by(intel.teams, (t) => t.spent);
  const balanced = by(intel.teams, (t) => t.rating.balance);
  const current = session?.current_player_id ? playerById[session.current_player_id] : null;
  const active = transactions.filter((t) => t.status === "active");
  const sales = active.filter((t) => t.type === "sale");
  const unsold = active.filter((t) => t.type === "unsold");
  const totalSpend = sales.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const latest = sales[0];
  const tight = !me.purseKnown ? undefined : me.discretionary < 0 ? "danger" : me.floorReserve > 0 && me.discretionary < me.floorReserve * 0.25 ? "warn" : undefined;
  const crit = insights.filter((i) => i.severity === "critical" || i.severity === "warning");
  const opp = insights.filter((i) => i.severity === "opportunity" || i.severity === "info");
  const pill = (label: string, t: typeof highest | undefined, v: (x: NonNullable<typeof highest>) => string) =>
    t ? (
      <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
        <span className="text-muted">{label}</span>
        <span className="flex min-w-0 items-center gap-2"><TeamChip team={t.team} /><span className="tabular text-xs text-faint">{v(t)}</span></span>
      </div>
    ) : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Auction War Room</h1>
        <span className="text-[11px] text-faint">Think ahead. Bid smarter. Win better.</span>
      </div>

      {/* MY TEAM */}
      <Card>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
          <TeamChip team={me.team} className="text-lg font-semibold" />
          <SquadStatusBadge status={me.rules.status} />
          {me.hasEstimates && <Badge tone="warn">includes your estimates</Badge>}
          <span className="ml-auto text-xs text-muted">
            Rank <b className="text-fg">#{myRow?.officialRank ?? "—"}</b>/{intel.teams.length}
            {myRow && myRow.projectedRank !== myRow.officialRank && <> · projected #{myRow.projectedRank}</>}
          </span>
        </div>
        <CardBody className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          <Stat label="Remaining purse" value={me.purseKnown ? m(me.remaining) : "Not set"} sub={me.purseKnown ? `of ${m(me.initialPurse)} · ${fmtPct(me.utilization)} spent` : "ask the organiser"} tone="accent" />
          <Stat label="Safe to spend" value={me.purseKnown ? m(Math.max(0, me.discretionary)) : "—"} sub={me.rules.slotsRequired ? `keeps ${m(me.floorReserve)} for ${me.rules.slotsRequired} slot(s)` : "squad complete"} tone={tight} />
          <Stat label="Average rating" value={fmtRating(me.rating.average)} sub={`${me.rating.ratedCount} rated · total ${fmtRating(me.rating.total)}`} />
          <Stat label="Players" value={`${me.rating.count}/${rules.squad_min === rules.squad_max ? rules.squad_max : `${rules.squad_min}–${rules.squad_max}`}`} sub={`${me.rules.slotsRemaining} slot(s) left`} />
          <Stat className="col-span-2 md:col-span-1" label="Total spent" value={m(me.spent)} sub={me.avgPrice ? `avg ${m(me.avgPrice)}/player` : "no purchases yet"} />
        </CardBody>
        {me.purseKnown && <div className="px-4 pb-4"><Progress value={me.utilization} tone={tight ?? "accent"} /></div>}
      </Card>

      {/* WHAT TO DO NEXT */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4 md:col-span-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent"><Target size={14} /> Consider next</div>
          <p className="mt-1 text-sm">{next?.answer}</p>
          {next && next.reasoning.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">{next.reasoning.slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul>}
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            <Link href={`${b}/smart-bid`} className="text-accent">Smart Bid →</Link>
            <Link href={`${b}/copilot`} className="text-accent">Ask the Co-Pilot →</Link>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-warn"><Swords size={14} /> Biggest competitor</div>
          {rival ? (
            <>
              <div className="mt-1 flex items-center justify-between"><TeamChip team={rival.team} className="font-semibold" /><span className="tabular text-sm">{fmtRating(rival.official)}</span></div>
              <div className="mt-1 text-xs text-muted">
                {myIdx > 0 ? "Directly above you" : "Closest challenger"} · {rival.purseKnown ? `${m(rival.remaining)} left, can bid ~${m(rival.maxSingleBid)}` : "purse not set"} · needs {rival.rules.slotsRequired}
              </div>
              {rival.rules.mandatoryPlan.length > 0 && <div className="mt-1 text-xs text-faint">Likely after: {[...new Set(rival.rules.mandatoryPlan)].slice(0, 2).map(cellLabel).join(", ")} (estimate)</div>}
            </>
          ) : <p className="mt-1 text-xs text-muted">No ratings yet.</p>}
          {weaknesses[0] && <div className="mt-3 border-t border-line/60 pt-2 text-xs"><span className="text-faint">Your biggest weakness:</span> {weaknesses[0].title}</div>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* LIVE FEED */}
        <Card>
          <CardHeader title={<span className="flex items-center gap-1.5"><Radio size={13} className="text-accent" /> Live auction feed</span>} description={`${sales.length} sold · ${unsold.length} unsold · ${m(totalSpend)} spent in total`} action={<Link href={`${b}/live`} className="text-xs text-accent">Live workspace →</Link>} />
          <CardBody className="space-y-3">
            {current && (
              <div className="rounded-lg bg-surface-2 p-3">
                <div className="text-[11px] uppercase text-faint">On the block</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <PlayerName p={current} sub />
                  <span className="text-right"><b className="tabular text-accent">{fmtRating(current.overall)}</b></span>
                </div>
              </div>
            )}
            {latest && playerById[latest.player_id] ? (
              <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
                <div className="text-[11px] uppercase text-faint">Latest sale · {fmtTime(latest.created_at)}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="font-semibold">{playerById[latest.player_id].name} <span className="text-xs font-normal text-muted">({fmtRating(playerById[latest.player_id].overall)})</span></span>
                  <span className="tabular text-sm">{m(latest.amount)}</span>
                </div>
                <div className="text-xs text-muted">to <b className="text-fg">{teamName(latest.team_id)}</b></div>
              </div>
            ) : (
              <p className="text-sm text-muted">{isTracker ? "Waiting for your data-entry teammate…" : "Waiting for the first sale…"}</p>
            )}
            <ul className="space-y-1 text-xs">
              {active.slice(latest ? 1 : 0, 9).map((t) => (
                <li key={t.id} className="flex justify-between gap-2">
                  <span className="truncate text-muted">{fmtTime(t.created_at)} · <span className="text-fg">{playerById[t.player_id]?.name}</span> <span className="text-faint">{fmtRating(playerById[t.player_id]?.overall)}</span></span>
                  <span className={cn("tabular", t.type === "unsold" && "text-warn")}>{t.type === "sale" ? `${m(t.amount)} · ${teamName(t.team_id)}` : "unsold"}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        {/* COMPETITORS */}
        <Card>
          <CardHeader title={<span className="flex items-center gap-1.5"><Crosshair size={13} /> Competitor overview</span>} description={`${others.length} competing teams`} action={<Link href={`${b}/competitors`} className="text-xs text-accent">All →</Link>} />
          <CardBody>
            {pill("Projected leader", lb[0] ? intel.byId[lb[0].teamId] : undefined, (t) => fmtRating(t.official))}
            {pill("Highest rated", highest, (t) => fmtRating(t.rating.average))}
            {pill("Most purse left", richest, (t) => m(t.remaining))}
            {pill("Least purse left", poorest, (t) => m(t.remaining))}
            {pill("Highest spending", spender, (t) => m(t.spent))}
            {pill("Most balanced", balanced, (t) => `${t.rating.balance.toFixed(0)}/100`)}
            <div className="mt-2 flex flex-wrap gap-1">
              {others.filter((t) => flags[t.team.id]?.includes("financially_weak")).slice(0, 6).map((t) => <Badge key={t.team.id} tone="warn">{t.team.short_name || t.team.name} low funds</Badge>)}
              {others.filter((t) => flags[t.team.id]?.includes("aggressive_spender")).slice(0, 4).map((t) => <Badge key={t.team.id} tone="danger">{t.team.short_name || t.team.name} spending fast</Badge>)}
            </div>
          </CardBody>
        </Card>

        {/* RULES */}
        <Card>
          <CardHeader title="Squad completion" description="Live check against this event's rules" />
          <CardBody><RuleAlerts alerts={me.rules.alerts} /></CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Warnings & priorities" />
          <CardBody className="space-y-2">{crit.length ? crit.map((i) => <InsightCard key={i.id} insight={i} />) : <p className="text-xs text-muted">No warnings right now.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Opportunities & competitor weaknesses" action={<Link href={`${b}/insights`} className="text-xs text-accent">All insights →</Link>} />
          <CardBody className="space-y-2">{opp.length ? opp.slice(0, 6).map((i) => <InsightCard key={i.id} insight={i} />) : <p className="text-xs text-muted">Opportunities appear as the auction develops.</p>}</CardBody>
        </Card>
      </div>
    </div>
  );
}
