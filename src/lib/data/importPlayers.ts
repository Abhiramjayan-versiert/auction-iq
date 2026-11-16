import type { Category, Origin } from "../engine";

export interface ImportedPlayer {
  name: string;
  nationality: string | null;
  origin: Origin | null;
  category: Category | null;
  secondary_category: Category | null;
  batting_style: string | null;
  bowling_style: string | null;
  base_price: number;
  photo_url: string | null;
  lot_number: number | null;
  special_abilities: string[];
  ratings: {
    overall: number | null;
    batting: number | null;
    bowling: number | null;
    fielding: number | null;
    wicketkeeping: number | null;
    consistency: number | null;
    experience: number | null;
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIASES: Record<string, string[]> = {
  name: ["name", "player", "playername", "fullname"],
  nationality: ["nationality", "country", "nation"],
  origin: ["origin", "type", "indianoverseas", "playertype", "overseas", "indian"],
  category: ["category", "role", "primarycategory", "primaryrole", "skill"],
  secondary_category: ["secondarycategory", "secondaryrole", "secondary"],
  batting_style: ["battingstyle", "bats", "batstyle"],
  bowling_style: ["bowlingstyle", "bowls", "bowlstyle"],
  base_price: ["baseprice", "base", "price", "reserveprice", "basepricecr"],
  photo_url: ["photo", "photourl", "image", "imageurl"],
  lot_number: ["lot", "lotnumber", "lotno", "set", "order", "sno", "slno"],
  special_abilities: ["specialabilities", "abilities", "special", "tags"],
  overall: ["overall", "rating", "overallrating", "ovr", "points"],
  batting: ["batting", "battingrating", "bat"],
  bowling: ["bowling", "bowlingrating", "bowl"],
  fielding: ["fielding", "fieldingrating", "field"],
  wicketkeeping: ["wicketkeeping", "keeping", "wk", "wkrating", "keepingrating"],
  consistency: ["consistency"],
  experience: ["experience", "exp"],
};

export function parseCategory(v: unknown): Category | null {
  const s = norm(String(v ?? ""));
  if (!s) return null;
  if (/^(wk|wicketkeeper|keeper|wicketkeeperbatsman|wkbatsman|wkbat|wicketkeeperbatter)/.test(s)) return "WK";
  if (/^(ar|allrounder|allround|allrounders)/.test(s)) return "AR";
  if (/^(bowl|bowler|bowlers|bwl|pacer|spinner|fastbowler)/.test(s)) return "BOWL";
  if (/^(bat|batsman|batter|batsmen|batting)/.test(s)) return "BAT";
  return null;
}

export function parseOrigin(v: unknown, nationality?: string | null): Origin | null {
  const s = norm(String(v ?? ""));
  if (["indian", "india", "ind", "in", "domestic", "local", "no", "n", "false", "0"].includes(s)) return "indian";
  if (["overseas", "foreign", "international", "os", "ovs", "yes", "y", "true", "1"].includes(s)) return "overseas";
  if (nationality) return norm(nationality) === "india" || norm(nationality) === "indian" ? "indian" : "overseas";
  return null;
}

const toNum = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[₹,\s]|cr|crore|lakh/gi, ""));
  return Number.isFinite(n) ? n : null;
};


/** Map a header cell to a field: exact alias first, then loose matches like "Player Names" or "Base Price (Cr)". */
function headerField(h: unknown): string | null {
  const k = norm(String(h ?? ""));
  if (!k) return null;
  for (const [field, aliases] of Object.entries(ALIASES)) if (aliases.includes(k)) return field;
  if (/^(player|name|playername|playernames|names|players|fullname)/.test(k) || (k.includes("name") && !k.includes("team"))) return "name";
  if (k.includes("baseprice") || k.startsWith("base")) return "base_price";
  if (k.includes("rating") || k.includes("overall") || k.includes("points")) return "overall";
  if (k.includes("role") || k.includes("category") || k.includes("skill")) return "category";
  if (k.includes("country") || k.includes("nationality")) return "nationality";
  if (k.includes("overseas") || k.includes("origin")) return "origin";
  return null;
}

export interface PlayerSheetResult {
  players: ImportedPlayer[];
  /** rows that could not be imported */
  errors: string[];
  /** imported, but something was ignored or left blank */
  warnings: string[];
  headerDetected: boolean;
}

