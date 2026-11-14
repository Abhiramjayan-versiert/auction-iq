import { DEFAULT_WEIGHTS, type Category, type Origin, type Player, type RuleSet, type Team, type Transaction } from "../types";

export const exampleRules = (): RuleSet => ({
  squad_min: 9,
  squad_max: 9,
  min_player_price: null,
  bid_increment: 0.25,
  require_complete_squad: true,
  ranking_formula: "average",
  weights: DEFAULT_WEIGHTS,
  rating_scale_max: 10,
  currency: "Cr",
  allow_overspend: false,
  constraints: [
    { id: "ib", label: "Indian batsmen", category: "BAT", origin: "indian", min: 2, max: 2 },
    { id: "ob", label: "Overseas batsmen", category: "BAT", origin: "overseas", min: 1, max: 1 },
    { id: "ibo", label: "Indian bowlers", category: "BOWL", origin: "indian", min: 2, max: 2 },
    { id: "obo", label: "Overseas bowlers", category: "BOWL", origin: "overseas", min: 2, max: 2 },
    { id: "iar", label: "Indian all-rounders", category: "AR", origin: "indian", min: 1, max: null },
    { id: "wk", label: "Wicketkeepers", category: "WK", origin: null, min: 1, max: null },
  ],
});

let n = 0;
export const mkPlayer = (category: Category, origin: Origin, overall: number, base = 1, extra: Partial<Player> = {}): Player => ({
  id: `p${++n}`,
  name: `Sample Player ${n}`,
  origin,
  category,
  base_price: base,
  overall,
  batting: overall,
  bowling: overall,
  fielding: overall,
  wicketkeeping: category === "WK" ? overall : null,
  auction_status: "available",
  ...extra,
});

export const mkTeam = (id: string, purse = 100): Team => ({ id, name: `Team ${id}`, short_name: id, initial_purse: purse });

export const sale = (player: Player, team: string, amount: number): Transaction => {
  player.auction_status = "sold";
  player.sold_team_id = team;
  player.sold_price = amount;
  return { id: `t-${player.id}`, player_id: player.id, team_id: team, amount, type: "sale", status: "active", created_at: new Date().toISOString() };
};
