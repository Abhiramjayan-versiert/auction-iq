// Pure helpers for the live data-entry grid: normalising names, resolving teams,
// validating an entry and parsing rows pasted from Excel / Google Sheets.
import { parseCategory, parseOrigin } from "./importPlayers";
import type { Category, Origin } from "../engine";

export interface EntryDraft {
  name: string;
  rating: string;
  team: string; // team id, or "" for unsold
  price: string;
  status: "sold" | "unsold";
  category: Category | "";
  origin: Origin | "";
  nationality: string;
  base: string;
}

export const emptyDraft = (): EntryDraft => ({ name: "", rating: "", team: "", price: "", status: "sold", category: "", origin: "", nationality: "", base: "" });

export const nameKey = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export interface TeamLite {
  id: string;
  name: string;
  short_name?: string | null;
}
export interface PlayerLite {
  id: string;
  name: string;
  auction_status: string;
  sold_team_id?: string | null;
  sold_price?: number | null;
  overall?: number | null;
}

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Resolve typed text to a team: exact name / short name, then unique prefix, then unique substring. */
export function resolveTeam(text: string, teams: TeamLite[]): TeamLite | null {
  const k = compact(text);
  if (!k) return null;
  const exact = teams.find((t) => compact(t.name) === k || (t.short_name && compact(t.short_name) === k));
  if (exact) return exact;
  const prefix = teams.filter((t) => compact(t.name).startsWith(k) || (t.short_name && compact(t.short_name).startsWith(k)));
  if (prefix.length === 1) return prefix[0];
  const sub = teams.filter((t) => compact(t.name).includes(k));
  return sub.length === 1 ? sub[0] : null;
}

function lev(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export type NameCheck =
  | { kind: "new" }
  | { kind: "existing"; player: PlayerLite }
  | { kind: "sold"; player: PlayerLite }
  | { kind: "similar"; players: PlayerLite[] };

/** Duplicate-player protection while the operator types. */
export function checkName(name: string, players: PlayerLite[]): NameCheck {
  const k = nameKey(name);
  if (!k) return { kind: "new" };
  const same = players.find((p) => nameKey(p.name) === k);
  if (same) return same.auction_status === "sold" ? { kind: "sold", player: same } : { kind: "existing", player: same };
  if (k.length >= 4) {
    const similar = players.filter((p) => lev(nameKey(p.name), k) <= 2).slice(0, 3);
    if (similar.length) return { kind: "similar", players: similar };
  }
  return { kind: "new" };
}

export interface EntryPayload {
  p_name: string;
  p_rating: number | null;
  p_team: string | null;
  p_amount: number | null;
  p_status: "sold" | "unsold";
  p_category: Category | null;
  p_origin: Origin | null;
  p_nationality: string | null;
  p_base_price: number | null;
}

/** Client-side validation mirroring the server (the server re-validates). */
export function validateDraft(d: EntryDraft, opts: { scale: number; players: PlayerLite[]; requireRating?: boolean }): { payload: EntryPayload | null; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = d.name.trim().replace(/\s+/g, " ");
  if (!name) errors.push("Player name is required.");
  const rating = d.rating.trim() === "" ? null : Number(d.rating);
  if (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > opts.scale)) errors.push(`Rating must be between 0 and ${opts.scale}.`);
  if (rating === null && opts.requireRating !== false && d.status === "sold") warnings.push("No rating entered — the player won't count towards averages.");
  const price = d.price.trim() === "" ? null : Number(d.price);
  if (d.status === "sold") {
    if (!d.team) errors.push("Choose the winning team.");
    if (price === null || !Number.isFinite(price) || price < 0) errors.push("Enter a valid sold price.");
  }
  const base = d.base.trim() === "" ? null : Number(d.base);
  if (base !== null && (!Number.isFinite(base) || base < 0)) errors.push("Base price must be a positive number.");
  if (base !== null && price !== null && d.status === "sold" && price < base) errors.push(`Sold price is below the base price (${base}).`);
  const nc = checkName(name, opts.players);
  if (nc.kind === "sold") errors.push(`${nc.player.name} is already recorded as sold. Edit that row instead.`);
  if (nc.kind === "existing" && nc.player.auction_status === "unsold" && d.status === "unsold") errors.push(`${nc.player.name} is already marked unsold.`);
  if (errors.length) return { payload: null, errors, warnings };
  return {
    payload: {
      p_name: name,
      p_rating: rating,
      p_team: d.status === "sold" ? d.team : null,
      p_amount: d.status === "sold" ? price : null,
      p_status: d.status,
      p_category: d.category || null,
      p_origin: d.origin || null,
      p_nationality: d.nationality.trim() || null,
      p_base_price: base,
    },
    errors,
    warnings,
  };
}

export interface PastedRow {
  line: number;
  draft: EntryDraft;
  teamText: string;
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["player", "playername", "name"],
  rating: ["rating", "overall", "points", "ovr"],
  team: ["team", "winningteam", "soldto", "buyer", "franchise"],
  price: ["price", "soldprice", "amount", "bid", "winningbid", "soldfor"],
  category: ["category", "role", "skill"],
  nationality: ["nationality", "country"],
  origin: ["origin", "type", "indianoverseas"],
  base: ["base", "baseprice", "reserve"],
  status: ["status", "result"],
};
const DEFAULT_ORDER = ["name", "rating", "team", "price", "category", "nationality", "base"];

/** Parse rows copied from Excel / Google Sheets (tab separated) or CSV text. */
export function parsePastedRows(text: string, teams: TeamLite[]): PastedRow[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const sep = lines.some((l) => l.includes("\t")) ? "\t" : ",";
  const cells = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
  let order = DEFAULT_ORDER;
  let start = 0;
  const head = cells[0].map((c) => c.toLowerCase().replace(/[^a-z]/g, ""));
  const mapped = head.map((h) => Object.entries(HEADER_ALIASES).find(([, al]) => al.includes(h))?.[0] ?? "");
  if (mapped.filter(Boolean).length >= 2) {
    order = mapped;
    start = 1;
  }
  return cells.slice(start).map((row, i) => {
    const get = (f: string) => {
      const idx = order.indexOf(f);
      return idx >= 0 ? row[idx] ?? "" : "";
    };
    const teamText = get("team");
    const statusText = `${get("status")} ${teamText} ${get("price")}`.toLowerCase();
    const unsold = /unsold|not sold|^\s*-\s*$/.test(statusText) || (teamText === "" && get("price") === "");
    const team = unsold ? null : resolveTeam(teamText, teams);
    const nat = get("nationality");
    const origin = parseOrigin(get("origin"), nat || null);
    return {
      line: i + start + 1,
      teamText,
      draft: {
        name: get("name"),
        rating: get("rating").replace(",", "."),
        team: team?.id ?? "",
        price: get("price").replace(/[₹,\s]|cr|crore|lakh|l$/gi, ""),
        status: unsold ? "unsold" : "sold",
        category: parseCategory(get("category")) ?? "",
        origin: get("origin") || nat ? origin ?? "" : "",
        nationality: nat,
        base: get("base").replace(/[₹,\s]|cr|crore/gi, ""),
      },
    };
  });
}

export const isNetworkError = (e: { message?: string; code?: string } | null | undefined) =>
  !!e && (!e.code || /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(e.message ?? ""));
