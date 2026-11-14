-- =====================================================================
-- AUCTION IQ — Tracker mode & crews
-- A participant can create a private "tracker" for an auction that is run
-- OUTSIDE this app. They invite teammates (a crew) and assign roles:
--   data_entry : records results, teams, players and rules for the tracker
--   analyst    : read-only live insights (cannot change any data)
-- The tracker owner manages the crew. Trackers are never publicly listed.
-- =====================================================================

alter table public.events
  add column if not exists mode text not null default 'official' check (mode in ('official', 'tracker')),
  add column if not exists owner_id uuid references public.profiles (id) on delete set null,
  add column if not exists tracker_team_id uuid references public.teams (id) on delete set null;

alter table public.event_members drop constraint if exists event_members_role_check;
alter table public.event_members add constraint event_members_role_check
  check (role in ('auctioneer', 'participant', 'data_entry', 'analyst'));

-- Managers of an event: Super Admin, approved auctioneers, or a tracker's data-entry crew member.
create or replace function public.can_manage_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from event_members em
      join profiles p on p.id = em.user_id
      join events e on e.id = em.event_id
    where em.event_id = p_event and em.user_id = auth.uid() and em.status = 'approved' and p.status = 'active'
      and (
        (em.role = 'auctioneer' and p.platform_role in ('auctioneer', 'super_admin'))
        or (em.role = 'data_entry' and e.mode = 'tracker')
      )
  );
$$;

create or replace function public.is_tracker_owner(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events where id = p_event and mode = 'tracker' and owner_id = auth.uid())
      or public.is_super_admin();
$$;

