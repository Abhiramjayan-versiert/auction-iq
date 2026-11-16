"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Trophy } from "lucide-react";
import { fmtRating, type EventAnalysis } from "@/lib/engine";
import { Tabs } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useMoney } from "./shared";

type Sort = "rank" | "purse" | "maxbid";

/**
 * Live standings that physically re-order as results come in: rows slide to their new
 * position (FLIP animation) and show ▲/▼ for a few seconds after a team moves.
 */
export function LiveStandings({ a, myTeamId, compact, limit }: { a: EventAnalysis; myTeamId: string | null; compact?: boolean; limit?: number }) {
  const m = useMoney();
  const [sort, setSort] = useState<Sort>("rank");
  const rankOf = useMemo(() => Object.fromEntries(a.leaderboard.map((r) => [r.teamId, r.officialRank])), [a]);
  const rows = useMemo(() => {
    const list = [...a.teams];
    const num = (n: number) => (Number.isNaN(n) ? -Infinity : n);
    if (sort === "rank") list.sort((x, y) => rankOf[x.team.id] - rankOf[y.team.id]);
    if (sort === "purse") list.sort((x, y) => num(y.remaining) - num(x.remaining));
    if (sort === "maxbid") list.sort((x, y) => num(y.ruleMaxBid) - num(x.ruleMaxBid));
    return limit ? list.slice(0, limit) : list;
  }, [a, sort, rankOf, limit]);

  // rank movement markers (official rank), kept for 8 seconds after a change
  const prevRanks = useRef<Record<string, number> | null>(null);
  const [moves, setMoves] = useState<Record<string, { delta: number; at: number }>>({});
  useEffect(() => {
    const prev = prevRanks.current;
    prevRanks.current = rankOf;
    if (!prev) return;
    const now = Date.now();
    const changed: Record<string, { delta: number; at: number }> = {};
    for (const [id, r] of Object.entries(rankOf)) if (prev[id] && prev[id] !== r) changed[id] = { delta: prev[id] - r, at: now };
    if (Object.keys(changed).length) setMoves((mv) => ({ ...mv, ...changed }));
  }, [rankOf]);
  useEffect(() => {
    if (!Object.keys(moves).length) return;
    const t = setTimeout(() => setMoves((mv) => Object.fromEntries(Object.entries(mv).filter(([, v]) => Date.now() - v.at < 8000))), 8100);
    return () => clearTimeout(t);
  }, [moves]);

  // FLIP: remember each row's position, animate from the old one when the order changes
  const els = useRef(new Map<string, HTMLElement>());
  const tops = useRef(new Map<string, number>());
  const order = rows.map((r) => r.team.id).join(",");
  useLayoutEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    els.current.forEach((el, id) => {
      const before = tops.current.get(id);
      const after = el.getBoundingClientRect().top;
      if (before !== undefined && before !== after && !reduce && el.animate) {
        el.animate([{ transform: `translateY(${before - after}px)` }, { transform: "translateY(0)" }], { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
    });
    const next = new Map<string, number>();
    els.current.forEach((el, id) => next.set(id, el.getBoundingClientRect().top));
    tops.current = next;
  }, [order]);

  return (
    <div>
      {!compact && (
        <Tabs
          className="mb-2"
          value={sort}
          onChange={setSort}
          tabs={[
            { value: "rank", label: "Ranking" },
            { value: "purse", label: "Purse left" },
            { value: "maxbid", label: "Max bid" },
          ]}
        />
      )}
      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_2.75rem_3.75rem_4rem] gap-x-2 px-1 pb-1 text-[10px] uppercase tracking-wide text-faint">
        <span>#</span>
        <span>Team</span>
        <span className="text-right">Avg</span>
        <span className="text-right">Purse</span>
        <span className="text-right" title={`Most a team can bid on one player and still afford ${a.rules.squad_min} players at the minimum price (${a.market.ruleMinPrice})`}>Max bid</span>
      </div>
      <ul className="relative">
        {rows.map((t) => {
          const mv = moves[t.team.id];
          const rank = rankOf[t.team.id];
          return (
            <li
              key={t.team.id}
              ref={(el) => {
                if (el) els.current.set(t.team.id, el);
                else els.current.delete(t.team.id);
              }}
              className={cn(
                "relative grid grid-cols-[1.75rem_minmax(0,1fr)_2.75rem_3.75rem_4rem] items-center gap-x-2 rounded-md px-1 py-1.5 text-xs transition-colors duration-700",
                t.team.id === myTeamId && "bg-accent/10 ring-1 ring-inset ring-accent/40",
                mv && (mv.delta > 0 ? "bg-ok/10" : "bg-danger/10"),
              )}
            >
              <span className="flex items-center gap-0.5 tabular font-semibold">
                {rank === 1 && sort === "rank" ? <Trophy size={12} className="text-accent" /> : rank}
                {mv && (mv.delta > 0 ? <span className="flex items-center text-[10px] text-ok"><ArrowUp size={10} />{mv.delta}</span> : <span className="flex items-center text-[10px] text-danger"><ArrowDown size={10} />{-mv.delta}</span>)}
              </span>
              <span className="flex min-w-0 items-center gap-1.5" title={t.team.name}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.team.color || "#a3e635" }} />
                <span className="truncate font-medium">{t.team.short_name || t.team.name}</span>
              </span>
              <span className="text-right tabular font-medium" title={`${t.rating.ratedCount} rated of ${t.rating.count}`}>{fmtRating(t.rating.average)}</span>
              <span className="text-right tabular">{t.purseKnown ? m(t.remaining).replace(/ \S+$/, "") : "—"}</span>
              <span className={cn("text-right tabular font-semibold", t.purseKnown && t.ruleMaxBid <= a.market.ruleMinPrice ? "text-danger" : "text-accent")}>
                {t.purseKnown ? m(t.ruleMaxBid).replace(/ \S+$/, "") : "—"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 px-1 text-[10px] text-faint">
        Max bid = purse left − {a.market.ruleMinPrice} {a.rules.currency} × players still needed after that buy{a.rules.enforce_max_bid ? " (enforced by the organiser)" : " (guide)"}.
      </p>
    </div>
  );
}
