import { parseCategory, parseOrigin } from "./importPlayers";
import type { Category, Origin } from "../engine";

export interface ResultRow {
  line: number;
  playerName: string;
  teamName: string;
  price: number | null; // null = unsold
  playerId: string | null;
  teamId: string | null;
  newPlayer: { category: Category; origin: Origin; overall: number | null } | null;
  problem: string | null;
}

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const pick = (row: Record<string, unknown>, names: string[]) => {
  const key = Object.keys(row).find((k) => names.includes(norm(k)));
  return key ? row[key] : undefined;
};

/**
 * Matches rows of an auction results sheet (player, team, price) to the event's players and teams.
 * Unknown players can be created when the row also gives a role and Indian/overseas origin.
 */
export function matchResultRows(
  rows: Record<string, unknown>[],
  players: { id: string; name: string; auction_status: string }[],
  teams: { id: string; name: string; short_name?: string | null }[],
): ResultRow[] {
  const byPlayer = new Map(players.map((p) => [norm(p.name), p]));
  const byTeam = new Map<string, string>();
  for (const t of teams) {
    byTeam.set(norm(t.name), t.id);
    if (t.short_name) byTeam.set(norm(t.short_name), t.id);
  }
  const seen = new Set<string>();
  return rows
    .map((r, i) => {
      const playerName = String(pick(r, ["player", "playername", "name"]) ?? "").trim();
      const teamName = String(pick(r, ["team", "teamname", "soldto", "buyer", "franchise", "winningteam"]) ?? "").trim();
      const rawPrice = pick(r, ["price", "amount", "soldprice", "bid", "winningbid", "soldfor"]);
      const unsold = /unsold/i.test(teamName) || /unsold/i.test(String(rawPrice ?? ""));
      const priceNum = Number(String(rawPrice ?? "").replace(/[₹,\s]|cr|crore/gi, ""));
      const price = unsold ? null : Number.isFinite(priceNum) && String(rawPrice ?? "").trim() !== "" ? priceNum : NaN;
      const p = byPlayer.get(norm(playerName));
      const teamId = unsold ? null : byTeam.get(norm(teamName)) ?? null;
      let newPlayer: ResultRow["newPlayer"] = null;
      let problem: string | null = null;
      if (!playerName) problem = "missing player name";
      else if (!p) {
        const category = parseCategory(pick(r, ["role", "category", "skill"]));
        const origin = parseOrigin(pick(r, ["origin", "type", "indianoverseas"]), String(pick(r, ["nationality", "country"]) ?? "") || null);
        const ovr = Number(pick(r, ["rating", "overall"]));
        if (category && origin) newPlayer = { category, origin, overall: Number.isFinite(ovr) && ovr > 0 ? ovr : null };
        else problem = "player not in this tracker (add role + origin columns to create it)";
      } else if (p.auction_status === "sold") problem = "already recorded as sold";
      if (!problem && !unsold && !teamId) problem = `unknown team "${teamName}"`;
      if (!problem && !unsold && !(price !== null && price >= 0)) problem = "missing or invalid price";
      const key = norm(playerName);
      if (!problem && seen.has(key)) problem = "duplicate row for this player";
      seen.add(key);
      return { line: i + 2, playerName, teamName, price: unsold ? null : price, playerId: p?.id ?? null, teamId, newPlayer, problem };
    })
    .filter((r) => r.playerName || r.teamName);
}