-- ---------------------------------------------------------------------
-- Create a tracker in one atomic step.
-- p_competitors: newline/comma separated competitor team names.
-- p_template: optional rule_templates.id to copy rules from.
-- ---------------------------------------------------------------------
create or replace function public.create_tracker(
  p_name text, p_my_team text, p_competitors text[], p_purse numeric, p_currency text default 'Cr',
  p_template uuid default null, p_squad_min int default null, p_squad_max int default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_event uuid; v_team uuid; c text; tpl jsonb; i int := 0;
begin
  if not public.is_active_user() then raise exception 'Account is not active' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_my_team), '') = '' then raise exception 'Tracker name and your team name are required'; end if;
  if p_purse is null or p_purse < 0 then raise exception 'Purse must be zero or more'; end if;
  if (select count(*) from events where owner_id = auth.uid() and mode = 'tracker' and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many trackers created today';
  end if;

  insert into events (name, mode, owner_id, visibility, requires_approval, team_selection, currency, default_purse,
                      auctioneer_can_edit_rules, status, created_by, description)
  values (trim(p_name), 'tracker', auth.uid(), 'unlisted', false, 'admin_assign', coalesce(nullif(trim(p_currency), ''), 'Cr'),
          p_purse, true, 'live', auth.uid(), 'Private tracker for an auction run outside AUCTION IQ')
  returning id into v_event;

  insert into teams (event_id, name, short_name, initial_purse) values (v_event, trim(p_my_team), left(upper(regexp_replace(trim(p_my_team), '[^A-Za-z0-9]', '', 'g')), 4), p_purse)
  returning id into v_team;
  update events set tracker_team_id = v_team where id = v_event;

  foreach c in array coalesce(p_competitors, '{}') loop
    c := trim(c);
    if c = '' or lower(c) = lower(trim(p_my_team)) then continue; end if;
    insert into teams (event_id, name, short_name, initial_purse)
    values (v_event, c, left(upper(regexp_replace(c, '[^A-Za-z0-9]', '', 'g')), 4), p_purse)
    on conflict (event_id, name) do nothing;
  end loop;

  insert into event_members (event_id, user_id, role, status) values (v_event, auth.uid(), 'data_entry', 'approved');
  insert into team_members (team_id, user_id, event_id, role) values (v_team, auth.uid(), v_event, 'owner');
  insert into private_participant_workspaces (user_id, event_id) values (auth.uid(), v_event) on conflict do nothing;
  update auction_sessions set status = 'live', started_at = now() where event_id = v_event;

  -- Trackers record what really happened elsewhere, so they warn instead of blocking on rules/overspend.
  update auction_rules set enforce_max_constraints = false, allow_overspend = true where event_id = v_event;

  if p_template is not null then
    select config into tpl from rule_templates where id = p_template;
    if tpl is not null then
      update auction_rules set
        squad_min = coalesce((tpl -> 'rules' ->> 'squad_min')::int, squad_min),
        squad_max = coalesce((tpl -> 'rules' ->> 'squad_max')::int, squad_max),
        bid_increment = coalesce((tpl -> 'rules' ->> 'bid_increment')::numeric, bid_increment),
        ranking_formula = coalesce(tpl -> 'rules' ->> 'ranking_formula', ranking_formula),
        require_complete_squad = coalesce((tpl -> 'rules' ->> 'require_complete_squad')::boolean, require_complete_squad)
      where event_id = v_event;
      for c in select * from jsonb_array_elements(tpl -> 'constraints') loop
        insert into rule_constraints (event_id, label, category, origin, min_count, max_count, sort)
        values (v_event, c::jsonb ->> 'label', nullif(c::jsonb ->> 'category', ''), nullif(c::jsonb ->> 'origin', ''),
                nullif(c::jsonb ->> 'min', '')::int, nullif(c::jsonb ->> 'max', '')::int, i);
        i := i + 1;
      end loop;
    end if;
  end if;
  if p_squad_min is not null or p_squad_max is not null then
    update auction_rules set squad_min = coalesce(p_squad_min, squad_min), squad_max = greatest(coalesce(p_squad_max, squad_max), coalesce(p_squad_min, squad_min))
     where event_id = v_event;
  end if;

  perform public.log_activity(v_event, 'tracker.created', 'event', v_event::text, jsonb_build_object('name', p_name));
  return v_event;
end; $$;

-- Joining a tracker with its crew code makes you a read-only analyst on the owner's team.
create or replace function public.join_event(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare v_event events; v_status text; v_role text;
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
  v_role := case when v_event.mode = 'tracker' then 'analyst' else 'participant' end;
  insert into event_members (event_id, user_id, role, status) values (v_event.id, auth.uid(), v_role, v_status);
  if v_event.mode = 'tracker' and v_event.tracker_team_id is not null then
    insert into team_members (team_id, user_id, event_id, role) values (v_event.tracker_team_id, auth.uid(), v_event.id, 'member')
    on conflict do nothing;
  end if;
  insert into private_participant_workspaces (user_id, event_id) values (auth.uid(), v_event.id) on conflict do nothing;
  perform public.log_activity(v_event.id, 'member.joined', 'event_member', auth.uid()::text, jsonb_build_object('status', v_status, 'role', v_role));
  return v_status;
end; $$;

-- Crew listing (names are visible only to fellow crew members).
create or replace function public.get_crew(p_event uuid)
returns table (user_id uuid, full_name text, email text, college text, role text, status text, is_owner boolean, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select em.user_id, p.full_name, p.email, p.college, em.role, em.status, (e.owner_id = em.user_id), em.joined_at
    from event_members em join profiles p on p.id = em.user_id join events e on e.id = em.event_id
   where em.event_id = p_event and e.mode = 'tracker' and public.is_event_member(p_event)
   order by (e.owner_id = em.user_id) desc, em.joined_at;
$$;

create or replace function public.set_crew_role(p_event uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_tracker_owner(p_event) then raise exception 'Only the tracker owner can change crew roles' using errcode = '42501'; end if;
  if p_role not in ('data_entry', 'analyst') then raise exception 'Role must be data_entry or analyst'; end if;
  update event_members set role = p_role where event_id = p_event and user_id = p_user and status = 'approved';
  if not found then raise exception 'Crew member not found'; end if;
  insert into notifications (user_id, event_id, level, kind, title, body, created_by)
  values (p_user, p_event, 'info', 'crew', 'Your crew role changed',
          case when p_role = 'data_entry' then 'You can now enter auction results.' else 'You now have live read-only insights.' end, auth.uid());
  perform public.log_activity(p_event, 'crew.role', 'event_member', p_user::text, jsonb_build_object('role', p_role));
end; $$;

create or replace function public.remove_crew_member(p_event uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_tracker_owner(p_event) and p_user <> auth.uid() then
    raise exception 'Only the tracker owner can remove crew members' using errcode = '42501';
  end if;
  if exists (select 1 from events where id = p_event and owner_id = p_user) then raise exception 'The owner cannot be removed'; end if;
  update event_members set status = 'removed' where event_id = p_event and user_id = p_user;
  delete from team_members where event_id = p_event and user_id = p_user;
  perform public.log_activity(p_event, 'crew.removed', 'event_member', p_user::text, '{}');
end; $$;

-- The owner can reset the crew code (e.g. if it was shared too widely).
create or replace function public.reset_crew_code(p_event uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v text := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
begin
  if not public.is_tracker_owner(p_event) then raise exception 'Only the tracker owner can reset the code' using errcode = '42501'; end if;
  update events set invite_code = v where id = p_event;
  return v;
end; $$;

-- Trackers can be deleted by their owner.
create or replace function public.delete_tracker(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_tracker_owner(p_event) then raise exception 'Only the tracker owner can delete it' using errcode = '42501'; end if;
  delete from events where id = p_event and mode = 'tracker';
end; $$;

-- Teams are never self-claimed in a tracker.
create or replace function public.claim_team(p_event uuid, p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_event events;
begin
  select * into v_event from events where id = p_event;
  if v_event.mode = 'tracker' then raise exception 'Tracker teams are assigned by the tracker owner' using errcode = '42501'; end if;
  if not exists (select 1 from event_members where event_id = p_event and user_id = auth.uid() and status = 'approved' and role = 'participant') then
    raise exception 'You must be an approved participant of this event' using errcode = '42501';
  end if;
  if v_event.team_selection <> 'self_select' then raise exception 'Teams are assigned by the organiser' using errcode = '42501'; end if;
  perform 1 from teams where id = p_team and event_id = p_event for update;
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

-- Owner may rename/adjust their tracker (name, currency, active flag).
create or replace function public.update_tracker(p_event uuid, p_name text, p_currency text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_tracker_owner(p_event) then raise exception 'Only the tracker owner can edit it' using errcode = '42501'; end if;
  update events set name = coalesce(nullif(trim(p_name), ''), name), currency = coalesce(nullif(trim(p_currency), ''), currency)
   where id = p_event and mode = 'tracker';
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
    'active_events', (select count(*) from events where mode = 'official' and is_active and status in ('upcoming', 'live')),
    'live_events', (select count(*) from events where mode = 'official' and status = 'live'),
    'completed_events', (select count(*) from events where mode = 'official' and status = 'completed'),
    'upcoming_events', (select count(*) from events where mode = 'official' and status = 'upcoming'),
    'trackers', (select count(*) from events where mode = 'tracker'),
    'teams', (select count(*) from teams),
    'players', (select count(*) from players where event_id is not null),
    'library_players', (select count(*) from players where event_id is null),
    'active_sessions', (select count(*) from auction_sessions s join events e on e.id = s.event_id where e.mode = 'official' and s.status in ('live', 'paused')),
    'transactions', (select count(*) from auction_transactions where status = 'active'),
    'registrations', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d) from (
        select date_trunc('day', created_at)::date d, count(*) c from profiles
         where created_at > now() - interval '30 days' group by 1) x), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d) from (
        select date_trunc('day', created_at)::date d, count(*) c from activity_logs
         where created_at > now() - interval '30 days' group by 1) x), '[]'::jsonb)
  );
end; $$;

-- Privileges for the new/replaced functions (signed-out clients get nothing).
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.promote_super_admin(text) from public, anon, authenticated;
revoke execute on function public._record_sale(uuid, uuid, uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public._void_transaction(uuid, text) from public, anon, authenticated;
revoke execute on function public.recompute_team(uuid) from public, anon, authenticated;
revoke execute on function public.log_activity(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- Realtime for crew changes and rule edits (so every device updates live).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.auction_rules, public.rule_constraints; exception when duplicate_object then null; end;
  end if;
end $$;

-- Rule templates are not sensitive; any signed-in user may load one when creating a tracker.
drop policy if exists tpl_read on public.rule_templates;
create policy tpl_read on public.rule_templates for select to authenticated using (true);
