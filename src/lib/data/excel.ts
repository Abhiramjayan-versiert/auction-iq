"use client";
import { fmtPct, type EventAnalysis, type Player } from "../engine";

type Cell = string | number | boolean | null;
export interface SheetSpec { name: string; rows: Record<string, Cell | undefined>[] }

/** Writes a real .xlsx workbook (one tab per sheet) and triggers a download. */
export async function downloadWorkbook(fileName: string, sheets: SheetSpec[]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const toData = (rows: SheetSpec["rows"]) => {
    if (!rows.length) return [[{ value: "No data" }]];
    const headers = Object.keys(rows[0]);
    return [
      headers.map((h) => ({ value: h, fontWeight: "bold" as const })),
      ...rows.map((r) => headers.map((h) => ({ value: r[h] ?? null }))),
    ];
  };
  await writeXlsxFile(
    sheets.map((s) => ({ data: toData(s.rows) as never, sheet: s.name.slice(0, 31) })) as never,
  ).toFile(fileName.replace(/[\\/:*?"<>|]/g, "-"));
}

/** Standard analytics workbook: teams, rosters, players and transactions — everything an Excel user would track. */
export function analyticsWorkbook(a: EventAnalysis, players: Player[], teamName: (id: string | null | undefined) => string, txs: { seq: number; created_at: string; player_id: string; type: string; team_id: string | null; amount: number | null; status: string }[]): SheetSpec[] {
  const rank = Object.fromEntries(a.leaderboard.map((r) => [r.teamId, r]));
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  return [
    {
      name: "Teams",
      rows: a.teams.map((t) => ({
        Rank: rank[t.team.id]?.officialRank, Team: t.team.name, Players: t.rating.count, "Initial purse": t.initialPurse, Spent: t.spent, Remaining: t.remaining,
        "Purse used": fmtPct(t.utilization), "Min reserve": t.floorReserve, "Free budget": t.discretionary, "Max single bid": t.maxSingleBid,
        "Avg rating": t.rating.average, "Total rating": t.rating.total, "Projected avg": t.projectedAverage, "Weighted score": t.rating.weighted,
        Batting: t.rating.batting, Bowling: t.rating.bowling, "All-rounders": t.rating.allrounder, Keeping: t.rating.wicketkeeping, Fielding: t.rating.fielding,
        Balance: t.rating.balance, Indian: t.indianCount, Overseas: t.overseasCount, "Still required": t.rules.slotsRequired, "Squad status": t.rules.status,
        "Includes estimates": t.hasEstimates ? "yes" : "no",
      })),
    },
    {
      name: "Rosters",
      rows: a.teams.flatMap((t) => t.entries.map((e) => ({
        Team: t.team.name, Player: e.player.name, Origin: e.player.origin, Role: e.player.category, Rating: e.player.overall, Batting: e.player.batting ?? null,
        Bowling: e.player.bowling ?? null, Price: e.price, "Rating per unit": e.price > 0 && e.player.overall !== null ? Number((e.player.overall / e.price).toFixed(3)) : null, Source: e.source,
      }))),
    },
    {
      name: "Players",
      rows: players.map((p) => ({
        Lot: p.lot_number ?? null, Player: p.name, Nationality: p.nationality ?? null, Origin: p.origin, Role: p.category, "Base price": p.base_price,
        Overall: p.overall, Batting: p.batting ?? null, Bowling: p.bowling ?? null, Fielding: p.fielding ?? null, Keeping: p.wicketkeeping ?? null,
        Status: p.auction_status, "Sold to": p.sold_team_id ? teamName(p.sold_team_id) : null, "Sold price": p.sold_price ?? null,
      })),
    },
    {
      name: "Results log",
      rows: txs.map((t) => ({
        "#": t.seq, Time: new Date(t.created_at).toLocaleString("en-IN"), Player: byId[t.player_id]?.name ?? null, Result: t.type === "sale" ? "Sold" : "Unsold",
        Team: t.type === "sale" ? teamName(t.team_id) : null, Price: t.amount, Status: t.status,
      })),
    },
  ];
}
