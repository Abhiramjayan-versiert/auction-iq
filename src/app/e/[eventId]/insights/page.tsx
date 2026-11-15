"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Bot, FlaskConical, Gauge, GitCompare, LineChart, Sparkles, Trophy, Wallet } from "lucide-react";
import { AGGRESSION_LABEL, aggressionIndex, cellLabel, financialIntel, generateInsights, leaderHunter, scarcity, weaknessScan } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, PageHeader } from "@/components/ui/misc";
import { InsightCard } from "@/components/domain/insight";
import { useMoney } from "@/components/participant/shared";
import { useMyTeam } from "@/components/participant/NeedTeam";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function Insights() {
  const { me, prompt } = useMyTeam();
  const { event } = useEventData();
  const { intel } = useWorkspace();
  const m = useMoney();
  const all = useMemo(() => (me ? generateInsights(intel, me.team.id) : []), [intel, me]);
  const weak = useMemo(() => (me ? weaknessScan(intel, me.team.id) : []), [intel, me]);
  const fi = useMemo(() => financialIntel(intel), [intel]);
  const ag = useMemo(() => aggressionIndex(intel), [intel]);
  const sc = useMemo(() => scarcity(intel), [intel]);
  const hunt = useMemo(() => (me ? leaderHunter(intel, me.team.id) : null), [intel, me]);
  if (!me) return prompt;
  const b = `/e/${event!.id}`;
  const tools = [
    { href: `${b}/copilot`, icon: Bot, label: "Auction Co-Pilot", sub: "Ask anything about the auction" },
    { href: `${b}/smart-bid`, icon: Sparkles, label: "Smart Bid", sub: "Safe bid for the player on the block" },
    { href: `${b}/purse-planner`, icon: Wallet, label: "Purse planner", sub: "Reserves & competitor purses" },
    { href: `${b}/simulator`, icon: FlaskConical, label: "What-if simulator", sub: "Try purchases privately" },
    { href: `${b}/shadow`, icon: GitCompare, label: "Shadow auction", sub: "Your alternative squad" },
    { href: `${b}/lab`, icon: Gauge, label: "Strategy lab", sub: "Monte Carlo, Leader Hunter, regret" },
    { href: `${b}/analytics`, icon: LineChart, label: "Analytics", sub: "Charts across all teams" },
    { href: `${b}/leaderboard`, icon: Trophy, label: "Leaderboard", sub: "Official vs analytical" },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Insights" description="Everything the engine has worked out from the data entered so far." />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {tools.map((t) => (
          <Link key={t.href} href={t.href} className="rounded-xl border border-line/70 bg-surface p-3 hover:border-accent/50">
            <t.icon size={16} className="text-accent" />
            <div className="mt-1 text-sm font-medium">{t.label}</div>
            <div className="text-[11px] text-muted">{t.sub}</div>
          </Link>
        ))}
      </div>
      {hunt && hunt.status !== "no-data" && (
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent">Leader Hunter</div>
          <p className="mt-1 text-sm">{hunt.message}</p>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={`Recommendations (${all.length})`} />
          <CardBody className="space-y-2">{all.length ? all.map((i) => <InsightCard key={i.id} insight={i} />) : <p className="text-xs text-muted">Nothing yet — insights appear as entries come in.</p>}</CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Team weakness scanner" description="Only checks the data supports" />
            <CardBody className="space-y-2 text-sm">
              {weak.length ? weak.map((w) => (
                <div key={w.kind} className="rounded-md bg-surface-2 p-2">
                  <div className="flex justify-between gap-2"><b>{w.title}</b><Badge tone={w.severity === "critical" ? "danger" : w.severity === "warning" ? "warn" : "neutral"}>{w.confidence}</Badge></div>
                  <div className="text-xs text-muted">{w.detected}</div>
                  <div className="text-xs"><span className="text-faint">Why:</span> {w.why}</div>
                  <div className="text-xs text-accent">{w.improve}</div>
                  <div className="text-[11px] text-faint">{w.impact}</div>
                </div>
              )) : <p className="text-xs text-muted">No weaknesses detected from the recorded data.</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Competitor finances" />
            <CardBody className="space-y-1.5 text-xs">
              <div><span className="text-faint">Most purse left:</span> {fi.highestPurse.map((t) => `${t.team.short_name || t.team.name} ${m(t.remaining)}`).join(" · ") || "—"}</div>
              <div><span className="text-faint">Least purse left:</span> {fi.lowestPurse.map((t) => `${t.team.short_name || t.team.name} ${m(t.remaining)}`).join(" · ") || "—"}</div>
              <div><span className="text-faint">Spending fast:</span> {fi.aggressive.map((t) => t.team.short_name || t.team.name).join(", ") || "none"}</div>
              <div><span className="text-faint">Spending cautiously:</span> {fi.conservative.map((t) => t.team.short_name || t.team.name).join(", ") || "none"}</div>
              <div><span className="text-faint">Many slots still to fill:</span> {fi.largeRequirements.map((t) => `${t.team.short_name || t.team.name} (${t.rules.slotsRequired})`).join(", ") || "none"}</div>
              <div><span className="text-faint">Can&apos;t outbid the median price:</span> {fi.limitedFlexibility.map((t) => t.team.short_name || t.team.name).join(", ") || "none"}</div>
              {fi.unknownPurse.length > 0 && <div className="text-warn">Purse not set: {fi.unknownPurse.map((t) => t.team.short_name || t.team.name).join(", ")}</div>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Opponent aggression index" description="Estimate from winning prices only" />
            <CardBody className="space-y-1 text-xs">
              {ag.filter((x) => x.cls).sort((x, y) => (y.index ?? 0) - (x.index ?? 0)).map((x) => (
                <div key={x.teamId} className="flex justify-between gap-2"><span>{x.teamName}</span><span className="tabular">{x.index}× · <Badge tone={x.cls === "highly_aggressive" ? "danger" : x.cls === "aggressive" ? "warn" : "neutral"}>{AGGRESSION_LABEL[x.cls!]}</Badge></span></div>
              ))}
              {!ag.some((x) => x.cls) && <p className="text-muted">Needs a few recorded purchases.</p>}
              <p className="pt-1 text-[11px] text-faint">Only winning prices are recorded (losing bids are not), so this is indicative.</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Player scarcity" />
            <CardBody className="space-y-1 text-xs">
              {sc.reliable ? sc.cells.map((c) => <div key={c.cell} className="flex justify-between"><span>{cellLabel(c.cell)}</span><span className="tabular">{c.supply} left · {c.demand} needed by {c.teams} team(s) <Badge tone={c.level === "critical" ? "danger" : c.level === "high" ? "warn" : "ok"}>{c.level}</Badge></span></div>) : <p className="text-muted">{sc.reason}</p>}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
