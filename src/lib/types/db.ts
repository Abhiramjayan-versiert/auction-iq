// Row types mirroring supabase/migrations. Kept hand-written so the app builds without a live project;
// regenerate with `supabase gen types typescript` when connected.
import type { Category, Origin } from "../engine";

export type PlatformRole = "super_admin" | "auctioneer" | "participant";

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  college: string | null;
  city: string | null;
  state: string | null;
  avatar_url: string | null;
  platform_role: PlatformRole;
  requested_role: "auctioneer" | "participant";
  status: "active" | "suspended";
  created_at: string;
  last_seen_at: string | null;
}

export interface EventRow {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  venue: string | null;
  starts_at: string | null;
  status: "draft" | "upcoming" | "live" | "completed" | "archived";
  is_active: boolean;
  visibility: "public" | "unlisted";
  invite_code: string;
  requires_approval: boolean;
  team_selection: "self_select" | "admin_assign";
  currency: string;
  default_purse: number;
  auctioneer_can_edit_rules: boolean;
  participant_permissions: { view_competitors?: boolean; view_official_purses?: boolean; view_leaderboard?: boolean };
  created_at: string;
  completed_at: string | null;
  mode: "official" | "tracker";
  owner_id: string | null;
  tracker_team_id: string | null;
  organizations?: { name: string } | null;
}

export interface TeamRow {
  id: string;
  event_id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  color: string | null;
  initial_purse: number | null;
}

export interface TeamMemberRow {
  team_id: string;
  user_id: string;
  event_id: string;
  role: "owner" | "member";
}

export interface EventMemberRow {
  event_id: string;
  user_id: string;
  role: "auctioneer" | "participant" | "data_entry" | "analyst";
  status: "pending" | "approved" | "rejected" | "removed";
  joined_at: string;
  profiles?: Pick<ProfileRow, "full_name" | "email" | "college"> | null;
}

export interface PlayerRatingRow {
  overall: number | null;
  batting: number | null;
  bowling: number | null;
  fielding: number | null;
  wicketkeeping: number | null;
  consistency: number | null;
  experience: number | null;
  source: string;
}

export interface PlayerRow {
  id: string;
  event_id: string | null;
  library_player_id: string | null;
  lot_number: number | null;
  name: string;
  photo_url: string | null;
  nationality: string | null;
  origin: Origin | null;
  category: Category | null;
  secondary_category: Category | null;
  batting_style: string | null;
  bowling_style: string | null;
  base_price: number;
  special_abilities: string[];
  attributes?: Record<string, string> | null;
  availability: boolean;
  auction_status: "upcoming" | "available" | "sold" | "unsold" | "withdrawn";
  sold_team_id: string | null;
  sold_price: number | null;
  player_ratings: PlayerRatingRow | PlayerRatingRow[] | null;
}

export interface AuctionRulesRow {
  event_id: string;
  squad_min: number;
  squad_max: number;
  min_player_price: number | null;
  bid_increment: number;
  require_complete_squad: boolean;
  enforce_max_constraints: boolean;
  enforce_max_bid?: boolean;
  allow_overspend: boolean;
  ranking_formula: "average" | "total" | "weighted";
  weights: Record<string, number>;
  rating_scale_max: number;
}

export interface RuleConstraintRow {
  id: string;
  event_id: string;
  label: string;
  category: Category | null;
  origin: Origin | null;
  min_count: number | null;
  max_count: number | null;
  sort: number;
}

export interface SessionRow {
  id: string;
  event_id: string;
  status: "not_started" | "live" | "paused" | "completed";
  current_player_id: string | null;
  bidding_open: boolean;
  current_bid: number | null;
  current_bid_team_id: string | null;
  last_transaction_id: string | null;
  announcement: string | null;
  started_at: string | null;
  updated_at: string;
}

export interface TransactionRow {
  id: string;
  seq: number;
  event_id: string;
  player_id: string;
  team_id: string | null;
  amount: number | null;
  type: "sale" | "unsold";
  status: "active" | "voided";
  client_ref?: string | null;
  note: string | null;
  voided_reason: string | null;
  created_at: string;
  voided_at: string | null;
}

export interface WorkspaceRow {
  id: string;
  user_id: string;
  event_id: string;
  strategy: "aggressive" | "balanced" | "conservative";
  alert_prefs: Record<string, unknown>;
  scenario_names: Record<string, string>;
  purse_override: number | null;
  settings: Record<string, unknown>;
}

export interface NoteRow {
  id: string;
  user_id: string;
  event_id: string;
  player_id: string | null;
  team_id: string | null;
  title: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface ShortlistRow {
  id: string;
  user_id: string;
  event_id: string;
  /** null when watching a player by name before the operator has entered them */
  player_id: string | null;
  player_name: string | null;
  target_price: number | null;
  private_rating: number | null;
  high_priority: boolean;
  list: "target" | "backup" | "avoid";
  priority: number;
  note: string | null;
}

export interface SimRow {
  id: string;
  user_id: string;
  event_id: string;
  scenario: "A" | "B" | "C" | "S";
  player_id: string;
  team_id: string;
  price: number;
}

export interface ObservationRow {
  id: string;
  user_id: string;
  event_id: string;
  team_id: string;
  kind: "purchase" | "initial_purse";
  player_id: string | null;
  player_name: string | null;
  amount: number;
  label: "participant" | "estimated" | "unverified";
  note: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string | null;
  event_id: string | null;
  level: "critical" | "warning" | "info" | "success";
  kind: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ActivityRow {
  id: number;
  event_id: string | null;
  actor_id: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}
