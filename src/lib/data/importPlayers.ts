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
  /** columns without a matching field, kept as-is (heading → value) */
  attributes?: Record<string, string>;
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
  origin: ["origin", "type", "indianoverseas", "playertype", "overseas", "indian", "indianorforeign", "indianforeign", "foreignorindian", "indianoroverseas", "foreign", "nationalitytype", "domesticoverseas", "localforeign", "status"],
  category: ["category", "role", "primarycategory", "primaryrole", "skill", "position", "speciality", "specialty", "playingrole", "type of player", "playerrole"],
  secondary_category: ["secondarycategory", "secondaryrole", "secondary"],
  batting_style: ["battingstyle", "bats", "batstyle"],
  bowling_style: ["bowlingstyle", "bowls", "bowlstyle"],
  base_price: ["baseprice", "base", "price", "reserveprice", "basepricecr"],
  photo_url: ["photo", "photourl", "image", "imageurl"],
  lot_number: ["lot", "lotnumber", "lotno", "set", "order", "playerno", "playernumber", "playerid", "pno", "no", "number", "id", "code", "playercode", "jerseyno", "jersey"],
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
  if (["indian", "india", "ind", "in", "i", "domestic", "local", "indianplayer", "no", "n", "false", "0"].includes(s)) return "indian";
  if (["overseas", "foreign", "foreigner", "foreigners", "foreignplayer", "overseasplayer", "international", "os", "ovs", "o", "f", "yes", "y", "true", "1"].includes(s)) return "overseas";
  if (nationality) return norm(nationality) === "india" || norm(nationality) === "indian" ? "indian" : "overseas";
  return null;
}

const toNum = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[₹,\s]|cr|crore|lakh/gi, ""));
  return Number.isFinite(n) ? n : null;
};


export type ImportField =
  | "name" | "lot_number" | "category" | "origin" | "nationality" | "overall" | "batting" | "bowling" | "fielding" | "wicketkeeping"
  | "consistency" | "experience" | "base_price" | "secondary_category" | "batting_style" | "bowling_style" | "special_abilities" | "photo_url"
  | "extra" | "ignore";

export const IMPORT_FIELDS: { value: ImportField; label: string }[] = [
  { value: "name", label: "Player name" },
  { value: "lot_number", label: "Player no. / lot" },
  { value: "category", label: "Role / position" },
  { value: "origin", label: "Indian or overseas" },
  { value: "nationality", label: "Nationality / country" },
  { value: "overall", label: "Rating (overall)" },
  { value: "base_price", label: "Base price" },
  { value: "batting", label: "Batting rating" },
  { value: "bowling", label: "Bowling rating" },
  { value: "fielding", label: "Fielding rating" },
  { value: "wicketkeeping", label: "Keeping rating" },
  { value: "consistency", label: "Consistency" },
  { value: "experience", label: "Experience" },
  { value: "secondary_category", label: "Secondary role" },
  { value: "batting_style", label: "Batting style" },
  { value: "bowling_style", label: "Bowling style" },
  { value: "special_abilities", label: "Special abilities / tags" },
  { value: "photo_url", label: "Photo URL" },
  { value: "extra", label: "Keep as extra info" },
  { value: "ignore", label: "Ignore" },
];

const SERIAL_HEADERS = ["sno", "slno", "srno", "serial", "serialno", "sl", "sr", "snumber", "rowno", "row", "index"];

/** pandas-style "Unnamed: 3" and blank headers carry no meaning. */
const cleanHeader = (h: unknown) => {
  const t = String(h ?? "").trim();
  return /^unnamed\s*:?\s*\d*$/i.test(t) ? "" : t;
};

/** Map a header cell to a field: exact alias first, then loose matches like "Player Names" or "Base Price (Cr)". */
function headerField(h: unknown): ImportField | null {
  const k = norm(cleanHeader(h));
  if (!k) return null;
  if (SERIAL_HEADERS.includes(k)) return "ignore";
  for (const [field, aliases] of Object.entries(ALIASES)) if (aliases.map(norm).includes(k)) return field as ImportField;
  if (k.includes("baseprice") || k.startsWith("base") || k.includes("reserve")) return "base_price";
  if (k.includes("indian") || k.includes("foreign") || k.includes("overseas")) return "origin";
  if (k.includes("playerno") || k.includes("playernumber") || k.includes("lot")) return "lot_number";
  if (/^(player|name|playername|playernames|names|players|fullname)/.test(k) || (k.includes("name") && !k.includes("team"))) return "name";
  if (k.includes("batting") && k.includes("style")) return "batting_style";
  if (k.includes("bowling") && k.includes("style")) return "bowling_style";
  if (k.includes("rating") || k.includes("overall") || k.includes("points") || k.includes("score")) return "overall";
  if (k.includes("role") || k.includes("category") || k.includes("skill") || k.includes("position")) return "category";
  if (k.includes("country") || k.includes("nationality") || k.includes("nation")) return "nationality";
  if (k.includes("photo") || k.includes("image")) return "photo_url";
  return null;
}

