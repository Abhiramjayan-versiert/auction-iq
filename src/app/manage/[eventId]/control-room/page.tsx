"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, CheckCircle2, Megaphone, Pause, Play, RotateCcw, Square, Undo2 } from "lucide-react";
import { cellAllowed, cellOf, fmtMoney, fmtRating, round2 } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge, Dialog, Tabs } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { AuctionStatusBadge, CategoryBadge } from "@/components/domain/badges";
import { PlayerAvatar, TeamChip } from "@/components/domain/team";
import { useEventData } from "@/hooks/useEventData";
import { rpc } from "@/lib/data/rpc";
import type { TransactionRow } from "@/lib/types/db";
import { cn, fmtTime } from "@/lib/utils";

type Queue = "upcoming" | "unsold" | "all";

export default function ControlRoom() {
  const { event, session, players, playerById, analysis, transactions, teams, teamName, rules, reload } = useEventData();
  const m = (n: number | null | undefined) => fmtMoney(n, rules.currency);
  const eid = event!.id;
  const [q, setQ] = useState("");
  const [queue, setQueue] = useState<Queue>("upcoming");
  const [teamId, setTeamId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [fix, setFix] = useState<TransactionRow | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const current = session?.current_player_id ? playerById[session.current_player_id] : null;

  useEffect(() => {
    setTeamId("");
    setAmount(current ? String(current.base_price) : "");
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const s = q.toLowerCase();
    return players
      .filter((p) => (queue === "all" ? true : queue === "unsold" ? p.auction_status === "unsold" : p.auction_status === "upcoming" || p.auction_status === "available"))
      .filter((p) => !s || p.name.toLowerCase().includes(s));
  }, [players, q, queue]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await reload();
    } finally {
      setBusy(false);
    }
  };
  const status = session?.status ?? "not_started";
  const setStatus = (s: string) => run(() => rpc("set_session_status", { p_event: eid, p_status: s }, `Auction ${s.replace("_", " ")}`));
  const pick = (id: string) => run(() => rpc("set_current_player", { p_event: eid, p_player: id, p_open: true }));

  // Client-side pre-validation (the database re-validates atomically).
  const t = teamId ? analysis.byId[teamId] : null;
  const amt = Number(amount);
  const warnings: string[] = [];
  if (current && t) {
    if (amt < current.base_price) warnings.push(`Below base price ${m(current.base_price)}.`);
    if (!rules.allow_overspend && amt > t.remaining) warnings.push(`Exceeds ${t.team.name}'s remaining purse ${m(t.remaining)}.`);
    const allowed = cellAllowed(rules, t.rules.cellCounts, cellOf(current));
    if (!allowed.ok) warnings.push(allowed.reason!);
    else if (amt > t.remaining - (t.floorReserve - (t.rules.mandatoryPlan.includes(cellOf(current)) ? analysis.market.floorPrice[cellOf(current)] : 0)) + 1e-9)
      warnings.push(`After this, ${t.team.name} may not afford its remaining mandatory players.`);
  }
  const blocking = warnings.filter((w) => !w.startsWith("After this"));
  const sell = () =>
    current && teamId && amount &&
    run(async () => {
      const ok = await rpc("record_sale", { p_event: eid, p_player: current.id, p_team: teamId, p_amount: amt }, `${current.name} sold to ${teamName(teamId)} for ${m(amt)}`);
      if (ok) setQ("");
    });
  const unsold = () => current && run(() => rpc("mark_unsold", { p_event: eid, p_player: current.id }, `${current.name} marked unsold`));
  const undo = () => confirm("Undo the latest official transaction?") && run(() => rpc("undo_last_transaction", { p_event: eid }, "Latest transaction undone"));
  const bump = (inc: number) => setAmount(String(round2((Number(amount) || current?.base_price || 0) + inc)));
  const publishBid = () => current && run(() => rpc("publish_bid", { p_event: eid, p_amount: amt || null, p_team: teamId || null }, "Running bid published"));

  const recent = transactions.slice(0, 15);
  const sold = players.filter((p) => p.auction_status === "sold").length;

  return (
    <div className="space-y-4">
      {/* Session bar */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <span className="text-sm">Session: <b className={cn(status === "live" && "text-accent", status === "paused" && "text-warn")}>{status.replace("_", " ")}</b></span>
        <span className="text-xs text-muted">{sold}/{players.length} sold</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {status !== "live" && status !== "completed" && <Button size="sm" onClick={() => setStatus("live")} disabled={busy}><Play size={14} /> {status === "paused" ? "Resume" : "Start auction"}</Button>}
          {status === "live" && <Button size="sm" variant="secondary" onClick={() => setStatus("paused")} disabled={busy}><Pause size={14} /> Pause</Button>}
          {status === "completed" && <Button size="sm" variant="secondary" onClick={() => setStatus("paused")} disabled={busy}><RotateCcw size={14} /> Reopen</Button>}
          <Button size="sm" variant="outline" onClick={undo} disabled={busy || !transactions.some((x) => x.status === "active")}><Undo2 size={14} /> Undo last</Button>
          {status !== "completed" && <Button size="sm" variant="danger" onClick={() => confirm("Complete the auction? The official leaderboard will be finalised.") && setStatus("completed")} disabled={busy}><Square size={14} /> Complete</Button>}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[320px_1fr_340px]">
        {/* Queue */}
        <Card>
          <CardHeader title="Player queue" />
          <CardBody className="space-y-2">
            <Tabs value={queue} onChange={setQueue} tabs={[{ value: "upcoming", label: "Upcoming" }, { value: "unsold", label: "Unsold" }, { value: "all", label: "All" }]} />
            <Input placeholder="Search player… (Enter selects first)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && list[0] && list[0].auction_status !== "sold" && pick(list[0].id)} />
            <ul className="max-h-[520px] divide-y divide-line/40 overflow-y-auto">
              {list.map((p) => (
                <li key={p.id}>
                  <button disabled={p.auction_status === "sold" || p.auction_status === "withdrawn" || busy} onClick={() => pick(p.id)}
                    className={cn("flex w-full items-center gap-2 px-1 py-1.5 text-left text-sm hover:bg-surface-2 disabled:opacity-40 cursor-pointer", current?.id === p.id && "bg-accent/10")}>
                    <span className="w-6 text-[10px] text-faint tabular">{p.lot_number ?? ""}</span>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="text-[10px] text-muted">{p.origin === "overseas" ? "OS" : "IN"} {p.category}</span>
                    <span className="tabular text-xs">{fmtRating(p.overall)}</span>
                  </button>
                </li>
              ))}
              {!list.length && <li className="py-6 text-center text-xs text-muted">No players in this queue.</li>}
            </ul>
          </CardBody>
        </Card>

        {/* Current + sale */}
        <Card>
          <CardHeader title="On the block" action={current && <AuctionStatusBadge status={current.auction_status} />} />
          <CardBody>
            {!current ? <p className="py-16 text-center text-sm text-muted">Select a player from the queue to start bidding.</p> : (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <PlayerAvatar name={current.name} url={current.photo_url} size={64} />
                  <div className="min-w-0">
                    <div className="text-2xl font-semibold">{current.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted"><CategoryBadge category={current.category} origin={current.origin} />{current.nationality} · rating <b className="text-accent">{fmtRating(current.overall)}</b> · base <b className="text-fg">{m(current.base_price)}</b></div>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Winning team">
                    <Select value={teamId} onChange={(e) => { setTeamId(e.target.value); amountRef.current?.focus(); }} autoFocus>
                      <option value="">Select team…</option>
                      {analysis.teams.map((x) => <option key={x.team.id} value={x.team.id}>{x.team.name} — {m(x.remaining)} left · {x.rating.count} players</option>)}
                    </Select>
                  </Field>
                  <Field label={`Final bid (${rules.currency})`}>
                    <Input ref={amountRef} type="number" step={rules.bid_increment || 0.05} min={current.base_price} value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && blocking.length === 0 && sell()} className="text-lg font-semibold tabular" />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[rules.bid_increment || 0.25, 0.5, 1, 2, 5].filter((v, i, a) => a.indexOf(v) === i).map((inc) => <Button key={inc} size="sm" variant="outline" onClick={() => bump(inc)}>+{inc}</Button>)}
                  <Button size="sm" variant="ghost" onClick={() => setAmount(String(current.base_price))}>Reset to base</Button>
                  <Button size="sm" variant="ghost" onClick={publishBid} disabled={busy}><Megaphone size={13} /> Publish running bid</Button>
                </div>
                {warnings.length > 0 && (
                  <ul className="space-y-1">{warnings.map((w) => <li key={w} className={cn("rounded-md border px-2 py-1 text-xs", blocking.includes(w) ? "border-danger/40 bg-danger/10 text-danger" : "border-warn/40 bg-warn/10 text-warn")}>{w}</li>)}</ul>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="lg" onClick={sell} disabled={busy || !teamId || !amount || blocking.length > 0 || status === "completed"}><CheckCircle2 size={16} /> Confirm sale</Button>
                  <Button size="lg" variant="secondary" onClick={unsold} disabled={busy || current.auction_status === "unsold"}><Ban size={16} /> Mark unsold</Button>
                  <Button size="lg" variant="ghost" onClick={() => run(() => rpc("set_current_player", { p_event: eid, p_player: null }))} disabled={busy}>Clear</Button>
                </div>
                <p className="text-[11px] text-faint">Enter the real result from the room. The sale is validated and recorded atomically: roster, purse, player status, ratings and rankings update for every participant instantly.</p>
              </div>
            )}
          </CardBody>
          <div className="border-t border-line/60 p-4">
            <div className="flex gap-2">
              <Input placeholder="Publish an announcement to all participants…" value={announce} onChange={(e) => setAnnounce(e.target.value)} />
              <Button variant="secondary" disabled={!announce.trim()} onClick={() => run(async () => { await rpc("publish_announcement", { p_event: eid, p_title: announce.trim(), p_body: null }, "Announcement published"); setAnnounce(""); })}><Megaphone size={14} /> Publish</Button>
            </div>
          </div>
        </Card>

        {/* Teams */}
        <Card>
          <CardHeader title="Official purses" description={`${teams.length} teams`} />
          <CardBody className="max-h-[640px] overflow-y-auto">
            <table className="w-full text-xs tabular">
              <thead><tr className="text-[10px] uppercase text-faint"><th className="text-left">Team</th><th className="text-right">Left</th><th className="text-right">Pl.</th><th className="text-right">Need</th></tr></thead>
              <tbody>
                {analysis.teams.map((x) => (
                  <tr key={x.team.id} className={cn("border-t border-line/40 cursor-pointer hover:bg-surface-2", teamId === x.team.id && "bg-accent/10")} onClick={() => setTeamId(x.team.id)}>
                    <td className="py-1"><TeamChip team={x.team} /></td>
                    <td className={cn("text-right font-semibold", !x.purseSufficient && "text-danger")}>{m(x.remaining)}</td>
                    <td className="text-right">{x.rating.count}</td>
                    <td className="text-right">{x.rules.slotsRequired}{x.rules.hasViolation && <Badge tone="danger" className="ml-1">!</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent transactions" description="Correct a wrong team or amount, or void an entry." />
        <CardBody className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead><tr className="text-left text-[11px] uppercase text-faint [&>th]:pr-4"><th>#</th><th>Time</th><th>Player</th><th>Result</th><th className="text-right">Amount</th><th className="pl-4">Status</th><th /></tr></thead>
            <tbody>
              {recent.map((x) => (
                <tr key={x.id} className={cn("border-t border-line/40", x.status === "voided" && "opacity-50")}>
                  <td className="py-1.5 text-faint">{x.seq}</td>
                  <td>{fmtTime(x.created_at)}</td>
                  <td>{playerById[x.player_id]?.name}</td>
                  <td>{x.type === "sale" ? teamName(x.team_id) : "Unsold"}</td>
                  <td className="text-right">{x.type === "sale" ? m(x.amount) : "—"}</td>
                  <td className="pl-4">{x.status === "active" ? <Badge tone="ok">active</Badge> : <Badge>{x.voided_reason ?? "voided"}</Badge>}</td>
                  <td className="text-right">
                    {x.status === "active" && (
                      <span className="flex justify-end gap-1">
                        {x.type === "sale" && <Button size="sm" variant="ghost" onClick={() => setFix(x)}>Correct</Button>}
                        <Button size="sm" variant="ghost" onClick={() => confirm("Void this transaction? The player returns to the pool.") && run(() => rpc("void_transaction", { p_tx: x.id, p_reason: "voided by auctioneer" }, "Transaction voided"))}>Void</Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!recent.length && <tr><td colSpan={7} className="py-6 text-center text-xs text-muted">No transactions yet.</td></tr>}
            </tbody>
          </table>
        </CardBody>
      </Card>
      {fix && <CorrectDialog tx={fix} onClose={() => setFix(null)} onDone={reload} />}
    </div>
  );
}

function CorrectDialog({ tx, onClose, onDone }: { tx: TransactionRow; onClose: () => void; onDone: () => Promise<void> }) {
  const { teams, playerById } = useEventData();
  const [team, setTeam] = useState(tx.team_id ?? "");
  const [amount, setAmount] = useState(String(tx.amount ?? ""));
  const [reason, setReason] = useState("");
  const save = async () => {
    const ok = await rpc("correct_sale", { p_tx: tx.id, p_team: team, p_amount: Number(amount), p_reason: reason || "correction" }, "Sale corrected");
    if (ok) {
      await onDone();
      onClose();
    }
  };
  return (
    <Dialog open onClose={onClose} title={`Correct sale: ${playerById[tx.player_id]?.name}`}>
      <div className="space-y-3">
        <Field label="Winning team"><Select value={team} onChange={(e) => setTeam(e.target.value)}>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Winning bid"><Input type="number" step="0.05" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Reason (audit log)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong team entered" /></Field>
        <p className="text-xs text-muted">The original transaction is voided and a corrected one recorded in a single atomic operation.</p>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save correction</Button></div>
      </div>
    </Dialog>
  );
}
