-- =====================================================================
-- AUCTION IQ — core schema
-- Multi-event IPL-style auction platform with strict event isolation.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Profiles & platform roles
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text,
  college text,
  city text,
  state text,
  avatar_url text,
  platform_role text not null default 'participant'
    check (platform_role in ('super_admin', 'auctioneer', 'participant')),
  requested_role text not null default 'participant'
    check (requested_role in ('auctioneer', 'participant')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index profiles_email_idx on public.profiles (lower(email));
create index profiles_created_idx on public.profiles (created_at);

create table public.role_permissions (
  role text not null check (role in ('super_admin', 'auctioneer', 'participant')),
  permission text not null,
  primary key (role, permission)
);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  city text,
  state text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.rule_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  config jsonb not null, -- { rules: {...}, constraints: [...] }
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  name text not null,
  description text,
  venue text,
  starts_at timestamptz,
  status text not null default 'upcoming'
    check (status in ('draft', 'upcoming', 'live', 'completed', 'archived')),
  is_active boolean not null default true,
  visibility text not null default 'public' check (visibility in ('public', 'unlisted')),
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  requires_approval boolean not null default false,
  team_selection text not null default 'self_select' check (team_selection in ('self_select', 'admin_assign')),
  currency text not null default 'Cr',
  default_purse numeric(12, 2) not null default 100 check (default_purse >= 0),
  auctioneer_can_edit_rules boolean not null default true,
  participant_permissions jsonb not null default '{"view_competitors": true, "view_official_purses": true, "view_leaderboard": true}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index events_status_idx on public.events (status, is_active);

create table public.event_members (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('auctioneer', 'participant')),
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected', 'removed')),
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_members_user_idx on public.event_members (user_id);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  short_name text,
  logo_url text,
  color text,
  initial_purse numeric(12, 2) not null check (initial_purse >= 0),
  created_at timestamptz not null default now(),
  unique (event_id, name)
);
create index teams_event_idx on public.teams (event_id);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id),
  unique (event_id, user_id) -- one team per participant per event
);
create unique index team_members_one_owner on public.team_members (team_id) where role = 'owner';

