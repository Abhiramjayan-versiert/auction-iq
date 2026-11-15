"use client";
import { useMemo, useState } from "react";
import { Dice5 } from "lucide-react";
import { cellLabel, fmtPct, fmtRating, FLOOR_SOURCE_LABEL, hypotheticalPlayer, leaderHunter, purchaseRegret, ratingOptimizer, runMonteCarlo, type MonteCarloResult } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Badge, PageHeader, Spinner } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { TeamChip } from "@/components/domain/team";
import { useMoney } from "@/components/participant/shared";
import { useMyTeam } from "@/components/participant/NeedTeam";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function Lab() {
  const { me, prompt } = useMyTeam();
  const { players, rules, myTeamId } = useEventData();
  const { intel } = useWorkspace();
  const m = useMoney();
  const [runs, setRuns] = useState(2000);
  const [mc, setMc] = useState<MonteCarloResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [reg, setReg] = useState({ pid: "", rating: "", price: "" });
  const hunt = useMemo(() => (me ? leaderHunter(intel, me.team.id) : null), [intel, me]);
  const opt = useMemo(() => (me ? ratingOptimizer(intel, me.team.id) : null), [intel, me]);
  const regret = useMemo(() => {
    if (!me || !reg.price) return null;
    const p = reg.pid ? players.find((x) => x.id === reg.pid) : hypotheticalPlayer({ rating: reg.rating ? Number(reg.rating) : null });
    return p ? purchaseRegret(intel, me.team.id, p, Number(reg.price)) : null;
  }, [me, reg, players, intel]);
  if (!me || !myTeamId) return prompt;
  const simulate = () => {
    setBusy(true);
    setTimeout(() => {
      setMc(runMonteCarlo(intel, { runs, seed: Date.now() % 100000 }));
      setBusy(false);
    }, 20);
  };
  const mine = mc?.teams.find((t) => t.teamId === myTeamId);
  return (
    <div className="space-y-4">
      <PageHeader title="Strategy lab" description="Advanced, transparent simulations. Every number is an estimate with its assumptions shown." />

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Dice5 size={15} className="text-accent" /> Monte Carlo auction simulator</span>} description="Plays out the rest of the auction thousands of times" action={
          <div className="flex items-center gap-2">
            <Select className="h-8 w-28 text-xs" value={runs} onChange={(e) => setRuns(Number(e.target.value))}>{[500, 1000, 2000, 5000].map((n) => <option key={n} value={n}>{n} runs</option>)}</Select>
            <Button size="sm" onClick={simulate} disabled={busy}>{busy ? <Spinner /> : "Run"}</Button>
          </div>
        } />
        <CardBody>
          {!mc ? <p className="text-sm text-muted">Run the simulation to estimate each team&apos;s chance of finishing first and of completing a valid squad.</p> : (
            <div className="space-y-3">
              {mine && (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <div className="rounded-lg bg-surface-2 p-3"><div className="text-[11px] uppercase text-faint">Your chance of 1st</div><div className="tabular text-2xl font-semibold text-accent">{fmtPct(mine.pFirst, 1)}</div></div>
                  <div className="rounded-lg bg-surface-2 p-3"><div className="text-[11px] uppercase text-faint">Valid squad</div><div className="tabular text-2xl font-semibold">{fmtPct(mine.pValid, 0)}</div></div>
                  <div className="rounded-lg bg-surface-2 p-3"><div className="text-[11px] uppercase text-faint">Expected final</div><div className="tabular text-2xl font-semibold">{fmtRating(mine.expectedFinal)}</div><div className="text-[11px] text-muted">80% range {fmtRating(mine.p10)}–{fmtRating(mine.p90)}</div></div>
                  <div className="rounded-lg bg-surface-2 p-3"><div className="text-[11px] uppercase text-faint">Most likely rank</div><div className="tabular text-2xl font-semibold">#{mine.rankHistogram.indexOf(Math.max(...mine.rankHistogram)) + 1}</div></div>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular">
                  <thead><tr className="text-left text-[11px] uppercase text-faint"><th>Team</th><th className="text-right">P(1st)</th><th className="text-right">P(valid)</th><th className="text-right">Expected</th><th className="text-right">Top-3</th></tr></thead>
                  <tbody>{[...mc.teams].sort((a, b) => b.pFirst - a.pFirst).map((t) => (
                    <tr key={t.teamId} className={`border-t border-line/40 ${t.teamId === myTeamId ? "bg-accent/5" : ""}`}>
                      <td className="py-1"><TeamChip team={intel.byId[t.teamId].team} /></td>
                      <td className="text-right font-semibold">{fmtPct(t.pFirst, 1)}</td>
                      <td className="text-right">{fmtPct(t.pValid)}</td>
                      <td className="text-right">{fmtRating(t.expectedFinal)}</td>
                      <td className="text-right">{fmtPct(t.rankHistogram.slice(0, 3).reduce((s, x) => s + x, 0))}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="grid gap-3 text-xs md:grid-cols-2">
                <div><div className="mb-1 font-medium text-faint">Assumptions ({mc.runs} runs · reliability {mc.reliability})</div><ul className="list-disc space-y-0.5 pl-4 text-muted">{mc.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></div>
                {mc.limitations.length > 0 && <div><div className="mb-1 font-medium text-warn">Data limitations</div><ul className="list-disc space-y-0.5 pl-4 text-warn">{mc.limitations.map((a) => <li key={a}>{a}</li>)}</ul></div>}
              </div>
              <p className="text-[11px] text-faint">Probabilities describe simulated outcomes, not a promise — no team is guaranteed to win.</p>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Leader Hunter" description={`Official formula: ${rules.ranking_formula}`} />
          <CardBody className="space-y-2 text-sm">
            {hunt && hunt.status !== "no-data" ? (
              <>
                <p>{hunt.message}</p>
                {hunt.status === "chasing" && hunt.plans.length > 0 && <div className="flex flex-wrap gap-1">{hunt.plans.slice(0, 5).map((p) => <Badge key={p.players}>{p.players} player(s) ≥ {p.requiredAvg}</Badge>)}</div>}
                {hunt.status === "chasing" && hunt.candidates.length > 0 && <p className="text-xs text-muted">Recorded unsold candidates: {hunt.candidates.map((p) => `${p.name} (${p.overall})`).join(", ")}</p>}
                <div className="text-xs"><div className="text-faint">Teams closest to the leader</div>{hunt.chasers.map((c) => <div key={c.team.team.id} className="flex justify-between"><span>{c.team.team.name}</span><span className="tabular">−{c.gap}</span></div>)}</div>
              </>
            ) : <p className="text-muted">No ratings recorded yet.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Minimum squad completion cost" description="Cheapest combination of distinct players satisfying every rule" />
          <CardBody className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted">Players still required</span><b>{me.rules.slotsRequired}</b></div>
            <div className="flex justify-between"><span className="text-muted">Minimum estimated cost</span><b className="tabular">{m(me.floorReserve)}</b></div>
            <div className="flex justify-between"><span className="text-muted">Your purse</span><b className="tabular">{me.purseKnown ? m(me.remaining) : "not set"}</b></div>
            <div className="text-xs text-muted">Slots: {me.completion.slots.map((s) => (s === "ANY" ? "any role" : cellLabel(s))).join(", ") || "none"}</div>
            <div className="text-xs text-faint">Prices: {FLOOR_SOURCE_LABEL[intel.market.floorSource]}.</div>
            {me.completion.provisional && <p className="text-xs text-warn">Provisional — not enough unsold players recorded to price every slot.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Rating improvement optimiser" />
          <CardBody className="space-y-1 text-sm">
            <div className="text-xs text-muted">Current average {fmtRating(opt?.current ?? null)}</div>
            {opt?.singles.map((s) => <div key={s.players[0].id} className="flex justify-between"><span>{s.players[0].name} <span className="text-xs text-faint">{s.players[0].overall}</span></span><span className="tabular">→ {fmtRating(s.avg)} · ~{m(s.cost)}</span></div>)}
            {opt?.pairs.map((p) => <div key={p.players.map((x) => x.id).join()} className="flex justify-between text-xs"><span>{p.players.map((x) => x.name).join(" + ")}</span><span className="tabular">→ {fmtRating(p.avg)} · ~{m(p.cost)}</span></div>)}
            <p className="text-[11px] text-faint">{opt?.note}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Purchase regret simulator" description="What does an expensive buy do to the rest of your auction?" />
          <CardBody className="space-y-2 text-sm">
            <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2">
              <Select className="col-span-3 min-w-0" value={reg.pid} onChange={(e) => setReg({ ...reg, pid: e.target.value })}>
                <option value="">Hypothetical player (enter rating)</option>
                {players.filter((p) => p.auction_status !== "sold").map((p) => <option key={p.id} value={p.id}>{p.name} · {fmtRating(p.overall)}</option>)}
              </Select>
              {!reg.pid && <Input type="number" step="0.01" placeholder="Rating" value={reg.rating} onChange={(e) => setReg({ ...reg, rating: e.target.value })} />}
              <Input className={reg.pid ? "col-span-3" : "col-span-2"} type="number" step="any" placeholder="Price you might pay" value={reg.price} onChange={(e) => setReg({ ...reg, price: e.target.value })} />
            </div>
            {regret && (
              <div className="space-y-1 text-xs">
                {!regret.allowed.ok && <p className="text-danger">{regret.allowed.reason}</p>}
                <div className="flex justify-between"><span className="text-muted">Average rating</span><span className="tabular">{fmtRating(regret.before.rating.average)} → {fmtRating(regret.after.rating.average)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Purse left</span><span className="tabular">{m(regret.before.remaining)} → {m(regret.after.remaining)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Biggest next bid you could make</span><span className="tabular">{m(regret.nextBidBefore)} → {m(regret.nextBidAfter)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Money per remaining required slot</span><span className="tabular">{m(regret.perSlotAfter)}</span></div>
                <div className={regret.completionPossible ? "text-ok" : "text-danger"}>{regret.completionPossible ? "You could still complete a valid squad." : "You could NOT complete a valid squad after this purchase."}</div>
                {regret.flexibilityLoss !== null && <div className="text-muted">Future bidding flexibility drops by {fmtPct(regret.flexibilityLoss)}.</div>}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
