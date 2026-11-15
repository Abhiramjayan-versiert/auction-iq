-- =====================================================================
-- AUCTION IQ — Live manual data entry (no preloaded player database)
--  * players are created on the fly by the data-entry operator
--  * category / origin / base price / initial purse are optional
--  * idempotent submissions (client_ref) so retries never double-record
--  * data-entry operators can be assigned to official events too
-- Backward compatible: existing rows and RPCs keep working.
-- =====================================================================

-- 1. Optional player attributes + case-insensitive identity per event
alter table public.players alter column category drop not null;
alter table public.players alter column origin drop not null;
alter table public.players
  add column if not exists name_key text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored;

-- de-duplicate any legacy duplicates before enforcing uniqueness
with d as (
  select id, row_number() over (partition by event_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) order by created_at, id) rn
  from public.players where event_id is not null
)
update public.players p set name = p.name || ' #' || d.rn from d where d.id = p.id and d.rn > 1;

create unique index if not exists players_event_name_key on public.players (event_id, name_key) where event_id is not null;

-- 2. Initial purse may be unknown at setup time (purse calculations are disabled until it is set)
alter table public.teams alter column initial_purse drop not null;
alter table public.team_financials alter column initial_purse drop not null;
alter table public.team_financials alter column remaining drop not null;

create or replace function public.recompute_team(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_initial numeric; v_spent numeric; v_count int; v_total numeric; v_rated int;
begin
  select initial_purse into v_initial from teams where id = p_team;
  select coalesce(sum(amount), 0), count(*) into v_spent, v_count
    from auction_transactions where team_id = p_team and status = 'active' and type = 'sale';
  update team_financials set initial_purse = v_initial, spent = v_spent, remaining = v_initial - v_spent,
         players_count = v_count, updated_at = now() where team_id = p_team;
  select coalesce(sum(r.overall), 0), count(r.overall) into v_total, v_rated
    from team_rosters tr left join player_ratings r on r.player_id = tr.player_id where tr.team_id = p_team;
  update team_scores set total_rating = v_total, players_count = v_count,
         avg_rating = case when v_rated > 0 then round(v_total / v_rated, 2) end, updated_at = now()
   where team_id = p_team;
end; $$;

-- 3. Idempotency key for submissions from the data-entry grid
alter table public.auction_transactions add column if not exists client_ref uuid;
create unique index if not exists auction_tx_client_ref on public.auction_transactions (client_ref) where client_ref is not null;

-- 4. Shadow auction scenario + richer private shortlist (watch players by name before they are entered)
alter table public.simulated_transactions drop constraint if exists simulated_transactions_scenario_check;
alter table public.simulated_transactions add constraint simulated_transactions_scenario_check check (scenario in ('A', 'B', 'C', 'S'));
alter table public.player_shortlists alter column player_id drop not null;
alter table public.player_shortlists
  add column if not exists player_name text,
  add column if not exists target_price numeric(12, 2),
  add column if not exists private_rating numeric(5, 2),
  add column if not exists high_priority boolean not null default false;
alter table public.player_shortlists drop constraint if exists player_shortlists_target;
alter table public.player_shortlists add constraint player_shortlists_target check (player_id is not null or coalesce(btrim(player_name), '') <> '');
create unique index if not exists player_shortlists_by_name on public.player_shortlists (user_id, event_id, lower(btrim(player_name))) where player_id is null;

-- 5. Data-entry operators may be assigned to ANY event (official or tracker)
create or replace function public.can_manage_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from event_members em join profiles p on p.id = em.user_id
    where em.event_id = p_event and em.user_id = auth.uid() and em.status = 'approved' and p.status = 'active'
      and ((em.role = 'auctioneer' and p.platform_role in ('auctioneer', 'super_admin')) or em.role = 'data_entry')
  );
$$;