export interface ColumnPlan {
  index: number;
  header: string;
  field: ImportField;
  samples: string[];
  why: string;
}
export interface SheetPlan {
  headerRow: number | null;
  columns: ColumnPlan[];
}

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const isInt = (v: unknown) => cellText(v) !== "" && /^\d+$/.test(cellText(v));
const looksLikeName = (v: unknown) => /[a-z]/i.test(cellText(v)) && cellText(v).length >= 3 && !/^(yes|no|y|n|true|false)$/i.test(cellText(v));

/** Work out where the header is and what each column holds. Every column gets a field (or extra/ignore). */
export function guessPlan(sheet: unknown[][]): SheetPlan {
  const rows = sheet.filter((r) => Array.isArray(r) && r.some((c) => cellText(c) !== ""));
  const width = Math.max(0, ...rows.map((r) => r.length));
  // header row = among the first 6 rows, the one whose cells map to the most known fields (needs a name column)
  let headerRow: number | null = null;
  let best = 0;
  rows.slice(0, 6).forEach((r, i) => {
    const fields = r.map(headerField).filter((f) => f && f !== "ignore");
    if (fields.includes("name") && fields.length > best) {
      best = fields.length;
      headerRow = i;
    }
  });
  // rows with a single filled cell (e.g. trailing serial numbers with no player) don't describe the columns
  const body = (headerRow === null ? rows : rows.slice((headerRow as number) + 1)).filter((r) => r.filter((c) => cellText(c) !== "").length >= 2 || width === 1);
  const columns: ColumnPlan[] = [];
  const taken = new Set<ImportField>();
  for (let c = 0; c < width; c++) {
    const values = body.map((r) => r[c]).filter((v) => cellText(v) !== "");
    if (!values.length) continue; // empty column
    const header = headerRow === null ? "" : cleanHeader(rows[headerRow][c]);
    const samples = [...new Set(values.map(cellText))].slice(0, 4);
    let field: ImportField | null = header ? headerField(header) : null;
    let why = field ? `heading “${header}”` : "";
    if (!field) {
      const ints = values.every(isInt);
      const nums = values.every((v) => toNum(v) !== null);
      const seq = ints && values.every((v, i) => Number(cellText(v)) === Number(cellText(values[0])) + i);
      const lower = values.map((v) => norm(cellText(v)));
      if (seq && Number(cellText(values[0])) <= 1) [field, why] = ["ignore", "running serial number 1, 2, 3…"];
      else if (ints && !taken.has("lot_number")) [field, why] = ["lot_number", "whole numbers → player number"];
      else if (!nums && lower.every((v) => parseCategory(v) !== null)) [field, why] = ["category", "values look like roles"];
      else if (!nums && lower.every((v) => parseOrigin(v) !== null && !/^(yes|y|no|n|true|false)$/.test(v))) [field, why] = ["origin", "values look like Indian / overseas"];
      else if (!nums && !taken.has("name") && values.filter(looksLikeName).length >= values.length * 0.8) [field, why] = ["name", "text values look like names"];
      else if (nums && !taken.has("overall") && values.every((v) => (toNum(v) as number) <= 100)) [field, why] = ["overall", "decimal numbers → rating"];
      else [field, why] = ["extra", header ? `unrecognised heading “${header}”` : "no heading — kept as extra info"];
    }
    if (field !== "extra" && field !== "ignore" && taken.has(field)) [field, why] = ["extra", `second “${header || "unnamed"}” column — kept as extra info`];
    taken.add(field);
    columns.push({ index: c, header: header || `Column ${String.fromCharCode(65 + (c % 26))}`, field, samples, why });
  }
  return { headerRow, columns };
}

export interface PlayerSheetResult {
  players: (ImportedPlayer & { attributes: Record<string, string> })[];
  /** rows that could not be imported */
  errors: string[];
  /** imported, but something was ignored, assumed or left blank */
  warnings: string[];
  headerDetected: boolean;
  plan: SheetPlan;
  maxRating: number | null;
}

/** Name markers organisers use for overseas players, e.g. "DWAYNE SMITH *" or "Smith (OS)". */
const OVERSEAS_MARK = /\s*(\*+|†|\((os|o\/s|overseas|f|foreign)\))\s*$/i;

