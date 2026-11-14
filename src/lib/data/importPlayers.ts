import type { Category, Origin } from "../engine";

export interface ImportedPlayer {
  name: string;
  nationality: string | null;
  origin: Origin;
  category: Category;
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

/** Converts loosely formatted CSV / Excel rows into validated player records. Ratings are imported as supplied — never invented. */
export function normalisePlayerRows(rows: Record<string, unknown>[]) {
  const players: ImportedPlayer[] = [];
  const errors: string[] = [];
  if (!rows.length) return { players, errors: ["The file has no rows."] };
  const headers = Object.keys(rows[0]);
  const col: Record<string, string | undefined> = {};
  for (const [field, aliases] of Object.entries(ALIASES)) col[field] = headers.find((h) => aliases.includes(norm(h)));
  if (!col.name) return { players, errors: ["Missing a 'name' column."] };
  rows.forEach((r, i) => {
    const get = (f: string) => (col[f] ? r[col[f] as string] : undefined);
    const line = i + 2;
    const name = String(get("name") ?? "").trim();
    if (!name) return;
    const nationality = String(get("nationality") ?? "").trim() || null;
    const category = parseCategory(get("category"));
    const origin = parseOrigin(get("origin"), nationality);
    if (!category) return errors.push(`Row ${line} (${name}): unknown role "${String(get("category") ?? "")}". Use BAT / BOWL / AR / WK.`);
    if (!origin) return errors.push(`Row ${line} (${name}): cannot tell Indian or overseas — add an 'origin' or 'nationality' column.`);
    const base = toNum(get("base_price")) ?? 0;
    if (base < 0) return errors.push(`Row ${line} (${name}): negative base price.`);
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
      base_price: base,
      photo_url: String(get("photo_url") ?? "").trim() || null,
      lot_number: toNum(get("lot_number")),
      special_abilities: String(get("special_abilities") ?? "").split(/[;|,]/).map((s) => s.trim()).filter(Boolean),
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
  return { players, errors };
}

export const PLAYER_TEMPLATE_HEADERS = [
  "lot_number", "name", "nationality", "origin", "category", "secondary_category", "batting_style", "bowling_style", "base_price",
  "overall", "batting", "bowling", "fielding", "wicketkeeping", "consistency", "experience", "special_abilities", "photo_url",
];
