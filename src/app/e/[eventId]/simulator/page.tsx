"use client";
import { useMemo, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cellAllowed, cellOf, fmtRating, presetScenario, PRESET_LABEL, simulate, type EventAnalysis, type PresetKind } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Badge, PageHeader, Tabs } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { RuleAlerts } from "@/components/domain/alerts";
import { SquadStatusBadge } from "@/components/domain/badges";
import { CompositionGrid, PlayerPicker, useMoney } from "@/components/participant/shared";
import { useMyTeam } from "@/components/participant/NeedTeam";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { SimRow } from "@/lib/types/db";
import { cn } from "@/lib/utils";

const SCEN = ["A", "B", "C"] as const;

export default function Simulator() {
  const { me, prompt } = useMyTeam();
  const { snapshot, playerById, teams, myTeamId, analysis } = useEventData();
  const { sims, addSim, removeSim, clearSims, workspace } = useWorkspace();
  const m = useMoney();
  const [scen, setScen] = useState<SimRow["scenario"]>("A");
  const [pid, setPid] = useState("");
  const [price, setPrice] = useState("");
  const [team, setTeam] = useState("");
  const results = useMemo(() => {
    const out = {} as Record<SimRow["scenario"], EventAnalysis>;
    for (const s of SCEN) out[s] = simulate(snapshot, sims.filter((x) => x.scenario === s).map((x) => ({ ...x, price: Number(x.price) })));
    return out;
  }, [snapshot, sims]);
  if (!me || !myTeamId) return prompt;
  const names = (workspace?.scenario_names ?? {}) as Record<string, string>;
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = playerById[pid];
    if (!p) return toast.error("Choose a player");
    const tid = team || myTeamId;
    const cur = results[scen].byId[tid];
    const ok = cellAllowed(results[scen].rules, cur.rules.cellCounts, cellOf(p), cur.rules.size);
    if (!ok.ok) toast.warning(`Simulated anyway: ${ok.reason}`);
    await addSim({ scenario: scen, player_id: pid, team_id: tid, price: Number(price || p.base_price) });
    setPid(""); setPrice("");
  };
  const list = sims.filter((s) => s.scenario === scen);
  const loadPreset = async (kind: PresetKind) => {
    const pre = presetScenario(analysis, myTeamId, kind);
    if (!pre.picks.length) return toast.info(pre.note);
    if (list.length && !confirm(`Replace the ${list.length} purchase(s) in this scenario?`)) return;
    await clearSims(scen);
    for (const p of pre.picks) await addSim({ scenario: scen, player_id: p.player.id, team_id: myTeamId, price: p.price });
    toast.success(`${PRESET_LABEL[kind]}: ${pre.picks.length} player(s). ${pre.note}`);
  };
  const r = results[scen];
  const mine = r.byId[myTeamId];
  const rank = (a: EventAnalysis) => a.leaderboard.find((x) => x.teamId === myTeamId)?.officialRank;
  const sensible = (a: EventAnalysis) => {
    const t = a.byId[myTeamId];
    return t.purseSufficient && !t.rules.hasViolation && t.rules.feasible;
  };
  return (
    <div className="space-y-4">
      <PageHeader title="What-if simulator" description="Private hypothetical purchases. Nothing here touches the official auction." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Build a scenario" action={<Button variant="ghost" size="sm" onClick={() => clearSims(scen)} disabled={!list.length}><RotateCcw size={13} /> Reset {scen}</Button>} />
          <CardBody>
            <Tabs value={scen} onChange={setScen} tabs={SCEN.map((s) => ({ value: s, label: `${names[s] ?? `Strategy ${s}`} (${sims.filter((x) => x.scenario === s).length})` }))} />
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="self-center text-xs text-faint">Auto-build:</span>
              {(Object.keys(PRESET_LABEL) as PresetKind[]).map((k) => <Button key={k} type="button" size="sm" variant="outline" onClick={() => loadPreset(k)}>{PRESET_LABEL[k]}</Button>)}
            </div>
            <form onSubmit={add} className="mt-3 grid gap-2 md:grid-cols-[1fr_110px_160px_auto]">
              <PlayerPicker value={pid} onChange={(id) => { setPid(id); setPrice(String(playerById[id]?.base_price ?? "")); }} filter={(p) => !list.some((s) => s.player_id === p.id)} />
              <Input type="number" step="0.05" min="0" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
              <Select value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="">My team</option>
                {teams.filter((t) => t.id !== myTeamId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              <Button>Add</Button>
            </form>
            <ul className="mt-3 divide-y divide-line/40">
              {list.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <span className="truncate">{playerById[s.player_id]?.name} <span className="text-xs text-faint">{fmtRating(playerById[s.player_id]?.overall)}</span></span>
                  <span className="flex items-center gap-3 tabular"><Badge>{s.team_id === myTeamId ? "My team" : teams.find((t) => t.id === s.team_id)?.short_name ?? "—"}</Badge>{m(s.price)}<button onClick={() => removeSim(s.id)} className="text-faint hover:text-danger cursor-pointer" aria-label="Remove"><Trash2 size={13} /></button></span>
                </li>
              ))}
              {!list.length && <li className="py-4 text-center text-xs text-muted">Add hypothetical purchases to see their effect.</li>}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={`Result: ${names[scen] ?? scen}`} action={<SquadStatusBadge status={mine.rules.status} />} />
          <CardBody className="space-y-1 text-sm">
            {[
              ["Team average", `${fmtRating(analysis.byId[myTeamId].rating.average)} → ${fmtRating(mine.rating.average)}`],
              ["Total rating", `${fmtRating(analysis.byId[myTeamId].rating.total)} → ${fmtRating(mine.rating.total)}`],
              ["Remaining purse", `${m(analysis.byId[myTeamId].remaining)} → ${m(mine.remaining)}`],
              ["Free budget", m(mine.discretionary)],
              ["Requirements left", `${mine.rules.slotsRequired} player(s)`],
              ["Leaderboard position", `#${rank(analysis)} → #${rank(r)}`],
            ].map(([k, v]) => <div key={k} className="flex justify-between gap-2"><span className="text-muted">{k}</span><span className="tabular font-medium">{v}</span></div>)}
            <div className={cn("mt-2 rounded-md p-2 text-xs", sensible(r) ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger")}>
              {sensible(r) ? "Financially sensible: squad remains completable within budget and rules." : "Not sensible: this plan breaks a rule or leaves too little purse for mandatory players."}
            </div>
            <div className="pt-2"><RuleAlerts alerts={mine.rules.alerts} compact hideInfo /></div>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Updated squad composition" />
        <CardBody><CompositionGrid team={mine} /></CardBody>
      </Card>
      <Card>
        <CardHeader title="Compare strategies" />
        <CardBody className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead><tr className="text-[11px] uppercase text-faint"><th className="text-left">Metric</th><th className="text-right">Official now</th>{SCEN.map((s) => <th key={s} className="text-right">{names[s] ?? s}</th>)}</tr></thead>
            <tbody>
              {([
                ["Average rating", (a: EventAnalysis) => fmtRating(a.byId[myTeamId].rating.average)],
                ["Projected final", (a: EventAnalysis) => fmtRating(a.byId[myTeamId].projectedAverage)],
                ["Remaining purse", (a: EventAnalysis) => m(a.byId[myTeamId].remaining)],
                ["Free budget", (a: EventAnalysis) => m(a.byId[myTeamId].discretionary)],
                ["Players", (a: EventAnalysis) => String(a.byId[myTeamId].rating.count)],
                ["Requirements left", (a: EventAnalysis) => String(a.byId[myTeamId].rules.slotsRequired)],
                ["Balance", (a: EventAnalysis) => a.byId[myTeamId].rating.balance.toFixed(0)],
                ["Leaderboard #", (a: EventAnalysis) => `#${rank(a)}`],
                ["Sensible?", (a: EventAnalysis) => (sensible(a) ? "Yes" : "No")],
              ] as const).map(([label, f]) => (
                <tr key={label} className="border-t border-line/40"><td className="py-1.5 text-muted">{label}</td><td className="text-right">{f(analysis)}</td>{SCEN.map((s) => <td key={s} className="text-right font-medium">{f(results[s])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
