"use client";
import { useMemo, useState } from "react";
import { Star, StickyNote } from "lucide-react";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  ORIGINS,
  cellLabel,
  cellOf,
  fmtMoney,
  fmtRating,
  smartBid,
  STRATEGY_PARAMS,
  type Player,
  type RosterEntry,
  type Strategy,
  type TeamAnalysis,
} from "@/lib/engine";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";
import { AuctionStatusBadge, CategoryBadge, SourceBadge } from "@/components/domain/badges";
import { PlayerAvatar, TeamChip } from "@/components/domain/team";
import { DataTable, type Column } from "@/components/ui/table";
import { Badge, Dialog, Tabs } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";

export function useMoney() {
  const { rules } = useEventData();
  return (n: number | null | undefined) => fmtMoney(n, rules.currency);
}

export function PlayerName({ p, sub }: { p: Player; sub?: boolean }) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <PlayerAvatar name={p.name} url={p.photo_url} size={24} />
      <span className="min-w-0">
        <span className="block truncate font-medium">{p.name}</span>
        {sub && <span className="block truncate text-[11px] text-faint">{[p.nationality, p.batting_style, p.bowling_style].filter(Boolean).join(" · ") || "—"}</span>}
      </span>
    </span>
  );
}

export function RosterTable({ team, onPlayer }: { team: TeamAnalysis; onPlayer?: (p: Player) => void }) {
  const m = useMoney();
  const cols: Column<RosterEntry>[] = [
    { key: "name", header: "Player", cell: (e) => <PlayerName p={e.player} />, sort: (e) => e.player.name },
    { key: "cat", header: "Role", cell: (e) => <CategoryBadge category={e.player.category} origin={e.player.origin} />, sort: (e) => `${e.player.category ?? "~"}${e.player.origin ?? ""}` },
    { key: "ovr", header: "Rating", align: "right", cell: (e) => <b>{fmtRating(e.player.overall)}</b>, sort: (e) => e.player.overall },
    { key: "bat", header: "Bat", align: "right", cell: (e) => fmtRating(e.player.batting), sort: (e) => e.player.batting ?? null },
    { key: "bowl", header: "Bowl", align: "right", cell: (e) => fmtRating(e.player.bowling), sort: (e) => e.player.bowling ?? null },
    { key: "fld", header: "Field", align: "right", cell: (e) => fmtRating(e.player.fielding), sort: (e) => e.player.fielding ?? null },
    { key: "price", header: "Price", align: "right", cell: (e) => m(e.price), sort: (e) => e.price },
    { key: "src", header: "Source", cell: (e) => <SourceBadge source={e.source} /> },
  ];
  return <DataTable rows={team.entries} columns={cols} rowKey={(e) => e.player.id} initialSort={{ key: "ovr", dir: "desc" }} onRowClick={onPlayer ? (e) => onPlayer(e.player) : undefined} empty="No players purchased yet." dense />;
}

/** 8-cell composition matrix (Indian / overseas × role). */
export function CompositionGrid({ team }: { team: TeamAnalysis }) {
  const need = new Map<string, number>();
  team.rules.mandatoryPlan.forEach((c) => need.set(c, (need.get(c) ?? 0) + 1));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-faint">
            <th className="px-2 py-1 text-left font-medium" />
            {CATEGORIES.map((c) => <th key={c} className="px-2 py-1 text-right font-medium">{CATEGORY_LABEL[c]}</th>)}
            <th className="px-2 py-1 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {ORIGINS.map((o) => (
            <tr key={o} className="border-t border-line/50">
              <td className="px-2 py-1.5 text-xs text-muted">{o === "indian" ? "Indian" : "Overseas"}</td>
              {CATEGORIES.map((c) => {
                const k = `${o}:${c}` as const;
                const n = need.get(k) ?? 0;
                return (
                  <td key={c} className="px-2 py-1.5 text-right">
                    <span className="font-semibold">{team.rules.cellCounts[k]}</span>
                    {n > 0 && <span className="ml-1 text-[11px] text-warn">+{n}</span>}
                  </td>
                );
              })}
              <td className="px-2 py-1.5 text-right font-semibold">{o === "indian" ? team.indianCount : team.overseasCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-faint"><span className="text-warn">+n</span> = still required by the event rules{team.rules.flexSlots ? ` · plus ${team.rules.flexSlots} slot(s) of any role to reach the minimum squad` : ""}.</p>
    </div>
  );
}

