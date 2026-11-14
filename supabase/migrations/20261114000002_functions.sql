-- =====================================================================
-- AUCTION IQ — authorization helpers, triggers and atomic auction RPCs
-- =====================================================================

-- ---------------------------------------------------------------------
-- Authorization helpers (security definer so they can be used inside RLS
-- without recursive policy evaluation)
-- ---------------------------------------------------------------------
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and platform_role = 'super_admin' and status = 'active');
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.is_auctioneer_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and platform_role in ('auctioneer', 'super_admin') and status = 'active');
$$;

create or replace function public.can_manage_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from event_members em join profiles p on p.id = em.user_id
    where em.event_id = p_event and em.user_id = auth.uid() and em.role = 'auctioneer'
      and em.status = 'approved' and p.status = 'active' and p.platform_role in ('auctioneer', 'super_admin')
  );
$$;

create or replace function public.is_event_member(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_manage_event(p_event) or exists (
    select 1 from event_members em join profiles p on p.id = em.user_id
    where em.event_id = p_event and em.user_id = auth.uid() and em.status = 'approved' and p.status = 'active'
  );
$$;

create or replace function public.can_edit_rules(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or (public.can_manage_event(p_event)
    and coalesce((select auctioneer_can_edit_rules from events where id = p_event), false));
$$;

create or replace function public.my_team_id(p_event uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from team_members where event_id = p_event and user_id = auth.uid() limit 1;
$$;

create or replace function public.has_permission(p_permission text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p join role_permissions rp on rp.role = p.platform_role
    where p.id = auth.uid() and p.status = 'active' and rp.permission = p_permission
  );
$$;

create or replace function public.log_activity(p_event uuid, p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into activity_logs (event_id, actor_id, action, entity, entity_id, details)
  values (p_event, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'));
$$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();
create trigger players_touch before update on public.players for each row execute function public.touch_updated_at();
create trigger rules_touch before update on public.auction_rules for each row execute function public.touch_updated_at();
create trigger workspace_touch before update on public.private_participant_workspaces for each row execute function public.touch_updated_at();
create trigger notes_touch before update on public.private_notes for each row execute function public.touch_updated_at();
create trigger obs_touch before update on public.competitor_observations for each row execute function public.touch_updated_at();

-- New auth user -> profile. Everyone starts as participant; auctioneer access needs Super Admin approval.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into profiles (id, email, full_name, phone, college, city, state, avatar_url, requested_role)
  values (
    new.id, coalesce(new.email, ''),
    coalesce(m ->> 'full_name', m ->> 'name', ''),
    nullif(m ->> 'phone', ''), nullif(m ->> 'college', ''), nullif(m ->> 'city', ''), nullif(m ->> 'state', ''),
    nullif(m ->> 'avatar_url', ''),
    case when m ->> 'requested_role' = 'auctioneer' then 'auctioneer' else 'participant' end
  ) on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Only Super Admins (or the backend with no JWT) may change roles / status.
create or replace function public.guard_profile_privileges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    if new.platform_role is distinct from old.platform_role or new.status is distinct from old.status
       or new.email is distinct from old.email or new.id is distinct from old.id then
      raise exception 'Only a Super Admin can change role, status or email' using errcode = '42501';
    end if;
  end if;
  return new;
end; $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile_privileges();

-- New event -> rules, session, creator log.
create or replace function public.handle_new_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare d jsonb := coalesce((select value from platform_settings where key = 'default_rules'), '{}'::jsonb);
begin
  insert into auction_rules (event_id, squad_min, squad_max, bid_increment, ranking_formula, require_complete_squad)
  values (new.id, coalesce((d ->> 'squad_min')::int, 9), coalesce((d ->> 'squad_max')::int, 9),
          coalesce((d ->> 'bid_increment')::numeric, 0.25), coalesce(d ->> 'ranking_formula', 'average'),
          coalesce((d ->> 'require_complete_squad')::boolean, true));
  insert into auction_sessions (event_id) values (new.id);
  perform public.log_activity(new.id, 'event.created', 'event', new.id::text, jsonb_build_object('name', new.name));
  return new;
end; $$;
create trigger on_event_created after insert on public.events for each row execute function public.handle_new_event();

-- New team -> financial + score rows. Purse change -> recompute.
create or replace function public.handle_team_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into team_financials (team_id, event_id, initial_purse, remaining) values (new.id, new.event_id, new.initial_purse, new.initial_purse);
    insert into team_scores (team_id, event_id) values (new.id, new.event_id);
  elsif new.initial_purse is distinct from old.initial_purse then
    perform public.recompute_team(new.id);
  end if;
  return new;
end; $$;

-- ---------------------------------------------------------------------
-- Derived state: always rebuilt from authoritative active transactions
-- ---------------------------------------------------------------------
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

create trigger on_team_change after insert or update on public.teams for each row execute function public.handle_team_change();

create or replace function public.recompute_event(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if not public.can_manage_event(p_event) and auth.uid() is not null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  for t in select id from teams where event_id = p_event loop perform public.recompute_team(t.id); end loop;
end; $$;

-- ---------------------------------------------------------------------
-- Event joining
-- ---------------------------------------------------------------------
create or replace function public.preview_event_by_code(p_code text)
returns table (id uuid, name text, organization text, venue text, starts_at timestamptz, status text,
               requires_approval boolean, team_selection text, teams_count bigint, membership_status text)
language sql stable security definer set search_path = public as $$
  select e.id, e.name, o.name, e.venue, e.starts_at, e.status, e.requires_approval, e.team_selection,
         (select count(*) from teams t where t.event_id = e.id),
         (select em.status from event_members em where em.event_id = e.id and em.user_id = auth.uid())
    from events e left join organizations o on o.id = e.organization_id
   where upper(e.invite_code) = upper(trim(p_code)) and e.is_active and e.status <> 'archived'
     and auth.uid() is not null;
$$;

create or replace function public.join_event(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare v_event events; v_status text;
begin
  if not public.is_active_user() then raise exception 'Account is not active' using errcode = '42501'; end if;
  select * into v_event from events where upper(invite_code) = upper(trim(p_code)) and is_active and status <> 'archived';
  if not found then raise exception 'Invalid or inactive invitation code' using errcode = 'P0002'; end if;
  select status into v_status from event_members where event_id = v_event.id and user_id = auth.uid();
  if found then
    if v_status = 'removed' or v_status = 'rejected' then
      raise exception 'Your access to this event was revoked. Contact the organiser.' using errcode = '42501';
    end if;
    return v_status;
  end if;
  v_status := case when v_event.requires_approval then 'pending' else 'approved' end;
  insert into event_members (event_id, user_id, role, status) values (v_event.id, auth.uid(), 'participant', v_status);
  insert into private_participant_workspaces (user_id, event_id) values (auth.uid(), v_event.id) on conflict do nothing;
  perform public.log_activity(v_event.id, 'member.joined', 'event_member', auth.uid()::text, jsonb_build_object('status', v_status));
  return v_status;
end; $$;

-- Request to join a public event discovered in the listing (no code needed; always respects approval setting)
create or replace function public.request_join_event(p_event uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  select invite_code into v_code from events where id = p_event and visibility = 'public' and is_active;
  if v_code is null then raise exception 'Event not open for requests' using errcode = 'P0002'; end if;
  return public.join_event(v_code);
end; $$;

create or replace function public.claim_team(p_event uuid, p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_event events;
begin
  select * into v_event from events where id = p_event;
  if not exists (select 1 from event_members where event_id = p_event and user_id = auth.uid() and status = 'approved' and role = 'participant') then
    raise exception 'You must be an approved participant of this event' using errcode = '42501';
  end if;
  if v_event.team_selection <> 'self_select' then raise exception 'Teams are assigned by the organiser' using errcode = '42501'; end if;
  perform 1 from teams where id = p_team and event_id = p_event for update; -- serialise claims on the team
  if not found then raise exception 'Team not in this event'; end if;
  if exists (select 1 from team_members where team_id = p_team and role = 'owner') then
    raise exception 'Team already claimed' using errcode = '23505';
  end if;
  if exists (select 1 from team_members where event_id = p_event and user_id = auth.uid()) then
    raise exception 'You already have a team in this event' using errcode = '23505';
  end if;
  insert into team_members (team_id, user_id, event_id, role) values (p_team, auth.uid(), p_event, 'owner');
  perform public.log_activity(p_event, 'team.claimed', 'team', p_team::text, '{}');
end; $$;

create or replace function public.assign_team(p_event uuid, p_user uuid, p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_event(p_event) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_team is not null and not exists (select 1 from teams where id = p_team and event_id = p_event) then
    raise exception 'Team not in this event';
  end if;
  delete from team_members where event_id = p_event and user_id = p_user;
  if p_team is not null then
    delete from team_members where team_id = p_team and role = 'owner';
    insert into team_members (team_id, user_id, event_id, role) values (p_team, p_user, p_event, 'owner');
    insert into event_members (event_id, user_id, role, status) values (p_event, p_user, 'participant', 'approved')
      on conflict (event_id, user_id) do update set status = 'approved';
    insert into private_participant_workspaces (user_id, event_id) values (p_user, p_event) on conflict do nothing;
  end if;
  perform public.log_activity(p_event, 'team.assigned', 'team', coalesce(p_team::text, ''), jsonb_build_object('user', p_user));
end; $$;

create or replace function public.set_member_status(p_event uuid, p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_event(p_event) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_status not in ('approved', 'rejected', 'removed', 'pending') then raise exception 'Invalid status'; end if;
  update event_members set status = p_status where event_id = p_event and user_id = p_user;
  if p_status in ('rejected', 'removed') then delete from team_members where event_id = p_event and user_id = p_user; end if;
  insert into notifications (user_id, event_id, level, kind, title, body, created_by)
  values (p_user, p_event, case when p_status = 'approved' then 'success' else 'warning' end, 'membership',
          'Event membership ' || p_status, (select name from events where id = p_event), auth.uid());
  perform public.log_activity(p_event, 'member.' || p_status, 'event_member', p_user::text, '{}');
end; $$;

create or replace function public.add_event_auctioneer(p_event uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Only a Super Admin can assign auctioneers' using errcode = '42501'; end if;
  if not exists (select 1 from profiles where id = p_user and platform_role in ('auctioneer', 'super_admin')) then
    raise exception 'User does not have auctioneer permissions';
  end if;
  insert into event_members (event_id, user_id, role, status) values (p_event, p_user, 'auctioneer', 'approved')
    on conflict (event_id, user_id) do update set role = 'auctioneer', status = 'approved';
  perform public.log_activity(p_event, 'auctioneer.assigned', 'event_member', p_user::text, '{}');
end; $$;

-- ---------------------------------------------------------------------
-- Live auction RPCs — all official writes go through these atomic functions
-- ---------------------------------------------------------------------
create or replace function public.set_session_status(p_event uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_event(p_event) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_status not in ('not_started', 'live', 'paused', 'completed') then raise exception 'Invalid status'; end if;
  update auction_sessions set status = p_status, updated_at = now(),
         started_at = coalesce(started_at, case when p_status = 'live' then now() end),
         bidding_open = case when p_status = 'live' then bidding_open else false end
   where event_id = p_event;
  update events set status = case p_status when 'live' then 'live' when 'paused' then 'live' when 'completed' then 'completed' else status end,
         completed_at = case when p_status = 'completed' then now() else null end
   where id = p_event;
  insert into notifications (event_id, level, kind, title, created_by)
  values (p_event, 'info', 'session', 'Auction ' || replace(p_status, '_', ' '), auth.uid());
  perform public.log_activity(p_event, 'session.' || p_status, 'auction_session', p_event::text, '{}');
end; $$;

create or replace function public.set_current_player(p_event uuid, p_player uuid, p_open boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.can_manage_event(p_event) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_player is not null then
    select auction_status into v_status from players where id = p_player and event_id = p_event for update;
    if not found then raise exception 'Player not in this event'; end if;
    if v_status in ('sold', 'withdrawn') then raise exception 'Player is already %', v_status; end if;
    update players set auction_status = 'available' where id = p_player;
  end if;
  update auction_sessions set current_player_id = p_player, bidding_open = p_player is not null and p_open,
         current_bid = null, current_bid_team_id = null, updated_at = now()
   where event_id = p_event;
  perform public.log_activity(p_event, 'session.current_player', 'player', coalesce(p_player::text, ''), '{}');
end; $$;

-- Optional: auctioneer publishes the running bid shown in the room (manually entered — never auto-detected).
create or replace function public.publish_bid(p_event uuid, p_amount numeric, p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_event(p_event) then raise exception 'Not authorized' using errcode = '42501'; end if;
  update auction_sessions set current_bid = p_amount, current_bid_team_id = p_team, updated_at = now() where event_id = p_event;
end; $$;

create or replace function public.publish_announcement(p_event uuid, p_title text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_event(p_event) then raise exception 'Not authorized' using errcode = '42501'; end if;
  update auction_sessions set announcement = p_title, updated_at = now() where event_id = p_event;
  insert into notifications (event_id, level, kind, title, body, created_by) values (p_event, 'info', 'announcement', p_title, p_body, auth.uid());
  perform public.log_activity(p_event, 'announcement', 'event', p_event::text, jsonb_build_object('title', p_title));
end; $$;

create or replace function public._record_sale(p_event uuid, p_player uuid, p_team uuid, p_amount numeric, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_player players; v_fin team_financials; v_rules auction_rules; v_tx uuid; c record; v_cnt int;
begin
  -- Row locks serialise concurrent sales of the same player and the same team purse.
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
  if not v_rules.allow_overspend and v_fin.remaining < p_amount then
    raise exception 'Insufficient purse: remaining %, bid %', v_fin.remaining, p_amount using errcode = '23514';
  end if;
  if v_fin.players_count + 1 > v_rules.squad_max then
    raise exception 'Squad is full (max %)', v_rules.squad_max using errcode = '23514';
  end if;
  if v_rules.enforce_max_constraints then
    for c in select * from rule_constraints rc where rc.event_id = p_event and rc.max_count is not null
               and (rc.category is null or rc.category = v_player.category) and (rc.origin is null or rc.origin = v_player.origin) loop
      select count(*) into v_cnt from team_rosters tr join players p on p.id = tr.player_id
       where tr.team_id = p_team and (c.category is null or p.category = c.category) and (c.origin is null or p.origin = c.origin);
      if v_cnt + 1 > c.max_count then
        raise exception 'Sale would exceed rule "%" (max %)', c.label, c.max_count using errcode = '23514';
      end if;
    end loop;
  end if;
  -- An unsold player may be re-auctioned: retire its unsold record first.
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

create or replace function public.record_sale(p_event uuid, p_player uuid, p_team uuid, p_amount numeric, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_event(p_event) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if (select status from auction_sessions where event_id = p_event) = 'completed' then
    raise exception 'Auction is completed';
  end if;
  return public._record_sale(p_event, p_player, p_team, p_amount, p_note);
end; $$;

create or replace function public.mark_unsold(p_event uuid, p_player uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_status text; v_tx uuid;
begin
  if not public.can_manage_event(p_event) then raise exception 'Not authorized' using errcode = '42501'; end if;
  select auction_status into v_status from players where id = p_player and event_id = p_event for update;
  if not found then raise exception 'Player not in this event'; end if;
  if v_status = 'sold' then raise exception 'Player is sold; undo or correct the sale instead'; end if;
  if v_status = 'unsold' then raise exception 'Player is already unsold'; end if;
  insert into auction_transactions (event_id, player_id, type, note, created_by) values (p_event, p_player, 'unsold', p_note, auth.uid())
  returning id into v_tx;
  update players set auction_status = 'unsold' where id = p_player;
  update auction_sessions set last_transaction_id = v_tx, bidding_open = false, updated_at = now() where event_id = p_event;
  perform public.log_activity(p_event, 'transaction.unsold', 'auction_transaction', v_tx::text, jsonb_build_object('player', p_player));
  return v_tx;
end; $$;

create or replace function public._void_transaction(p_tx uuid, p_reason text) returns auction_transactions
language plpgsql security definer set search_path = public as $$
declare v auction_transactions;
begin
  select * into v from auction_transactions where id = p_tx for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v.status = 'voided' then raise exception 'Transaction already voided'; end if;
  perform 1 from players where id = v.player_id for update;
  update auction_transactions set status = 'voided', voided_at = now(), voided_by = auth.uid(), voided_reason = p_reason where id = p_tx;
  if v.type = 'sale' then
    delete from team_rosters where transaction_id = p_tx;
    update players set auction_status = 'available', sold_team_id = null, sold_price = null where id = v.player_id;
    perform public.recompute_team(v.team_id);
  else
    update players set auction_status = 'available' where id = v.player_id;
  end if;
  perform public.log_activity(v.event_id, 'transaction.voided', 'auction_transaction', p_tx::text,
    jsonb_build_object('reason', p_reason, 'type', v.type, 'team', v.team_id, 'amount', v.amount));
  return v;
end; $$;

create or replace function public.void_transaction(p_tx uuid, p_reason text default 'corrected') returns void
language plpgsql security definer set search_path = public as $$
declare v_event uuid;
begin
  select event_id into v_event from auction_transactions where id = p_tx;
  if v_event is null or not public.can_manage_event(v_event) then raise exception 'Not authorized' using errcode = '42501'; end if;
  perform public._void_transaction(p_tx, p_reason);
end; $$;

create or replace function public.undo_last_transaction(p_event uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_tx uuid;
begin
  if not public.can_manage_event(p_event) then raise exception 'Not authorized' using errcode = '42501'; end if;
  select id into v_tx from auction_transactions where event_id = p_event and status = 'active' order by seq desc limit 1 for update;
  if v_tx is null then raise exception 'Nothing to undo'; end if;
  perform public._void_transaction(v_tx, 'undo');
  return v_tx;
end; $$;

-- Correct an official sale (wrong team or amount) atomically: void + re-record.
create or replace function public.correct_sale(p_tx uuid, p_team uuid, p_amount numeric, p_reason text default 'correction')
returns uuid language plpgsql security definer set search_path = public as $$
declare v auction_transactions;
begin
  select * into v from auction_transactions where id = p_tx;
  if v.id is null or not public.can_manage_event(v.event_id) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if v.type <> 'sale' then raise exception 'Only sales can be corrected'; end if;
  perform public._void_transaction(p_tx, p_reason);
  return public._record_sale(v.event_id, v.player_id, p_team, p_amount, 'Correction of ' || p_tx::text);
end; $$;

-- ---------------------------------------------------------------------
-- Rules: replace an event's constraint set atomically
-- ---------------------------------------------------------------------
create or replace function public.save_event_rules(p_event uuid, p_rules jsonb, p_constraints jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare c jsonb; i int := 0;
begin
  if not public.can_edit_rules(p_event) then raise exception 'Not authorized to edit rules' using errcode = '42501'; end if;
  update auction_rules set
    squad_min = coalesce((p_rules ->> 'squad_min')::int, squad_min),
    squad_max = coalesce((p_rules ->> 'squad_max')::int, squad_max),
    min_player_price = case when p_rules ? 'min_player_price' then nullif(p_rules ->> 'min_player_price', '')::numeric else min_player_price end,
    bid_increment = coalesce((p_rules ->> 'bid_increment')::numeric, bid_increment),
    require_complete_squad = coalesce((p_rules ->> 'require_complete_squad')::boolean, require_complete_squad),
    enforce_max_constraints = coalesce((p_rules ->> 'enforce_max_constraints')::boolean, enforce_max_constraints),
    allow_overspend = coalesce((p_rules ->> 'allow_overspend')::boolean, allow_overspend),
    ranking_formula = coalesce(p_rules ->> 'ranking_formula', ranking_formula),
    weights = coalesce(p_rules -> 'weights', weights),
    rating_scale_max = coalesce((p_rules ->> 'rating_scale_max')::numeric, rating_scale_max),
    updated_by = auth.uid()
  where event_id = p_event;
  if p_constraints is not null then
    delete from rule_constraints where event_id = p_event;
    for c in select * from jsonb_array_elements(p_constraints) loop
      insert into rule_constraints (event_id, label, category, origin, min_count, max_count, sort)
      values (p_event, c ->> 'label', nullif(c ->> 'category', ''), nullif(c ->> 'origin', ''),
              nullif(c ->> 'min', '')::int, nullif(c ->> 'max', '')::int, i);
      i := i + 1;
    end loop;
  end if;
  perform public.log_activity(p_event, 'rules.updated', 'auction_rules', p_event::text, jsonb_build_object('rules', p_rules, 'constraints', p_constraints));
end; $$;

-- Copy players from the global library into an event.
create or replace function public.import_library_players(p_event uuid, p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; src record; v_new uuid;
begin
  if not public.can_manage_event(p_event) then raise exception 'Not authorized' using errcode = '42501'; end if;
  for src in select * from players where id = any (p_ids) and event_id is null loop
    if exists (select 1 from players where event_id = p_event and library_player_id = src.id) then continue; end if;
    insert into players (event_id, library_player_id, name, photo_url, nationality, origin, category, secondary_category,
                         batting_style, bowling_style, base_price, special_abilities)
    values (p_event, src.id, src.name, src.photo_url, src.nationality, src.origin, src.category, src.secondary_category,
            src.batting_style, src.bowling_style, src.base_price, src.special_abilities)
    returning id into v_new;
    insert into player_ratings (player_id, overall, batting, bowling, fielding, wicketkeeping, consistency, experience, source, updated_by)
    select v_new, overall, batting, bowling, fielding, wicketkeeping, consistency, experience, source, auth.uid()
      from player_ratings where player_id = src.id;
    n := n + 1;
  end loop;
  perform public.log_activity(p_event, 'players.imported_from_library', 'players', null, jsonb_build_object('count', n));
  return n;
end; $$;

-- ---------------------------------------------------------------------
-- Super Admin
-- ---------------------------------------------------------------------
create or replace function public.admin_set_user(p_user uuid, p_role text, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_user = auth.uid() and (p_role <> 'super_admin' or p_status <> 'active') then
    raise exception 'You cannot demote or suspend yourself';
  end if;
  update profiles set platform_role = coalesce(p_role, platform_role), status = coalesce(p_status, status) where id = p_user;
  perform public.log_activity(null, 'user.updated', 'profile', p_user::text, jsonb_build_object('role', p_role, 'status', p_status));
end; $$;

create or replace function public.admin_platform_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Not authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users', (select count(*) from profiles),
    'participants', (select count(*) from profiles where platform_role = 'participant'),
    'auctioneers', (select count(*) from profiles where platform_role = 'auctioneer'),
    'pending_auctioneers', (select count(*) from profiles where requested_role = 'auctioneer' and platform_role = 'participant'),
    'suspended', (select count(*) from profiles where status = 'suspended'),
    'active_events', (select count(*) from events where is_active and status in ('upcoming', 'live')),
    'live_events', (select count(*) from events where status = 'live'),
    'completed_events', (select count(*) from events where status = 'completed'),
    'upcoming_events', (select count(*) from events where status = 'upcoming'),
    'teams', (select count(*) from teams),
    'players', (select count(*) from players where event_id is not null),
    'library_players', (select count(*) from players where event_id is null),
    'active_sessions', (select count(*) from auction_sessions where status in ('live', 'paused')),
    'transactions', (select count(*) from auction_transactions where status = 'active'),
    'registrations', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d) from (
        select date_trunc('day', created_at)::date d, count(*) c from profiles
         where created_at > now() - interval '30 days' group by 1) x), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d) from (
        select date_trunc('day', created_at)::date d, count(*) c from activity_logs
         where created_at > now() - interval '30 days' group by 1) x), '[]'::jsonb)
  );
end; $$;

-- Bootstrap: run from the SQL editor (service role) to create the first Super Admin.
create or replace function public.promote_super_admin(p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set platform_role = 'super_admin', status = 'active' where lower(email) = lower(p_email);
  if not found then raise exception 'No profile with email %', p_email; end if;
end; $$;

-- ---------------------------------------------------------------------
-- Function privileges. Signed-out (anon) clients may not call any RPC;
-- internal helpers are not callable by clients at all.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.promote_super_admin(text) from public, anon, authenticated;
revoke execute on function public._record_sale(uuid, uuid, uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public._void_transaction(uuid, text) from public, anon, authenticated;
revoke execute on function public.recompute_team(uuid) from public, anon, authenticated;
revoke execute on function public.log_activity(uuid, text, text, text, jsonb) from public, anon, authenticated;