/**
 * Converts a sheet (array of rows from Excel or CSV) into player records.
 * Works with a full player sheet, a sheet with only some columns, or just a list of names (with or
 * without a header row). Only the name is required; role, origin, prices and ratings are optional
 * and are imported exactly as supplied — never invented.
 */
export function parsePlayerSheet(sheet: unknown[][]): PlayerSheetResult {
  const rows = sheet.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""));
  const players: ImportedPlayer[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!rows.length) return { players, errors: ["The file is empty."], warnings, headerDetected: false };
  const mapped = rows[0].map(headerField);
  const headerDetected = mapped.includes("name");
  let cols: (string | null)[];
  let body: unknown[][];
  if (headerDetected) {
    cols = mapped;
    body = rows.slice(1);
  } else {
    // No recognisable header: column A is the name; a numeric column B is treated as the rating.
    const numericB = rows.every((r) => r[1] === undefined || r[1] === null || String(r[1]).trim() === "" || toNum(r[1]) !== null);
    cols = rows[0].map((_, i) => (i === 0 ? "name" : i === 1 && numericB ? "overall" : null));
    body = rows;
    if (rows[0].length > 1 && !numericB) warnings.push("No header row found — only the first column (player names) was imported. Add headers like Name, Rating, Role, Country to import more.");
  }
  const seen = new Set<string>();
  let dupes = 0;
  let unknownRoles = 0;
  body.forEach((r, i) => {
    const get = (f: string) => {
      const idx = cols.indexOf(f);
      return idx >= 0 ? r[idx] : undefined;
    };
    const line = i + (headerDetected ? 2 : 1);
    const name = String(get("name") ?? "").trim().replace(/\s+/g, " ");
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) {
      dupes++;
      return;
    }
    seen.add(key);
    const nationality = String(get("nationality") ?? "").trim() || null;
    const rawCat = get("category");
    const category = parseCategory(rawCat);
    if (rawCat !== undefined && String(rawCat ?? "").trim() && !category) unknownRoles++;
    const origin = parseOrigin(get("origin"), nationality);
    const base = toNum(get("base_price"));
    if (base !== null && base < 0) {
      errors.push(`Row ${line} (${name}): negative base price.`);
      return;
    }
    const rating = (f: string) => {
      const n = toNum(get(f));
      return n !== null && n < 0 ? null : n;
    };
    players.push({
      name,
      nationality,
      origin,
      category,
      secondary_category: parseCategory(get("secondary_category")),
      batting_style: String(get("batting_style") ?? "").trim() || null,
      bowling_style: String(get("bowling_style") ?? "").trim() || null,
      base_price: base ?? 0,
      photo_url: String(get("photo_url") ?? "").trim() || null,
      lot_number: toNum(get("lot_number")),
      special_abilities: String(get("special_abilities") ?? "").split(/[;|,]/).map((x) => x.trim()).filter(Boolean),
      ratings: {
        overall: rating("overall"),
        batting: rating("batting"),
        bowling: rating("bowling"),
        fielding: rating("fielding"),
        wicketkeeping: rating("wicketkeeping"),
        consistency: rating("consistency"),
        experience: rating("experience"),
      },
    });
  });
  if (dupes) warnings.push(`${dupes} duplicate name(s) in the file were skipped.`);
  if (unknownRoles) warnings.push(`${unknownRoles} role value(s) weren't recognised (use Batsman / Bowler / All-rounder / Wicketkeeper) — those players were imported without a role.`);
  return { players, errors, warnings, headerDetected };
}

/** Backwards-compatible wrapper for row objects (e.g. CSV parsed with headers). */
export function normalisePlayerRows(rows: Record<string, unknown>[]) {
  if (!rows.length) return { players: [] as ImportedPlayer[], errors: ["The file has no rows."], warnings: [] as string[] };
  const headers = Object.keys(rows[0]);
  const r = parsePlayerSheet([headers, ...rows.map((x) => headers.map((h) => x[h]))]);
  return { players: r.players, errors: r.errors, warnings: r.warnings };
}

export const PLAYER_TEMPLATE_HEADERS = [
  "lot_number", "name", "nationality", "origin", "category", "secondary_category", "batting_style", "bowling_style", "base_price",
  "overall", "batting", "bowling", "fielding", "wicketkeeping", "consistency", "experience", "special_abilities", "photo_url",
];
