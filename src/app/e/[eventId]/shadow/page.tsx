"use client";
import { useMemo, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmtRating, shadowCompare } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Badge, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { SquadStatusBadge } from "@/components/domain/badges";
import { useMoney } from "@/components/participant/shared";
import { useMyTeam } from "@/components/participant/NeedTeam";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";

/** SHADOW AUCTION — a private parallel squad built from this event's player pool. */
export default function Shadow() {
  const { me, prompt } = useMyTeam();
  const { players, playerById, teamName } = useEventData();
  const { intel, sims, addSim, removeSim, clearSims } = useWorkspace();
  const m = useMoney();
  const [pid, setPid] = useState("");
  const [price, setPrice] = useState("");
  const picks = sims.filter((s) => s.scenario === "S");
  const res = useMemo(
    () => (me ? shadowCompare(intel, me.team.id, picks.filter((s) => playerById[s.player_id]).map((s) => ({ player: playerById[s.player_id], price: Number(s.price) }))) : null),
    [intel, me, picks, playerById],
  );
  if (!me || !res) return prompt;
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = playerById[pid];
    if (!p) return toast.error("Choose a player");
    await addSim({ scenario: "S", player_id: pid, team_id: me.team.id, price: Number(price || p.sold_price || p.base_price || 0) });
    setPid("");
    setPrice("");
  };
  const row = (k: string, a: string, s: string, d?: number | null) => (
    <tr className="border-t border-line/40"><td className="py-1.5 text-muted">{k}</td><td className="text-right">{a}</td><td className="text-right font-medium">{s}</td><td className={`text-right ${d === null || d === undefined ? "" : d >= 0 ? "text-ok" : "text-danger"}`}>{d === null || d === undefined ? "" : `${d >= 0 ? "+" : ""}${d}`}</td></tr>
  );
  return (
    <div className="space-y-4">
      <PageHeader title="Shadow auction" description="Build the squad you wish you had — from any player recorded in this event, at any price — and compare it with your real team. Completely private." actions={<Button variant="ghost" size="sm" onClick={() => clearSims("S")} disabled={!picks.length}><RotateCcw size={13} /> Reset</Button>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`Shadow squad (${picks.length})`} />
          <CardBody>
            <form onSubmit={add} className="grid gap-2 md:grid-cols-[1fr_120px_auto]">
              <Select value={pid} onChange={(e) => { setPid(e.target.value); const p = playerById[e.target.value]; setPrice(String(p?.sold_price ?? p?.base_price ?? "")); }}>
                <option value="">Any recorded player…</option>
                {players.filter((p) => !picks.some((s) => s.player_id === p.id)).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {fmtRating(p.overall)} · {p.auction_status === "sold" ? `sold ${p.sold_price} to ${teamName(p.sold_team_id)}` : p.auction_status}</option>
                ))}
              </Select>
              <Input type="number" step="any" min={0} placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
              <Button>Add</Button>
            </form>
            <ul className="mt-3 divide-y divide-line/40 text-sm">
              {picks.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="truncate">{playerById[s.player_id]?.name} <span className="text-xs text-faint">{fmtRating(playerById[s.player_id]?.overall)}</span></span>
                  <span className="flex items-center gap-3 tabular">{m(s.price)}<button onClick={() => removeSim(s.id)} className="text-faint hover:text-danger cursor-pointer" aria-label="Remove"><Trash2 size={13} /></button></span>
                </li>
              ))}
              {!picks.length && <li className="py-6 text-center text-xs text-muted">Add players to build your shadow squad.</li>}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Actual vs shadow" action={<SquadStatusBadge status={res.shadow.rules.status} />} />
          <CardBody>
            <table className="w-full text-sm tabular">
              <thead><tr className="text-[11px] uppercase text-faint"><th className="text-left">Metric</th><th className="text-right">Actual</th><th className="text-right">Shadow</th><th className="text-right">Δ</th></tr></thead>
              <tbody>
                {row("Players", String(res.actual.rating.count), String(res.shadow.rating.count))}
                {row("Average rating", fmtRating(res.actual.rating.average), fmtRating(res.shadow.rating.average), res.diff.average)}
                {row("Total rating", fmtRating(res.actual.rating.total), fmtRating(res.shadow.rating.total), res.diff.total)}
                {row("Spent", m(res.actual.spent), m(res.shadow.spent), res.diff.spent === null ? null : -res.diff.spent)}
                {row("Purse left", m(res.actual.remaining), m(res.shadow.remaining))}
                {row("Balance", res.actual.rating.balance.toFixed(0), res.shadow.rating.balance.toFixed(0), res.diff.balance)}
                {row("Batting", fmtRating(res.actual.rating.batting), fmtRating(res.shadow.rating.batting))}
                {row("Bowling", fmtRating(res.actual.rating.bowling), fmtRating(res.shadow.rating.bowling))}
                {row("Would rank", `#${res.actualRank}`, `#${res.shadowRank}`)}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Missed opportunities" description="Players other teams bought that beat your average rating at or below your average price" />
        <CardBody>
          {res.missed.length ? (
            <ul className="grid gap-1 text-sm md:grid-cols-2">
              {res.missed.map((e) => (
                <li key={e.player.id} className="flex justify-between gap-2 rounded-md bg-surface-2 px-2 py-1.5">
                  <span>{e.player.name} <Badge tone="accent">{fmtRating(e.player.overall)}</Badge></span>
                  <span className="tabular text-muted">{m(e.price)} · {e.team.short_name || e.team.name}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-muted">None so far.</p>}
        </CardBody>
      </Card>
    </div>
  );
}
