-- Plays part of the DEMO auction through the real RPCs, then exports the
-- resulting official state as JSON fixtures for the UI preview server.
\set ON_ERROR_STOP 1
\o /dev/null
insert into auth.users (id, email, raw_user_meta_data) values
  ('0000000a-0000-0000-0000-000000000001', 'demo.admin@example.com', '{"full_name":"Demo Admin","college":"Demo Management College"}'),
  ('0000000a-0000-0000-0000-000000000002', 'demo.player@example.com', '{"full_name":"Demo Participant","college":"Demo College"}')
on conflict do nothing;
select promote_super_admin('demo.admin@example.com');
insert into event_members (event_id, user_id, role, status) values
  ('e0000000-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000001', 'auctioneer', 'approved'),
  ('e0000000-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000002', 'participant', 'approved')
on conflict do nothing;
insert into team_members (team_id, user_id, event_id, role)
select id, '0000000a-0000-0000-0000-000000000001', event_id, 'owner' from teams where event_id = 'e0000000-0000-0000-0000-000000000001' and name = 'Demo Team A'
on conflict do nothing;
select set_config('request.jwt.claim.sub', '0000000a-0000-0000-0000-000000000001', false);
set role authenticated;
select set_session_status('e0000000-0000-0000-0000-000000000001', 'live');
do $$
declare p record; t uuid; i int := 0;
begin
  for p in select pl.id, pl.base_price from players pl where pl.event_id = 'e0000000-0000-0000-0000-000000000001' order by pl.lot_number limit 34 loop
    select id into t from teams where event_id = 'e0000000-0000-0000-0000-000000000001' order by name offset ((i * 3) % 10) limit 1;
    begin
      perform record_sale('e0000000-0000-0000-0000-000000000001', p.id, t, p.base_price + (i % 4) * 0.75);
    exception when others then
      perform mark_unsold('e0000000-0000-0000-0000-000000000001', p.id);
    end;
    i := i + 1;
  end loop;
end $$;
-- a participant-style tracker with a crew (data entry = demo admin, analyst = demo participant)
create temp table trk as select create_tracker('Outside Fest Tracker', 'Chennai', array['Mumbai', 'Bengaluru', 'Kolkata', 'Delhi'], 80, 'Cr',
  (select id from rule_templates where name like '9-player%')) as id;
insert into players (event_id, name, origin, category, base_price, lot_number)
  select (select id from trk), 'Tracked Player ' || g, case when g % 3 = 0 then 'overseas' else 'indian' end, (array['BAT','BOWL','AR','WK'])[1 + g % 4], 1, g
  from generate_series(1, 24) g;
insert into player_ratings (player_id, overall, batting, bowling, fielding, source)
  select id, 7 + (lot_number % 25) / 10.0, 7 + (lot_number % 20) / 10.0, 6.5 + (lot_number % 30) / 10.0, 7, 'entered by data entry'
  from players where event_id = (select id from trk);
do $$ declare p record; i int := 0; begin
  for p in select id from players where event_id = (select id from trk) order by lot_number limit 10 loop
    perform record_sale((select id from trk), p.id, (select id from teams where event_id = (select id from trk) order by name offset (i % 5) limit 1), 2 + (i % 4) * 1.5);
    i := i + 1;
  end loop;
