// Core domain types for the AUCTION IQ analytics engine.
// The engine is pure and deterministic: given the same official records it
// always produces the same numbers, so every rating and balance is
// reproducible from authoritative transactions.

export type Origin = "indian" | "overseas";
export type Category = "BAT" | "BOWL" | "AR" | "WK";
export const CATEGORIES: Category[] = ["BAT", "BOWL", "AR", "WK"];
export const ORIGINS: Origin[] = ["indian", "overseas"];

export const CATEGORY_LABEL: Record<Category, string> = {
  BAT: "Batsman",
  BOWL: "Bowler",
  AR: "All-rounder",
  WK: "Wicketkeeper",
};

export type AuctionStatus = "upcoming" | "available" | "sold" | "unsold" | "withdrawn";
export type DataSource = "official" | "participant" | "estimated" | "unverified";

export interface Player {
  id: string;
  name: string;
  photo_url?: string | null;
  nationality?: string | null;
  /** null when the operator did not record it — never guessed */
  origin: Origin | null;
  /** null when the operator did not record it — never guessed */
  category: Category | null;
  secondary_category?: Category | null;
  batting_style?: string | null;
  bowling_style?: string | null;
  base_price: number;
  overall: number | null;
  batting?: number | null;
  bowling?: number | null;
  fielding?: number | null;
  wicketkeeping?: number | null;
  consistency?: number | null;
  experience?: number | null;
  special_abilities?: string[] | null;
  auction_status: AuctionStatus;
  sold_team_id?: string | null;
  sold_price?: number | null;
  rating_source?: string | null;
  lot_number?: number | null;
}

export interface Team {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  color?: string | null;
  /** null when the organiser has not set it yet: purse calculations are disabled for the team */
  initial_purse: number | null;
}

export interface Transaction {
  id: string;
  player_id: string;
  team_id: string | null;
  amount: number | null;
  type: "sale" | "unsold";
  status: "active" | "voided";
  created_at: string;
}

export interface Constraint {
  id: string;
  label: string;
  category: Category | null; // null = any category
  origin: Origin | null; // null = any origin
  min: number | null;
  max: number | null;
}

export interface Weights {
  batting: number;
  bowling: number;
  allrounder: number;
  wicketkeeping: number;
  fielding: number;
  balance: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  batting: 25,
  bowling: 30,
  allrounder: 20,
  wicketkeeping: 10,
  fielding: 10,
  balance: 5,
};

export type RankingFormula = "average" | "total" | "weighted";

export interface RuleSet {
  squad_min: number;
  squad_max: number;
  /** Floor price used to reserve money for each mandatory slot. Falls back to cheapest base price. */
  min_player_price: number | null;
  bid_increment: number;
  require_complete_squad: boolean;
  ranking_formula: RankingFormula;
  weights: Weights;
  constraints: Constraint[];
  rating_scale_max: number;
  currency: string;
  allow_overspend: boolean;
  /** when false, rule maxima are warnings only (e.g. trackers recording an external auction) */
  enforce_max_constraints?: boolean;
}

export interface RosterEntry {
  player: Player;
  price: number;
  source: DataSource;
}

export type Strategy = "aggressive" | "balanced" | "conservative";

/** Everything needed to analyse an event. */
export interface EventSnapshot {
  rules: RuleSet;
  teams: Team[];
  players: Player[];
  transactions: Transaction[];
  /** Optional extra roster entries (private participant observations / simulations). */
  extraEntries?: Record<string, RosterEntry[]>;
  /** Optional per-team initial purse overrides (participant estimates). */
  purseOverrides?: Record<string, number>;
}