export function ConstraintList({ team }: { team: TeamAnalysis }) {
  if (!team.rules.statuses.length) return <p className="text-xs text-muted">No category constraints for this event.</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {team.rules.statuses.map((s) => (
        <li key={s.constraint.id} className="flex items-center justify-between gap-2">
          <span className="truncate">{s.constraint.label}</span>
          <span className="flex items-center gap-2 tabular">
            <span className="text-xs text-faint">
              {s.constraint.min !== null && s.constraint.max !== null
                ? s.constraint.min === s.constraint.max ? `exactly ${s.constraint.min}` : `${s.constraint.min}–${s.constraint.max}`
                : s.constraint.min !== null ? `≥ ${s.constraint.min}` : `≤ ${s.constraint.max}`}
            </span>
            <Badge tone={s.state === "violation" ? "danger" : s.state === "incomplete" ? "warn" : "ok"}>{s.count}</Badge>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Player detail with private shortlist + note actions. */
export function PlayerDialog({ player, onClose }: { player: Player | null; onClose: () => void }) {
  const { teamName, rules } = useEventData();
  const { shortlist, upsertShortlist, removeShortlist, notes, saveNote } = useWorkspace();
  const m = useMoney();
  const [note, setNote] = useState("");
  if (!player) return null;
  const sl = shortlist.find((s) => s.player_id === player.id);
  const pnotes = notes.filter((n) => n.player_id === player.id);
  const r = (label: string, v: number | null | undefined) => (
    <div className="rounded-md bg-surface-2 p-2"><div className="text-[10px] uppercase text-faint">{label}</div><div className="tabular font-semibold">{fmtRating(v)}</div></div>
  );
  return (
    <Dialog open onClose={onClose} title={player.name} wide>
      <div className="flex flex-wrap items-center gap-2">
        <PlayerAvatar name={player.name} url={player.photo_url} size={44} />
        <CategoryBadge category={player.category} origin={player.origin} />
        {player.secondary_category && <Badge>also {CATEGORY_LABEL[player.secondary_category]}</Badge>}
        <AuctionStatusBadge status={player.auction_status} />
        {player.auction_status === "sold" && <Badge tone="info">{teamName(player.sold_team_id)} · {m(player.sold_price)}</Badge>}
        <span className="ml-auto text-sm">Base <b>{m(player.base_price)}</b></span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-7">
        {r("Overall", player.overall)}{r("Batting", player.batting)}{r("Bowling", player.bowling)}{r("Fielding", player.fielding)}{r("Keeping", player.wicketkeeping)}{r("Consistency", player.consistency)}{r("Experience", player.experience)}
      </div>
      <div className="mt-2 text-xs text-muted">
        {[player.nationality, player.batting_style, player.bowling_style].filter(Boolean).join(" · ")}
        {player.special_abilities?.length ? ` · ${player.special_abilities.join(", ")}` : ""}
        <span className="ml-2 text-faint">Ratings source: {player.rating_source ?? "not rated"} (scale {rules.rating_scale_max})</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
        <span className="text-xs text-faint">Private shortlist:</span>
        {(["target", "backup", "avoid"] as const).map((l) => (
          <Button key={l} size="sm" variant={sl?.list === l ? "default" : "outline"} onClick={() => upsertShortlist(player.id, l)}>
            <Star size={12} /> {l}
          </Button>
        ))}
        {sl && <Button size="sm" variant="ghost" onClick={() => removeShortlist(player.id)}>Remove</Button>}
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center gap-1 text-xs text-faint"><StickyNote size={12} /> Private notes</div>
        {pnotes.map((n) => <p key={n.id} className="mb-1 rounded bg-surface-2 p-2 text-xs">{n.body}</p>)}
        <div className="flex gap-2">
          <Textarea className="min-h-10" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only you can see this…" />
          <Button size="sm" variant="secondary" disabled={!note.trim()} onClick={async () => { await saveNote({ body: note.trim(), player_id: player.id }); setNote(""); }}>Add</Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Smart Bid panel: works on any player, with strategy toggle and full explanation. */
export function SmartBidPanel({ player, compact, analysis }: { player: Player | null; compact?: boolean; analysis?: import("@/lib/engine").EventAnalysis }) {
  const { myTeamId, rules } = useEventData();
  const { intel: base, strategy: saved, setStrategy } = useWorkspace();
  const intel = analysis ?? base;
  const [strategy, setLocal] = useState<Strategy>(saved);
  const m = useMoney();
  const res = useMemo(() => (player && myTeamId && intel.byId[myTeamId] ? smartBid(intel, myTeamId, player, strategy) : null), [player, myTeamId, intel, strategy]);
  if (!player) return <p className="text-sm text-muted">Select a player to calculate a bid ceiling.</p>;
  if (!res) return <p className="text-sm text-muted">Select your team first.</p>;
  if (player.auction_status === "sold") return <p className="text-sm text-muted">{player.name} has already been sold.</p>;
  const row = (k: string, v: React.ReactNode, cls?: string) => (
    <div className="flex justify-between gap-2 py-1 text-sm"><span className="text-muted">{k}</span><span className={cn("tabular font-medium", cls)}>{v}</span></div>
  );
  return (
    <div>
      <Tabs
        value={strategy}
        onChange={(s) => { setLocal(s); void setStrategy(s); }}
        tabs={(Object.keys(STRATEGY_PARAMS) as Strategy[]).map((s) => ({ value: s, label: STRATEGY_PARAMS[s].label }))}
      />
      <div className={cn("mt-3 rounded-lg border p-3", res.eligible ? "border-accent/40 bg-accent/5" : "border-danger/40 bg-danger/5")}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-faint">Suggested bid ({STRATEGY_PARAMS[strategy].label.toLowerCase()})</div>
            <div className={cn("tabular text-3xl font-semibold", res.eligible ? "text-accent" : "text-danger")}>{res.eligible ? m(res.maxBid) : "Do not bid"}</div>
          </div>
          {res.eligible && (
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wide text-faint">Maximum safe bid</div>
              <div className="tabular text-lg font-semibold">{m(res.maxSafeBid)}</div>
            </div>
          )}
          {res.eligible && <Badge tone={res.risk === "low" ? "ok" : res.risk === "medium" ? "warn" : "danger"}>Financial risk: {res.risk}</Badge>}
        </div>
        {res.blockedReason && <div className="text-xs text-danger">{res.blockedReason}</div>}
        {res.winnable !== null && res.eligible && (
          <div className="mt-1 text-xs text-muted">
            Estimated price to win ≈ {m(res.estimatedPriceToWin)} · <span className={res.winnable ? "text-ok" : "text-warn"}>{res.winnable ? "within your ceiling" : "likely above your ceiling"}</span>
          </div>
        )}
      </div>
      {res.blockedReason ? (
        <p className="mt-3 text-xs text-muted">This player cannot join your squad under the event rules, so no bid is recommended. Current team rating {fmtRating(res.currentAverage)}.</p>
      ) : (
      <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
        <div>
          {row("Current team rating", fmtRating(res.currentAverage))}
          {row("Rating after purchase", fmtRating(res.projectedAverage), "text-accent")}
          {row("Rating change", res.ratingDelta === null ? "—" : `${res.ratingDelta >= 0 ? "+" : ""}${res.ratingDelta.toFixed(2)}`, (res.ratingDelta ?? 0) >= 0 ? "text-ok" : "text-danger")}
          {row("Projected final (before → after)", `${fmtRating(res.currentProjectedFinal)} → ${fmtRating(res.projectedFinalAfter)}`)}
          {row("Leaderboard (now → after)", `#${res.leaderboardBefore ?? "—"} → #${res.leaderboardAfter ?? "—"}`)}
        </div>
        <div>
          {row("Remaining purse", m(res.remainingPurse))}
          {row("Purse after (at suggested bid)", m(res.purseAfter))}
          {row("Mandatory reserve after", m(res.minimumReserve))}
          {row(`${STRATEGY_PARAMS[strategy].label} reserve`, m(res.strategyReserve))}
          {row("Discretionary budget", m(res.discretionary), res.discretionary < 0 ? "text-danger" : "")}
          {row("Requirements left after", `${res.remainingRequirementsAfter} player(s)`)}
          {row("Expected value", res.expectedValue === null ? "—" : `${res.expectedValue.toFixed(2)} rating / ${rules.currency}`)}
        </div>
      </div>
      )}
      {res.limitations.length > 0 && (
        <ul className="mt-2 space-y-0.5 rounded-md border border-warn/30 bg-warn/5 p-2 text-[11px] text-warn">
          {res.limitations.map((l) => <li key={l}>⚠ {l}</li>)}
        </ul>
      )}
      {!compact && (
        <>
          <div className="mt-3">
            <div className="mb-1 text-xs font-medium text-faint">Why this number</div>
            <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted">{res.reasoning.map((r, i) => <li key={i}>{r}</li>)}</ol>
          </div>
          <div className="mt-3">
            <div className="mb-1 text-xs font-medium text-faint">Competitor demand ({res.competitorDemand.length} able to bid)</div>
            <div className="flex flex-wrap gap-1.5">
              {res.competitorDemand.slice(0, 12).map((d) => (
                <Badge key={d.teamId} tone={d.needsCell ? "warn" : "neutral"}>{d.teamName}: ~{m(d.likelyCeiling)}{d.needsCell ? " · needs" : ""}</Badge>
              ))}
              {!res.competitorDemand.length && <span className="text-xs text-muted">No competitor can currently afford this player.</span>}
            </div>
          </div>
          <p className="mt-3 text-[11px] text-faint">{STRATEGY_PARAMS[strategy].description} Recommendations are analytical estimates — never a guarantee.</p>
        </>
      )}
    </div>
  );
}

export function PlayerPicker({ value, onChange, filter }: { value: string; onChange: (id: string) => void; filter?: (p: Player) => boolean }) {
  const { players } = useEventData();
  const list = players.filter((p) => p.auction_status !== "sold" && (filter ? filter(p) : true)).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select a player…</option>
      {list.map((p) => (
        <option key={p.id} value={p.id}>{p.name} · {cellLabel(cellOf(p))} · {fmtRating(p.overall)} · base {p.base_price}</option>
      ))}
    </Select>
  );
}

export const TeamCell = ({ t }: { t: TeamAnalysis }) => <TeamChip team={t.team} />;