create or replace function public.add_event_operator(p_event uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() and not exists (
    select 1 from event_members em join profiles p on p.id = em.user_id
    where em.event_id = p_event and em.user_id = auth.uid() and em.role = 'auctioneer' and em.status = 'approved' and p.platform_role in ('auctioneer', 'super_admin')
  ) then raise exception 'Only a Super Admin or the event auctioneer can assign operators' using errcode = '42501'; end if;
  if not exists (select 1 from profiles where id = p_user and status = 'active') then raise exception 'User not found or suspended'; end if;
  insert into event_members (event_id, user_id, role, status) values (p_event, p_user, 'data_entry', 'approved')
    on conflict (event_id, user_id) do update set role = 'data_entry', status = 'approved';
  insert into notifications (user_id, event_id, level, kind, title, body, created_by)
  values (p_user, p_event, 'info', 'operator', 'You are a data-entry operator', (select name from events where id = p_event), auth.uid());
  perform public.log_activity(p_event, 'operator.assigned', 'event_member', p_user::text, '{}');
end; $$;

create or replace function public.remove_event_operator(p_event uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() and not exists (
    select 1 from event_members em join profiles p on p.id = em.user_id
    where em.event_id = p_event and em.user_id = auth.uid() and em.role = 'auctioneer' and em.status = 'approved' and p.platform_role in ('auctioneer', 'super_admin')
  ) then raise exception 'Not authorized' using errcode = '42501'; end if;
  update event_members set status = 'removed' where event_id = p_event and user_id = p_user and role = 'data_entry';
  perform public.log_activity(p_event, 'operator.removed', 'event_member', p_user::text, '{}');
end; $$;

-- 6. The live entry RPC: one call = (find or create player) + (sold | unsold) atomically.
create or replace function public.record_live_entry(
  p_event uuid,
  p_name text,
  p_rating numeric default null,
  p_team uuid default null,
  p_amount numeric default null,
  p_status text default 'sold',
  p_category text default null,
  p_origin text default null,
  p_nationality text default null,
  p_base_price numeric default null,
  p_client_ref uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_key text := lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
  v_player players; v_created boolean := false; v_tx uuid; v_existing auction_transactions; v_scale numeric; v_team_name text;
begin
  if not public.can_manage_event(p_event) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if v_key = '' then raise exception 'Player name is required'; end if;
  if p_status not in ('sold', 'unsold') then raise exception 'Status must be sold or unsold'; end if;
  if (select status from auction_sessions where event_id = p_event) = 'completed' then raise exception 'Auction is completed'; end if;

  -- idempotent retry: the same submission is never recorded twice
  if p_client_ref is not null then
    select * into v_existing from auction_transactions where client_ref = p_client_ref;
    if found then
      return jsonb_build_object('transaction_id', v_existing.id, 'player_id', v_existing.player_id, 'created_player', false, 'duplicate_submission', true);
    end if;
  end if;

  select rating_scale_max into v_scale from auction_rules where event_id = p_event;
  if p_rating is not null and (p_rating < 0 or p_rating > coalesce(v_scale, 10)) then
    raise exception 'Rating % is outside the event scale (0–%)', p_rating, coalesce(v_scale, 10);
  end if;
  if p_category is not null and p_category not in (select code from player_categories) then raise exception 'Unknown category %', p_category; end if;
  if p_origin is not null and p_origin not in ('indian', 'overseas') then raise exception 'Origin must be indian or overseas'; end if;
  if p_base_price is not null and p_base_price < 0 then raise exception 'Base price cannot be negative'; end if;

  -- find or create the player (unique per event by normalised name; safe under concurrency)
  insert into players (event_id, name, category, origin, nationality, base_price, auction_status)
  values (p_event, regexp_replace(btrim(p_name), '\s+', ' ', 'g'), p_category, p_origin, nullif(btrim(coalesce(p_nationality, '')), ''), coalesce(p_base_price, 0), 'available')
  on conflict (event_id, name_key) where event_id is not null do nothing
  returning * into v_player;
  if found then
    v_created := true;
  else
    select * into v_player from players where event_id = p_event and name_key = v_key for update;
    if v_player.auction_status = 'sold' then
      -- a concurrent retry of the same submission may have just won the lock
      if p_client_ref is not null then
        select * into v_existing from auction_transactions where client_ref = p_client_ref;
        if found then return jsonb_build_object('transaction_id', v_existing.id, 'player_id', v_existing.player_id, 'created_player', false, 'duplicate_submission', true); end if;
      end if;
      select t.name into v_team_name from teams t where t.id = v_player.sold_team_id;
      raise exception '% is already recorded as sold to % for %', v_player.name, coalesce(v_team_name, 'a team'), v_player.sold_price using errcode = '23505';
    end if;
    update players set
      category = coalesce(p_category, category), origin = coalesce(p_origin, origin),
      nationality = coalesce(nullif(btrim(coalesce(p_nationality, '')), ''), nationality),
      base_price = coalesce(p_base_price, base_price)
    where id = v_player.id returning * into v_player;
  end if;

  if p_rating is not null then
    insert into player_ratings (player_id, overall, source, updated_by) values (v_player.id, p_rating, 'live entry', auth.uid())
    on conflict (player_id) do update set overall = excluded.overall, source = 'live entry', updated_by = auth.uid(), updated_at = now();
  end if;

  if p_status = 'sold' then
    if p_team is null then raise exception 'Winning team is required for a sale'; end if;
    if p_amount is null or p_amount < 0 then raise exception 'A valid sold price is required'; end if;
    v_tx := public._record_sale(p_event, v_player.id, p_team, p_amount, 'live entry');
  else
    if v_player.auction_status = 'unsold' then raise exception '% is already marked unsold', v_player.name; end if;
    insert into auction_transactions (event_id, player_id, type, note, created_by) values (p_event, v_player.id, 'unsold', 'live entry', auth.uid())
    returning id into v_tx;
    update players set auction_status = 'unsold' where id = v_player.id;
    update auction_sessions set last_transaction_id = v_tx, updated_at = now() where event_id = p_event;
    perform public.log_activity(p_event, 'transaction.unsold', 'auction_transaction', v_tx::text, jsonb_build_object('player', v_player.name));
  end if;
  if p_client_ref is not null then update auction_transactions set client_ref = p_client_ref where id = v_tx; end if;
  return jsonb_build_object('transaction_id', v_tx, 'player_id', v_player.id, 'created_player', v_created, 'duplicate_submission', false);
end; $$;

-- 7. Edit a grid row: player details and/or the official result. Result changes are a traceable void + re-record.
create or replace function public.update_live_entry(
  p_tx uuid,
  p_name text default null,
  p_rating numeric default null,
  p_clear_rating boolean default false,
  p_category text default null,
  p_origin text default null,
  p_nationality text default null,
  p_base_price numeric default null,
  p_status text default null,
  p_team uuid default null,
  p_amount numeric default null,
  p_reason text default 'correction'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v auction_transactions; v_scale numeric; v_new uuid; v_status text; v_team uuid; v_amount numeric;
begin
  select * into v from auction_transactions where id = p_tx;
  if v.id is null or not public.can_manage_event(v.event_id) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if v.status <> 'active' then raise exception 'This entry has already been reversed'; end if;
  select rating_scale_max into v_scale from auction_rules where event_id = v.event_id;
  if p_rating is not null and (p_rating < 0 or p_rating > coalesce(v_scale, 10)) then
    raise exception 'Rating % is outside the event scale (0–%)', p_rating, coalesce(v_scale, 10);
  end if;

  update players set
    name = coalesce(nullif(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), ''), name),
    category = case when p_category = '' then null else coalesce(p_category, category) end,
    origin = case when p_origin = '' then null else coalesce(p_origin, origin) end,
    nationality = case when p_nationality = '' then null else coalesce(p_nationality, nationality) end,
    base_price = coalesce(p_base_price, base_price)
  where id = v.player_id;
  if p_clear_rating then delete from player_ratings where player_id = v.player_id;
  elsif p_rating is not null then
    insert into player_ratings (player_id, overall, source, updated_by) values (v.player_id, p_rating, 'live entry', auth.uid())
    on conflict (player_id) do update set overall = excluded.overall, source = 'live entry (edited)', updated_by = auth.uid(), updated_at = now();
  end if;

  v_status := coalesce(p_status, case when v.type = 'sale' then 'sold' else 'unsold' end);
  v_team := coalesce(p_team, v.team_id);
  v_amount := coalesce(p_amount, v.amount);
  if (v_status = 'sold' and v.type = 'sale' and v_team is not distinct from v.team_id and v_amount is not distinct from v.amount)
     or (v_status = 'unsold' and v.type = 'unsold') then
    -- only player details changed; scores depend on ratings, so refresh the owning team
    if v.type = 'sale' then perform public.recompute_team(v.team_id); end if;
    perform public.log_activity(v.event_id, 'entry.edited', 'player', v.player_id::text, jsonb_build_object('name', p_name, 'rating', p_rating));
    return v.id;
  end if;

  perform public._void_transaction(p_tx, p_reason);
  if v_status = 'sold' then
    v_new := public._record_sale(v.event_id, v.player_id, v_team, v_amount, 'Correction of ' || p_tx::text);
  else
    insert into auction_transactions (event_id, player_id, type, note, created_by) values (v.event_id, v.player_id, 'unsold', 'Correction of ' || p_tx::text, auth.uid())
    returning id into v_new;
    update players set auction_status = 'unsold' where id = v.player_id;
  end if;
  perform public.log_activity(v.event_id, 'entry.corrected', 'auction_transaction', v_new::text, jsonb_build_object('from', p_tx, 'reason', p_reason));
  return v_new;
end; $$;

-- 8. Sales tolerate an unknown purse (no overspend check until the purse is set)
create or replace function public._record_sale(p_event uuid, p_player uuid, p_team uuid, p_amount numeric, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_player players; v_fin team_financials; v_rules auction_rules; v_tx uuid; c record; v_cnt int;
begin
  select * into v_player from players where id = p_player and event_id = p_event for update;
  if not found then raise exception 'Player not in this event' using errcode = 'P0002'; end if;
  if v_player.auction_status = 'sold' then raise exception 'Player % is already sold', v_player.name using errcode = '23505'; end if;
  if v_player.auction_status = 'withdrawn' then raise exception 'Player % is withdrawn', v_player.name; end if;
  if p_amount is null or p_amount < v_player.base_price then
    raise exception 'Winning bid % is below base price %', p_amount, v_player.base_price;
  end if;
  select * into v_fin from team_financials where team_id = p_team and event_id = p_event for update;
  if not found then raise exception 'Team not in this event' using errcode = 'P0002'; end if;
  select * into v_rules from auction_rules where event_id = p_event;
  if not v_rules.allow_overspend and v_fin.remaining is not null and v_fin.remaining < p_amount then
    raise exception 'Insufficient purse: remaining %, bid %', v_fin.remaining, p_amount using errcode = '23514';
  end if;
  if v_fin.players_count + 1 > v_rules.squad_max then
    raise exception 'Squad is full (max %)', v_rules.squad_max using errcode = '23514';
  end if;
  if v_rules.enforce_max_constraints and v_player.category is not null and v_player.origin is not null then
    for c in select * from rule_constraints rc where rc.event_id = p_event and rc.max_count is not null
               and (rc.category is null or rc.category = v_player.category) and (rc.origin is null or rc.origin = v_player.origin) loop
      select count(*) into v_cnt from team_rosters tr join players p on p.id = tr.player_id
       where tr.team_id = p_team and (c.category is null or p.category = c.category) and (c.origin is null or p.origin = c.origin);
      if v_cnt + 1 > c.max_count then
        raise exception 'Sale would exceed rule "%" (max %)', c.label, c.max_count using errcode = '23514';
      end if;
    end loop;
  end if;
  update auction_transactions set status = 'voided', voided_at = now(), voided_by = auth.uid(), voided_reason = 're-auctioned'
   where player_id = p_player and status = 'active' and type = 'unsold';
  insert into auction_transactions (event_id, player_id, team_id, amount, type, note, created_by)
  values (p_event, p_player, p_team, p_amount, 'sale', p_note, auth.uid()) returning id into v_tx;
  insert into team_rosters (player_id, event_id, team_id, transaction_id, price) values (p_player, p_event, p_team, v_tx, p_amount);
  update players set auction_status = 'sold', sold_team_id = p_team, sold_price = p_amount where id = p_player;
  perform public.recompute_team(p_team);
  update auction_sessions set last_transaction_id = v_tx, bidding_open = false, current_bid = p_amount,
         current_bid_team_id = p_team, updated_at = now() where event_id = p_event;
  perform public.log_activity(p_event, 'transaction.sale', 'auction_transaction', v_tx::text,
    jsonb_build_object('player', v_player.name, 'team', p_team, 'amount', p_amount));
  return v_tx;
end; $$;

-- Function privileges (anon gets nothing; internals stay private)
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.promote_super_admin(text) from public, anon, authenticated;
revoke execute on function public._record_sale(uuid, uuid, uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public._void_transaction(uuid, text) from public, anon, authenticated;
revoke execute on function public.recompute_team(uuid) from public, anon, authenticated;
revoke execute on function public.log_activity(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- Realtime: player rating edits must reach every dashboard
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.player_ratings; exception when duplicate_object then null; end;
  end if;
end $$;

-- Rule editing: Super Admin, or an auctioneer when allowed, or a tracker's data-entry crew.
-- Data-entry operators on official events record results but cannot change the rules.
create or replace function public.can_edit_rules(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from event_members em join profiles p on p.id = em.user_id join events e on e.id = em.event_id
    where em.event_id = p_event and em.user_id = auth.uid() and em.status = 'approved' and p.status = 'active'
      and (
        (em.role = 'auctioneer' and p.platform_role in ('auctioneer', 'super_admin') and e.auctioneer_can_edit_rules)
        or (em.role = 'data_entry' and e.mode = 'tracker')
      )
  );
$$;
