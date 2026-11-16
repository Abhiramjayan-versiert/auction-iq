import { DEFAULT_WEIGHTS, type Player, type RuleSet, type Team, type Transaction, type Weights } from "../engine";
import type { AuctionRulesRow, PlayerRow, RuleConstraintRow, TeamRow, TransactionRow } from "../types/db";

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export const ratingOf = (p: PlayerRow) => (Array.isArray(p.player_ratings) ? p.player_ratings[0] : p.player_ratings) ?? null;

export function toPlayer(p: PlayerRow): Player {
  const r = ratingOf(p);
  return {
    id: p.id,
    name: p.name,
    photo_url: p.photo_url,
    nationality: p.nationality,
    origin: p.origin,
    category: p.category,
    secondary_category: p.secondary_category,
    batting_style: p.batting_style,
    bowling_style: p.bowling_style,
    base_price: Number(p.base_price),
    overall: num(r?.overall),
    batting: num(r?.batting),
    bowling: num(r?.bowling),
    fielding: num(r?.fielding),
    wicketkeeping: num(r?.wicketkeeping),
    consistency: num(r?.consistency),
    experience: num(r?.experience),
    special_abilities: p.special_abilities,
    auction_status: p.auction_status,
    sold_team_id: p.sold_team_id,
    sold_price: num(p.sold_price),
    rating_source: r?.source ?? null,
    lot_number: p.lot_number,
    attributes: p.attributes ?? null,
  };
}

export const toTeam = (t: TeamRow): Team => ({ ...t, initial_purse: t.initial_purse === null || t.initial_purse === undefined ? null : Number(t.initial_purse) });

export const toTx = (t: TransactionRow): Transaction => ({
  id: t.id,
  player_id: t.player_id,
  team_id: t.team_id,
  amount: num(t.amount),
  type: t.type,
  status: t.status,
  created_at: t.created_at,
});

export function toRuleSet(r: AuctionRulesRow | null, cs: RuleConstraintRow[], currency: string): RuleSet {
  const w = { ...DEFAULT_WEIGHTS, ...((r?.weights ?? {}) as Partial<Weights>) };
  return {
    squad_min: r?.squad_min ?? 9,
    squad_max: r?.squad_max ?? 9,
    min_player_price: num(r?.min_player_price),
    bid_increment: Number(r?.bid_increment ?? 0.25),
    require_complete_squad: r?.require_complete_squad ?? true,
    ranking_formula: r?.ranking_formula ?? "average",
    weights: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Number(v)])) as unknown as Weights,
    rating_scale_max: Number(r?.rating_scale_max ?? 10),
    currency,
    allow_overspend: r?.allow_overspend ?? false,
    enforce_max_constraints: r?.enforce_max_constraints ?? true,
    enforce_max_bid: r?.enforce_max_bid ?? false,
    constraints: [...cs]
      .sort((a, b) => a.sort - b.sort)
      .map((c) => ({ id: c.id, label: c.label, category: c.category, origin: c.origin, min: c.min_count, max: c.max_count })),
  };
}