-- ---------------------------------------------------------------------
-- Players & ratings
-- ---------------------------------------------------------------------
create table public.player_categories (
  code text primary key,
  label text not null,
  sort int not null default 0
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete cascade, -- null = global library
  library_player_id uuid references public.players (id) on delete set null,
  lot_number int,
  name text not null,
  photo_url text,
  nationality text,
  origin text not null check (origin in ('indian', 'overseas')),
  category text not null references public.player_categories (code),
  secondary_category text references public.player_categories (code),
  batting_style text,
  bowling_style text,
  base_price numeric(12, 2) not null default 0 check (base_price >= 0),
  special_abilities text[] not null default '{}',
  availability boolean not null default true,
  auction_status text not null default 'upcoming'
    check (auction_status in ('upcoming', 'available', 'sold', 'unsold', 'withdrawn')),
  sold_team_id uuid references public.teams (id) on delete set null,
  sold_price numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index players_event_idx on public.players (event_id, auction_status);
create index players_name_idx on public.players (event_id, lower(name));

create table public.player_ratings (
  player_id uuid primary key references public.players (id) on delete cascade,
  overall numeric(5, 2) check (overall >= 0),
  batting numeric(5, 2) check (batting >= 0),
  bowling numeric(5, 2) check (bowling >= 0),
  fielding numeric(5, 2) check (fielding >= 0),
  wicketkeeping numeric(5, 2) check (wicketkeeping >= 0),
  consistency numeric(5, 2) check (consistency >= 0),
  experience numeric(5, 2) check (experience >= 0),
  source text not null default 'admin', -- who supplied the rating; never fabricated
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Rule engine configuration (per event)
-- ---------------------------------------------------------------------
create table public.auction_rules (
  event_id uuid primary key references public.events (id) on delete cascade,
  squad_min int not null default 9 check (squad_min >= 0),
  squad_max int not null default 9 check (squad_max >= 1),
  min_player_price numeric(12, 2),
  bid_increment numeric(12, 2) not null default 0.25 check (bid_increment >= 0),
  require_complete_squad boolean not null default true,
  enforce_max_constraints boolean not null default true,
  allow_overspend boolean not null default false,
  ranking_formula text not null default 'average' check (ranking_formula in ('average', 'total', 'weighted')),
  weights jsonb not null default '{"batting":25,"bowling":30,"allrounder":20,"wicketkeeping":10,"fielding":10,"balance":5}',
  rating_scale_max numeric(5, 2) not null default 10,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (squad_min <= squad_max)
);

create table public.rule_constraints (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  label text not null,
  category text references public.player_categories (code),
  origin text check (origin in ('indian', 'overseas')),
  min_count int check (min_count >= 0),
  max_count int check (max_count >= 0),
  sort int not null default 0,
  check (min_count is null or max_count is null or min_count <= max_count)
);
create index rule_constraints_event_idx on public.rule_constraints (event_id);

-- ---------------------------------------------------------------------
-- Live auction
-- ---------------------------------------------------------------------
create table public.auction_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events (id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'live', 'paused', 'completed')),
  current_player_id uuid references public.players (id) on delete set null,
  bidding_open boolean not null default false,
  current_bid numeric(12, 2),
  current_bid_team_id uuid references public.teams (id) on delete set null,
  last_transaction_id uuid,
  announcement text,
  started_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.auction_transactions (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  event_id uuid not null references public.events (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  amount numeric(12, 2) check (amount >= 0),
  type text not null check (type in ('sale', 'unsold')),
  status text not null default 'active' check (status in ('active', 'voided')),
  note text,
  voided_reason text,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((type = 'sale' and team_id is not null and amount is not null) or type = 'unsold')
);
-- Database-level guarantee: a player can have only ONE active outcome (cannot be bought by two teams).
create unique index auction_tx_one_active_per_player on public.auction_transactions (player_id) where status = 'active';
create index auction_tx_event_idx on public.auction_transactions (event_id, seq desc);
create index auction_tx_team_idx on public.auction_transactions (team_id) where status = 'active';

create table public.team_rosters (
  player_id uuid primary key references public.players (id) on delete cascade, -- one team per player
  event_id uuid not null references public.events (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  transaction_id uuid not null references public.auction_transactions (id) on delete cascade,
  price numeric(12, 2) not null,
  acquired_at timestamptz not null default now()
);
create index team_rosters_team_idx on public.team_rosters (team_id);

create table public.team_financials (
  team_id uuid primary key references public.teams (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  initial_purse numeric(12, 2) not null,
  spent numeric(12, 2) not null default 0,
  remaining numeric(12, 2) not null,
  players_count int not null default 0,
  updated_at timestamptz not null default now()
);
create index team_financials_event_idx on public.team_financials (event_id);

create table public.team_scores (
  team_id uuid primary key references public.teams (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  total_rating numeric(8, 2) not null default 0,
  avg_rating numeric(6, 2),
  players_count int not null default 0,
  updated_at timestamptz not null default now()
);
create index team_scores_event_idx on public.team_scores (event_id);

-- ---------------------------------------------------------------------
-- Private participant workspace (never visible to other participants)
-- ---------------------------------------------------------------------
create table public.private_participant_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  strategy text not null default 'balanced' check (strategy in ('aggressive', 'balanced', 'conservative')),
  alert_prefs jsonb not null default '{}',
  scenario_names jsonb not null default '{"A":"Strategy A","B":"Strategy B","C":"Strategy C"}',
  purse_override numeric(12, 2),
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_id)
);

create table public.private_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  player_id uuid references public.players (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  title text,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index private_notes_owner_idx on public.private_notes (user_id, event_id);

create table public.player_shortlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  list text not null default 'target' check (list in ('target', 'backup', 'avoid')),
  priority int not null default 0,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, event_id, player_id)
);

create table public.simulated_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  scenario text not null default 'A' check (scenario in ('A', 'B', 'C')),
  player_id uuid not null references public.players (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  price numeric(12, 2) not null check (price >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, event_id, scenario, player_id)
);

create table public.competitor_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  kind text not null default 'purchase' check (kind in ('purchase', 'initial_purse')),
  player_id uuid references public.players (id) on delete cascade,
  player_name text,
  amount numeric(12, 2) not null check (amount >= 0),
  label text not null default 'participant' check (label in ('participant', 'estimated', 'unverified')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index competitor_obs_owner_idx on public.competitor_observations (user_id, event_id);

-- ---------------------------------------------------------------------
-- Notifications & audit
-- ---------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade, -- null + event_id = event broadcast; both null = platform
  event_id uuid references public.events (id) on delete cascade,
  level text not null default 'info' check (level in ('critical', 'warning', 'info', 'success')),
  kind text not null default 'system',
  title text not null,
  body text,
  read_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_event_idx on public.notifications (event_id, created_at desc);

create table public.activity_logs (
  id bigint generated always as identity primary key,
  event_id uuid references public.events (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index activity_logs_event_idx on public.activity_logs (event_id, created_at desc);
create index activity_logs_created_idx on public.activity_logs (created_at desc);