end $$;
select set_current_player('e0000000-0000-0000-0000-000000000001', (select id from players where event_id = 'e0000000-0000-0000-0000-000000000001' and auction_status = 'upcoming' order by lot_number limit 1));
reset role;
select invite_code as trk_code from events where id = (select id from trk) \gset
select set_config('request.jwt.claim.sub', '0000000a-0000-0000-0000-000000000002', false);
set role authenticated;
select join_event(:'trk_code');
reset role;
insert into private_notes (user_id, event_id, title, body) values ('0000000a-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Plan', 'Secure an overseas bowler early.');
insert into player_shortlists (user_id, event_id, player_id, list, priority)
select '0000000a-0000-0000-0000-000000000001', event_id, id, case when lot_number % 2 = 0 then 'target' else 'backup' end, lot_number
from players where event_id = 'e0000000-0000-0000-0000-000000000001' and auction_status = 'upcoming' order by lot_number limit 5;
insert into simulated_transactions (user_id, event_id, scenario, player_id, team_id, price)
select '0000000a-0000-0000-0000-000000000001', p.event_id, 'A', p.id, t.id, p.base_price + 1
from players p, teams t where p.event_id = 'e0000000-0000-0000-0000-000000000001' and t.event_id = p.event_id and t.name = 'Demo Team A' and p.auction_status = 'upcoming'
order by p.lot_number desc limit 2;
insert into competitor_observations (user_id, event_id, team_id, kind, player_name, amount, label)
select '0000000a-0000-0000-0000-000000000001', event_id, id, 'purchase', 'Unlisted player (observed)', 2.5, 'estimated' from teams where name = 'Demo Team B';
insert into private_participant_workspaces (user_id, event_id) values ('0000000a-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001') on conflict do nothing;
\o
\o /dev/null
select set_config('request.jwt.claim.sub', '0000000a-0000-0000-0000-000000000001', false);
\t on
\pset format unaligned
\o :out
select json_build_object(
  'profiles', (select json_agg(p) from profiles p),
  'organizations', (select json_agg(o) from organizations o),
  'events', (select json_agg(row_to_json(e)::jsonb || jsonb_build_object('organizations', (select json_build_object('name', o.name) from organizations o where o.id = e.organization_id))) from events e),
  'event_members', (select json_agg(row_to_json(m)::jsonb || jsonb_build_object('profiles', (select json_build_object('full_name', p.full_name, 'email', p.email, 'college', p.college) from profiles p where p.id = m.user_id), 'events', (select row_to_json(e)::jsonb || jsonb_build_object('organizations', json_build_object('name', 'Demo Management College')) from events e where e.id = m.event_id))) from event_members m),
  'teams', (select json_agg(t order by t.name) from teams t),
  'team_members', (select json_agg(row_to_json(tm)::jsonb || jsonb_build_object('teams', (select json_build_object('name', t.name, 'short_name', t.short_name) from teams t where t.id = tm.team_id))) from team_members tm),
  'players', (select json_agg(row_to_json(p)::jsonb || jsonb_build_object('player_ratings', (select row_to_json(r) from player_ratings r where r.player_id = p.id)) order by p.lot_number) from players p),
  'auction_rules', (select json_agg(r) from auction_rules r),
  'rule_constraints', (select json_agg(c) from rule_constraints c),
  'auction_sessions', (select json_agg(s) from auction_sessions s),
  'auction_transactions', (select json_agg(t order by t.seq desc) from auction_transactions t),
  'notifications', (select json_agg(n order by n.created_at desc) from notifications n),
  'activity_logs', (select json_agg(row_to_json(a)::jsonb || jsonb_build_object('profiles', json_build_object('full_name', 'Demo Admin', 'email', 'demo.admin@example.com'), 'events', json_build_object('name', 'Demo IPL Auction (sample data)')) order by a.created_at desc) from activity_logs a),
  'rule_templates', (select json_agg(t) from rule_templates t),
  'platform_settings', (select json_agg(s) from platform_settings s),
  'private_participant_workspaces', (select json_agg(w) from private_participant_workspaces w),
  'private_notes', (select json_agg(n) from private_notes n),
  'player_shortlists', (select json_agg(s) from player_shortlists s),
  'simulated_transactions', (select json_agg(s) from simulated_transactions s),
  'competitor_observations', (select json_agg(o) from competitor_observations o),
  'crew', (select json_agg(json_build_object('event_id', em.event_id, 'user_id', em.user_id, 'full_name', p.full_name, 'email', p.email, 'college', p.college,
            'role', em.role, 'status', em.status, 'is_owner', e.owner_id = em.user_id, 'joined_at', em.joined_at))
            from event_members em join profiles p on p.id = em.user_id join events e on e.id = em.event_id where e.mode = 'tracker'),
  'admin_platform_stats', (select admin_platform_stats())
);
