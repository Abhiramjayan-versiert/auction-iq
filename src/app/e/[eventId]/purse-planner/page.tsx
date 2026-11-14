"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cellLabel, fmtPct, reserveFor, round2, STRATEGY_PARAMS, type Strategy } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge, PageHeader, Stat, Tabs } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { SourceBadge } from "@/components/domain/badges";
import { TeamChip } from "@/components/domain/team";
import { useMoney } from "@/components/participant/shared";
import { useMyTeam } from "@/components/participant/NeedTeam";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { ObservationRow } from "@/lib/types/db";

function Planner() {
  const tab = useSearchParams().get("tab") === "competitors" ? "competitors" : "mine";
  const [t, setT] = useState<"mine" | "competitors">(tab);
  return (
    <div className="space-y-4">
      <PageHeader title="Purse planner" description="Reserves, free budget and competitor purse tracking — all calculated for you." />
      <Tabs value={t} onChange={setT} tabs={[{ value: "mine", label: "My purse plan" }, { value: "competitors", label: "Competitor purse calculator" }]} />
      {t === "mine" ? <MyPlan /> : <CompetitorCalc />}
    </div>
  );
}

function MyPlan() {
  const { me, prompt } = useMyTeam();
  const { intel } = useWorkspace();
  const m = useMoney();
  if (!me) return prompt;
  const mk = intel.market;
  const strategies = (Object.keys(STRATEGY_PARAMS) as Strategy[]).map((s) => {
    const reserve = reserveFor(me.rules, mk, s);
    return { s, reserve, free: round2(me.remaining - reserve) };
  });
  const perSlot = me.rules.slotsRequired ? round2(me.remaining / me.rules.slotsRequired) : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="Remaining purse" value={m(me.remaining)} tone="accent" />
        <Stat label="Mandatory slots" value={me.rules.slotsRequired} sub={`${me.rules.slotsRemaining} squad slots left`} />
        <Stat label="Minimum reserve" value={m(me.floorReserve)} sub="at floor prices" />
        <Stat label="Free budget" value={m(me.discretionary)} tone={me.discretionary < 0 ? "danger" : undefined} />
        <Stat label="Average per required slot" value={m(perSlot)} />
      </div>
      {!me.purseSufficient && <p className="rounded-md border border-danger/50 bg-danger/10 p-2 text-sm text-danger">CRITICAL: your purse cannot cover the remaining mandatory squad even at base prices.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Reserve by strategy" description="How much to hold back for mandatory players" />
          <CardBody>
            <table className="w-full text-sm tabular">
              <thead><tr className="text-[11px] uppercase text-faint"><th className="text-left">Strategy</th><th className="text-right">Reserve</th><th className="text-right">Free to spend</th></tr></thead>
              <tbody>{strategies.map((r) => (
                <tr key={r.s} className="border-t border-line/40"><td className="py-1.5">{STRATEGY_PARAMS[r.s].label}</td><td className="text-right">{m(r.reserve)}</td><td className={`text-right font-semibold ${r.free < 0 ? "text-danger" : "text-accent"}`}>{m(r.free)}</td></tr>
              ))}</tbody>
            </table>
            <p className="mt-2 text-[11px] text-faint">Floor = cheapest base price available in each required role. Market = median winning price in that role this auction (or median base price before any sales).</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Mandatory slot plan" description="Minimal set of players still needed to satisfy every rule" />
          <CardBody>
            {me.rules.slotsRequired === 0 ? <p className="text-sm text-ok">All requirements met. Every remaining rupee is discretionary.</p> : (
              <table className="w-full text-sm tabular">
                <thead><tr className="text-[11px] uppercase text-faint"><th className="text-left">Slot</th><th className="text-right">Floor</th><th className="text-right">Market</th><th className="text-right">Left in pool</th></tr></thead>
                <tbody>
                  {me.rules.mandatoryPlan.map((c, i) => (
                    <tr key={i} className="border-t border-line/40"><td className="py-1.5">{cellLabel(c)}</td><td className="text-right">{m(mk.floorPrice[c])}</td><td className="text-right">{m(mk.expectedPrice[c])}</td><td className="text-right">{mk.supply[c]}</td></tr>
                  ))}
                  {Array.from({ length: me.rules.flexSlots }).map((_, i) => (
                    <tr key={`f${i}`} className="border-t border-line/40"><td className="py-1.5">Any role (to reach squad minimum)</td><td className="text-right">{m(mk.globalFloor)}</td><td className="text-right">—</td><td className="text-right">{mk.available.length}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Purse utilisation" />
        <CardBody>
          <div className="flex h-6 w-full overflow-hidden rounded-md bg-surface-3 text-[10px] font-semibold text-black">
            <div className="bg-info flex items-center justify-center" style={{ width: `${me.utilization * 100}%` }}>{me.utilization > 0.1 && "Spent"}</div>
            <div className="bg-warn flex items-center justify-center" style={{ width: `${Math.min(1 - me.utilization, me.floorReserve / Math.max(me.initialPurse, 1)) * 100}%` }}>{me.floorReserve / me.initialPurse > 0.1 && "Reserved"}</div>
            <div className="bg-accent flex items-center justify-center flex-1">{me.discretionary > 0 && "Free"}</div>
          </div>
          <div className="mt-2 text-xs text-muted">Spent {m(me.spent)} ({fmtPct(me.utilization)}) · reserved {m(me.floorReserve)} · free {m(Math.max(0, me.discretionary))}</div>
        </CardBody>
      </Card>
    </div>
  );
}

function CompetitorCalc() {
  const { teams, players, playerById, analysis, transactions, myTeamId } = useEventData();
  const { intel, observations, addObservation, removeObservation, updateObservation } = useWorkspace();
  const m = useMoney();
  const [teamId, setTeamId] = useState(teams.find((t) => t.id !== myTeamId)?.id ?? teams[0]?.id ?? "");
  const [pid, setPid] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState<ObservationRow["label"]>("participant");
  const [purse, setPurse] = useState("");
  const t = intel.byId[teamId];
  const official = analysis.byId[teamId];
  if (!t || !official) return null;
  const obs = observations.filter((o) => o.team_id === teamId);
  const purseObs = obs.find((o) => o.kind === "initial_purse");
  const officialSold = new Set(transactions.filter((x) => x.status === "active" && x.type === "sale").map((x) => x.player_id));
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || (!pid && !name.trim())) return toast.error("Choose a player (or type a name) and an amount");
    await addObservation({ team_id: teamId, kind: "purchase", player_id: pid || null, player_name: pid ? playerById[pid]?.name ?? null : name.trim(), amount: Number(amount), label, note: null });
    setPid(""); setName(""); setAmount("");
    toast.success("Observation saved privately");
  };
  const savePurse = async () => {
    if (!purse) return;
    if (purseObs) await updateObservation(purseObs.id, { amount: Number(purse) });
    else await addObservation({ team_id: teamId, kind: "initial_purse", player_id: null, player_name: null, amount: Number(purse), label: "estimated", note: null });
    setPurse("");
  };
  const unrated = t.entries.filter((e) => e.player.overall === null).length;
  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Team"><Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>{teams.map((x) => <option key={x.id} value={x.id}>{x.name}{x.id === myTeamId ? " (you)" : ""}</option>)}</Select></Field>
          <div className="text-xs text-muted">Official transactions are always the source of truth; your entries fill gaps and are visible only to you.</div>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Initial purse" value={m(t.initialPurse)} sub={purseObs ? <Badge tone="warn">estimated</Badge> : <Badge tone="accent">official</Badge>} />
        <Stat label="Total spent" value={m(t.spent)} />
        <Stat label="Remaining" value={m(t.remaining)} tone="accent" />
        <Stat label="Players bought" value={t.rating.count} />
        <Stat label="Squad slots left" value={t.rules.slotsRemaining} />
        <Stat label="Avg spend" value={m(t.avgPrice)} />
        <Stat label="Utilisation" value={fmtPct(t.utilization)} />
        <Stat label="Min reserve" value={m(t.floorReserve)} sub={`${t.rules.slotsRequired} mandatory`} />
      </div>
      {unrated > 0 && <p className="text-xs text-warn">{unrated} manually entered player(s) are not in the event database, so they count toward purse but not ratings or role rules.</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={<TeamChip team={t.team} />} description="Purchases" />
          <CardBody>
            <table className="w-full text-sm tabular">
              <thead><tr className="text-[11px] uppercase text-faint"><th className="text-left">Player</th><th className="text-right">Price</th><th className="text-left pl-3">Label</th><th /></tr></thead>
              <tbody>
                {official.entries.map((e) => (
                  <tr key={e.player.id} className="border-t border-line/40"><td className="py-1.5">{e.player.name}</td><td className="text-right">{m(e.price)}</td><td className="pl-3"><SourceBadge source="official" /></td><td /></tr>
                ))}
                {obs.filter((o) => o.kind === "purchase").map((o) => {
                  const superseded = o.player_id && officialSold.has(o.player_id);
                  return (
                    <tr key={o.id} className={`border-t border-line/40 ${superseded ? "opacity-50 line-through" : ""}`}>
                      <td className="py-1.5">{o.player_name}{superseded && <span className="ml-2 text-[10px] no-underline">(superseded by official record)</span>}</td>
                      <td className="text-right"><Input type="number" step="0.05" defaultValue={o.amount} className="ml-auto h-7 w-24 text-right" onBlur={(e) => Number(e.target.value) !== Number(o.amount) && updateObservation(o.id, { amount: Number(e.target.value) })} /></td>
                      <td className="pl-3">
                        <Select className="h-7 w-36 text-xs" value={o.label} onChange={(e) => updateObservation(o.id, { label: e.target.value as ObservationRow["label"] })}>
                          <option value="participant">Participant-entered</option><option value="estimated">Estimated</option><option value="unverified">Unverified</option>
                        </Select>
                      </td>
                      <td className="text-right"><button onClick={() => removeObservation(o.id)} className="text-faint hover:text-danger cursor-pointer" aria-label="Delete"><Trash2 size={14} /></button></td>
                    </tr>
                  );
                })}
                {!official.entries.length && !obs.length && <tr><td colSpan={4} className="py-6 text-center text-xs text-muted">No purchases recorded yet.</td></tr>}
              </tbody>
            </table>
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Add observation" />
            <CardBody>
              <form onSubmit={add} className="space-y-2">
                <Select value={pid} onChange={(e) => setPid(e.target.value)}>
                  <option value="">Player from database…</option>
                  {players.filter((p) => !officialSold.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                {!pid && <Input placeholder="…or type a player name" value={name} onChange={(e) => setName(e.target.value)} />}
                <div className="flex gap-2">
                  <Input type="number" step="0.05" min="0" placeholder="Price" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <Select value={label} onChange={(e) => setLabel(e.target.value as ObservationRow["label"])}>
                    <option value="participant">Participant-entered</option><option value="estimated">Estimated</option><option value="unverified">Unverified</option>
                  </Select>
                </div>
                <Button className="w-full" size="sm">Add</Button>
              </form>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Initial purse" description={`Official: ${m(official.initialPurse)}`} />
            <CardBody className="space-y-2">
              <div className="flex gap-2"><Input type="number" step="0.5" placeholder={purseObs ? `Estimate: ${purseObs.amount}` : "Your estimate"} value={purse} onChange={(e) => setPurse(e.target.value)} /><Button size="sm" variant="secondary" onClick={savePurse}>Save</Button></div>
              {purseObs && <Button size="sm" variant="ghost" onClick={() => removeObservation(purseObs.id)}>Use official purse</Button>}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><Planner /></Suspense>;
}
