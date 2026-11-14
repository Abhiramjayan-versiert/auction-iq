# AUCTION IQ

An IPL-style auction platform for college management fests, intercollegiate competitions and other auction events. It does two jobs:

1. **Run the auction.** Auctioneers get a control room that records sales atomically, with undo, corrections and an audit log.
2. **Give participants an edge.** Every team owner gets a private, real-time workspace: purse maths, rule checks, competitor tracking, Smart Bid ceilings, a what-if simulator and predictions.

Built with **Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · shadcn-style components · Supabase (PostgreSQL, Auth, Realtime)**.

---

## Contents

- [Feature map](#feature-map)
- [Architecture](#architecture)
- [Security model](#security-model)
- [Algorithms](#algorithms)
- [Setup](#setup)
- [Deployment (Vercel + Supabase)](#deployment-vercel--supabase)
- [Testing](#testing)
- [Project layout](#project-layout)
- [Optional integrations & limits](#optional-integrations--limits)

---

## Feature map

| Role | Pages |
| --- | --- |
| **Public** | Landing `/`, `/features`, `/how-it-works`, `/register`, `/login`, `/forgot-password`, `/events` (discovery), `/join` (invite code) |
| **Participant** (`/e/[eventId]/…`) | Dashboard, Live workspace, My Team, Competitors, Team comparison, Leaderboard, Player explorer + value analyzer, Smart Bid, Purse planner + competitor purse calculator, What-if simulator, Shortlist, Notes, Alerts, Reports |
| **Auctioneer** (`/manage/[eventId]/…`) | Event overview, Auction control room, Transactions & logs, Teams, Players (quick add, CSV/Excel import, library import), Auction rules, Participants, Event reports |
| **Super Admin** (`/admin/…`) | Platform dashboard, Users, Events & auctions, Player database (global library), Rule templates, Global settings, Audit logs |

Highlights:

- **Multiple events, fully isolated.** Each event has its own teams, players, purses, rules, rating formula, transactions and leaderboard. Every row carries `event_id`, and RLS scopes every read and write to it.
- **Configurable rule engine.** Squad min/max, any number of min/max constraints on (category × Indian/overseas), bid increment, a per-slot floor price, overspend policy, and the official ranking formula (average, total or weighted). Constraints match on the player's *primary* category.
- **Live updates.** Supabase Realtime pushes official changes. Every client recomputes analytics from the authoritative transactions and resyncs after a reconnect.
- **Private workspace.** Notes, shortlists (target / backup / avoid with priority), simulations (scenarios A/B/C), competitor observations (Participant-entered / Estimated / Unverified) and alert preferences. Only the owner can see them.

## Architecture

```
Browser (React client components)
  ├─ EventDataProvider ── supabase-js (anon key, RLS) ── tables + Realtime channel per event
  │     └─ analytics engine (src/lib/engine) — pure TS, recomputed on every change
  ├─ WorkspaceProvider ── private tables (owner-only RLS)
  └─ Official writes ──► Postgres RPCs (security definer, role-checked, atomic)

Next.js server
  ├─ middleware.ts — refreshes the session cookie, protects private routes
  ├─ lib/auth.ts — server-side guards: requireProfile / requireEventMember / requireEventManager / requireSuperAdmin
  └─ admin server actions — the only code that touches SUPABASE_SERVICE_ROLE_KEY (create/delete auth users)
```

**Official state** lives in `auction_transactions`, the append-only source of truth; voided rows are kept for audit. `team_rosters`, `team_financials` and `team_scores` are derived from it, and `recompute_team()` can rebuild them at any time. All other analytics are computed client-side by the deterministic engine, so every number can be reproduced from the transactions.

**Database** (`supabase/migrations`):

| File | Contents |
| --- | --- |
| `…_schema.sql` | profiles, organizations, events, event_members, teams, team_members, player_categories, players, player_ratings, auction_rules, rule_constraints, auction_sessions, auction_transactions, team_rosters, team_financials, team_scores, private_participant_workspaces, private_notes, player_shortlists, simulated_transactions, competitor_observations, notifications, activity_logs, role_permissions, platform_settings, rule_templates + indexes |
| `…_functions.sql` | authorization helpers, triggers, and the atomic RPCs: `record_sale`, `mark_unsold`, `undo_last_transaction`, `void_transaction`, `correct_sale`, `set_session_status`, `set_current_player`, `publish_bid`, `publish_announcement`, `join_event`, `claim_team`, `assign_team`, `set_member_status`, `save_event_rules`, `import_library_players`, `admin_set_user`, `admin_platform_stats` |
| `…_rls.sql` | Row Level Security on every table + Realtime publication |
| `…_reference_data.sql` | categories, role permissions, platform defaults, two rule templates (no player data) |

## Security model

- **RLS on every table.** Signed-out clients (`anon`) have no table privileges and cannot execute any function.
- **Participants** can read their event's official data (approved members only). They can write only rows in their private tables where `user_id = auth.uid()`. They cannot change transactions, purses, ratings or rules.
- **Auctioneers** can manage only events where they are an approved auctioneer member (`can_manage_event`). They can edit rules only if the Super Admin allows it for that event (`auctioneer_can_edit_rules`).
- **Super Admins** manage the whole platform. They can *read* private workspaces for inspection, read-only.
- **Official writes go only through RPCs.** No client has insert/update rights on `auction_transactions`, `team_rosters`, `team_financials` or `team_scores`.
- **Role escalation is blocked.** A trigger stops anyone except a Super Admin from changing `platform_role`, `status` or `email`. A new user who asks for an auctioneer account starts as a participant until a Super Admin approves the request.
- **No double purchase.** `record_sale` locks the player row and the team's financial row with `FOR UPDATE`. A partial unique index (`one active transaction per player`) is the final safeguard. Tested with 20 concurrent sales of the same player: exactly one succeeds.
- **Validation on every sale:** player in this event and not already sold, bid ≥ base price, enough purse (unless overspend is allowed), squad not full, and no maximum constraint exceeded (unless disabled).
- **Service-role key stays on the server.** It is read only in `src/lib/supabase/admin.ts` (`server-only`), and only after `requireSuperAdmin()`.
- **Audit log.** Every official write, membership change and admin action goes to `activity_logs`.

## Algorithms

All of these live in `src/lib/engine` and have unit tests in `src/lib/engine/__tests__`.

- **Team rating:** `average = Σ overall ÷ players`, shown to 2 decimals. Example: (9.5+9.2+8.8+9.7+8.9)/5 = **9.22**. Role averages: batting (non-bowlers), bowling (bowlers + all-rounders), all-rounder, wicketkeeping and fielding.
- **Squad balance (0–100):** 70% progress toward every minimum constraint, plus 30% coverage of the four roles, minus 25 per violation.
- **Weighted analytical score:** uses the event's weights (default: batting 25, bowling 30, AR 20, WK 10, fielding 10, balance 5). It is shown *separately* from the official ranking metric, which always follows the configured formula.
- **Rule engine:** counts players per (origin × category) cell and evaluates every constraint as *satisfied / incomplete / violation*. A greedy planner finds the smallest set of remaining players that satisfies every minimum without breaking a maximum. From that it reports *potential future violations*: requirements that no longer fit in the squad, or every remaining slot being mandatory.
- **Purse reserve:** floor reserve = Σ cheapest base price for each mandatory slot. Market reserve uses the median winning price in that cell during this auction (or the median base price before any sales). A **CRITICAL** alert fires when the remaining purse is below the floor reserve.
- **Smart Bid ceiling** (per strategy; caps are 45% / 60% / 85% of free budget):
  `free = purse − reserve(after this purchase)`, then
  `ceiling = free × cap × (0.35 + 0.65·rating percentile) × (1 if it fills a requirement, else 0.7) × min(1, 3/(slots left + 1))`.
  The result is clamped to [base price, purse − floor reserve] and rounded to the bid increment. It never touches money reserved for mandatory slots. Each competitor's balanced ceiling estimates the price needed to win. Every step is shown to the user.
- **Value index:** `rating ÷ price` (winning price, or base price if unsold), log-normalised to 0–100 within each role.
- **Predictions:** a team's spending pressure is its floor reserve ÷ remaining purse. Likely next categories are ranked by scarcity (slots required ÷ supply left) and come with evidence and a confidence level. The engine also flags budget-exhaustion risk, spending style, and contested players (two or more teams both need and can afford them). These are labelled as estimates, never as confirmed intent.
- **Leaderboard:** official rank uses the configured formula. Incomplete or invalid squads are not eligible when the rules require a complete squad. A winner is declared only after the auction is marked completed. Separate analytical, purse-efficiency and balance rankings are also shown.

## Setup

Prerequisites: Node 20+, a Supabase project (free tier is fine).

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key (+ service role key)
```

Apply the database. Pick one:

- **Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push`.
- **SQL editor:** run the four files in `supabase/migrations/` in order.

To load the optional demo event (fictional players labelled "DEMO", invite code `DEMO2026`), also run `supabase/seed.sql`.

Then:

1. Register in the app, then promote yourself to Super Admin in the SQL editor: `select public.promote_super_admin('you@example.com');`
2. **Auth settings** (Supabase → Authentication):
   - Turn on email confirmations.
   - Set **Site URL** to your domain.
   - Add `https://<domain>/auth/callback` and `https://<domain>/reset-password` to the redirect URLs.
   - For Google login: enable the Google provider, add your Google OAuth client ID and secret, and add Supabase's callback URL to your Google OAuth client.
3. `npm run dev` and open http://localhost:3000.

Typical flow: Super Admin creates the event → assigns an auctioneer → the auctioneer adds teams and players (or imports CSV/Excel) and loads a rule template → participants join with the invite code and claim teams → the auctioneer runs the control room.

### Player import format

CSV or `.xlsx`, one header row. Headers are matched loosely. Download the template from the Players page.

```
lot_number,name,nationality,origin,category,secondary_category,batting_style,bowling_style,base_price,overall,batting,bowling,fielding,wicketkeeping,consistency,experience,special_abilities,photo_url
```

`category` accepts BAT/BOWL/AR/WK or words like "Batter" and "Wicket-keeper". `origin` can be left out if `nationality` is given. Ratings are imported exactly as supplied; missing ratings stay empty and are never invented.

## Deployment (Vercel + Supabase)

1. Push this repo to GitHub and import it in Vercel. The framework (Next.js) is detected automatically.
2. Set the environment variables from `.env.example` in Vercel. `SUPABASE_SERVICE_ROLE_KEY` must **not** have the `NEXT_PUBLIC_` prefix.
3. Set `NEXT_PUBLIC_SITE_URL` to the production URL, and update the Supabase Auth Site URL and redirect URLs to match.
4. Deploy. If the Supabase variables are missing, the app shows a `/setup` page instead of failing.

## Testing

| Command | What it checks |
| --- | --- |
| `npm test` | 21 unit tests for the engine and CSV import: spec rating example, rules, purse, Smart Bid (including the spec's ₹35 Cr example), simulation privacy, predictions, insights, alerts, leaderboard eligibility, 40 teams × 240 players performance |
| `npm run test:db` | Applies all migrations to a throwaway PostgreSQL (with a stub `auth` schema) and runs `supabase/tests/`: roles, RLS isolation between events and between participants, joining by code, team claiming, sales, duplicate-purchase/overspend/below-base/max-rule/full-squad rejection, unsold → re-auction, undo, correction, reproducible balances, audit trail, anon lockout, **20 concurrent sales of one player (exactly one succeeds)**, and a **scale run of 40 teams / 240 players / 200 sales** |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run test:smoke` | Playwright: public pages render on desktop and mobile with no errors or horizontal overflow; protected routes redirect signed-out users |
| `npm run test:e2e` | Playwright against `scripts/e2e/mock-supabase.cjs`, a fixture server fed by `scripts/e2e/make-fixtures.sql`, which plays a demo auction through the real RPCs. Renders all 35 signed-in pages on desktop and mobile and exercises Smart Bid, the simulator, notes and search |

`test:db` needs a local PostgreSQL. Set `PGHOST`, `PGPORT` and `PGUSER` (for example a throwaway cluster from `initdb`).

The mock server is for UI testing only. It does not implement Realtime or enforce RLS; the SQL suite covers those.

## Project layout

```
src/
  app/(public)/…         landing, auth, discovery
  app/(hub)/…            post-login hub: my auctions, join, profile, assigned events
  app/e/[eventId]/…      participant intelligence workspace
  app/manage/[eventId]/… auctioneer pages and control room
  app/admin/…            Super Admin
  components/            ui kit, domain widgets, shells
  hooks/                 useEventData (official data + realtime), useWorkspace (private data)
  lib/engine/            deterministic analytics engine (pure TypeScript)
  lib/data/              DB → engine mappers, CSV/Excel import, RPC helper
  lib/supabase/          browser / server / service-role clients
supabase/
  migrations/            schema, functions, RLS, reference data
  seed.sql               optional fictional demo event
  tests/                 SQL + concurrency + scale tests
scripts/                 db-test, smoke and e2e tooling
```

## Optional integrations & limits

- **AI narration (optional, not enabled).** Every recommendation comes from deterministic algorithms that reference real auction numbers. An LLM could later rephrase insights; `ANTHROPIC_API_KEY` is reserved for that and nothing depends on it.
- **Browser notifications.** These are opt-in per participant (Alerts page) and fire only while the tab is hidden. In-app toasts and the notification bell are the main channel.
- **Physical bids are never detected.** The auctioneer records every result. The optional "running bid" shown to participants is typed in by the auctioneer.
- **No real player data is included.** The demo seed uses fictional "DEMO Player" names and ratings marked as fictional.
- **Subscription plans** are not implemented. Platform settings exist if they are added later.