/** Build player records from a sheet using a column plan (auto-guessed or edited by the organiser). */
export function applyPlan(sheet: unknown[][], plan: SheetPlan): PlayerSheetResult {
  const rows = sheet.filter((r) => Array.isArray(r) && r.some((c) => cellText(c) !== ""));
  const players: PlayerSheetResult["players"] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!rows.length) return { players, errors: ["The file is empty."], warnings, headerDetected: false, plan, maxRating: null };
  if (!plan.columns.some((c) => c.field === "name")) return { players, errors: ["Choose which column holds the player names."], warnings, headerDetected: plan.headerRow !== null, plan, maxRating: null };
  const body = plan.headerRow === null ? rows : rows.slice(plan.headerRow + 1);
  const colFor = (f: ImportField) => plan.columns.find((c) => c.field === f);
  const extras = plan.columns.filter((c) => c.field === "extra");
  const seen = new Set<string>();
  const lots = new Map<number, number>();
  let dupes = 0;
  let unknownRoles = 0;
  let starAssumed = 0;
  const starConflicts: string[] = [];
  let maxRating: number | null = null;
  body.forEach((r, i) => {
    const get = (f: ImportField) => {
      const c = colFor(f);
      return c ? r[c.index] : undefined;
    };
    const line = i + (plan.headerRow === null ? 1 : plan.headerRow + 2);
    let name = cellText(get("name")).replace(/\s+/g, " ");
    if (!name) return;
    const starred = OVERSEAS_MARK.test(name);
    name = name.replace(OVERSEAS_MARK, "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) {
      dupes++;
      return;
    }
    seen.add(key);
    const nationality = cellText(get("nationality")) || null;
    const rawCat = get("category");
    const category = parseCategory(rawCat);
    if (cellText(rawCat) && !category) unknownRoles++;
    let origin = parseOrigin(get("origin"), nationality);
    if (starred && !origin) {
      origin = "overseas";
      starAssumed++;
    } else if (starred && origin === "indian") starConflicts.push(name);
    const base = toNum(get("base_price"));
    if (base !== null && base < 0) {
      errors.push(`Row ${line} (${name}): negative base price.`);
      return;
    }
    const rating = (f: ImportField) => {
      const n = toNum(get(f));
      return n !== null && n < 0 ? null : n;
    };
    const overall = rating("overall");
    if (overall !== null) maxRating = Math.max(maxRating ?? 0, overall);
    const lot = toNum(get("lot_number"));
    if (lot !== null) lots.set(lot, (lots.get(lot) ?? 0) + 1);
    const attributes: Record<string, string> = {};
    for (const e of extras) {
      const v = cellText(r[e.index]);
      if (v) attributes[e.header] = v;
    }
    players.push({
      name,
      nationality,
      origin,
      category,
      secondary_category: parseCategory(get("secondary_category")),
      batting_style: cellText(get("batting_style")) || null,
      bowling_style: cellText(get("bowling_style")) || null,
      base_price: base ?? 0,
      photo_url: cellText(get("photo_url")) || null,
      lot_number: lot,
      special_abilities: cellText(get("special_abilities")).split(/[;|,]/).map((x) => x.trim()).filter(Boolean),
      ratings: { overall, batting: rating("batting"), bowling: rating("bowling"), fielding: rating("fielding"), wicketkeeping: rating("wicketkeeping"), consistency: rating("consistency"), experience: rating("experience") },
      attributes,
    });
  });
  if (dupes) warnings.push(`${dupes} duplicate name(s) in the file were skipped.`);
  if (unknownRoles) warnings.push(`${unknownRoles} role value(s) weren't recognised (use Batsman / Bowler / All-rounder / Wicketkeeper) — those players were imported without a role.`);
  if (starAssumed) warnings.push(`${starAssumed} name(s) ended with “*” and had no Indian/overseas value — treated as overseas.`);
  if (starConflicts.length) warnings.push(`Marked “*” but listed as Indian (kept as Indian): ${starConflicts.slice(0, 5).join(", ")}${starConflicts.length > 5 ? "…" : ""}. Check these.`);
  const dupLots = [...lots.entries()].filter(([, n]) => n > 1).map(([l]) => l);
  if (dupLots.length) warnings.push(`Player number(s) used more than once: ${dupLots.slice(0, 8).join(", ")}.`);
  if (extras.length) warnings.push(`Extra columns kept as player info: ${extras.map((e) => e.header).join(", ")}.`);
  return { players, errors, warnings, headerDetected: plan.headerRow !== null, plan, maxRating };
}

/**
 * Converts a sheet (array of rows from Excel, CSV, PDF, Word…) into player records with an
 * automatically guessed column plan. Only the name is required; nothing is invented.
 */
export function parsePlayerSheet(sheet: unknown[][]): PlayerSheetResult {
  const rows = sheet.filter((r) => Array.isArray(r) && r.some((c) => cellText(c) !== ""));
  if (!rows.length) return { players: [], errors: ["The file is empty."], warnings: [], headerDetected: false, plan: { headerRow: null, columns: [] }, maxRating: null };
  return applyPlan(sheet, guessPlan(sheet));
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
