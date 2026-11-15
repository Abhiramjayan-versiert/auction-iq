-- =====================================================================
-- DEVELOPMENT-ONLY simulated live auction (never run in production).
-- 8 teams with different purses (one unknown), an EMPTY player database,
-- then entries typed through record_live_entry exactly like an operator:
-- different ratings / teams / prices, some unsold, some missing optional info.
-- Usage (local / staging SQL editor): set the operator id below, then run.
-- =====================================================================
\set ON_ERROR_STOP 1
\if :{?operator}
\else
  \set operator '0000000a-0000-0000-0000-000000000001'
\endif
insert into public.events (id, name, invite_code, status, description)
values ('e0000000-0000-0000-0000-0000000000f8', 'DEV · Live entry rehearsal (fictional)', 'DEVLIVE8', 'live', 'Fictional rehearsal data for testing live data entry.')
on conflict (id) do nothing;
update public.auction_rules set squad_min = 6, squad_max = 8, rating_scale_max = 10, min_player_price = 0.5
 where event_id = 'e0000000-0000-0000-0000-0000000000f8';
insert into public.rule_constraints (event_id, label, category, origin, min_count, max_count, sort) values
  ('e0000000-0000-0000-0000-0000000000f8', 'Wicketkeepers', 'WK', null, 1, null, 0),
  ('e0000000-0000-0000-0000-0000000000f8', 'Overseas players', null, 'overseas', null, 3, 1);
insert into public.teams (event_id, name, short_name, color, initial_purse) values
  ('e0000000-0000-0000-0000-0000000000f8', 'Rehearsal Lions', 'LIO', '#a3e635', 100),
  ('e0000000-0000-0000-0000-0000000000f8', 'Rehearsal Tigers', 'TIG', '#facc15', 90),
  ('e0000000-0000-0000-0000-0000000000f8', 'Rehearsal Eagles', 'EAG', '#60a5fa', 110),
  ('e0000000-0000-0000-0000-0000000000f8', 'Rehearsal Sharks', 'SHA', '#f472b6', 80),
  ('e0000000-0000-0000-0000-0000000000f8', 'Rehearsal Wolves', 'WOL', '#f97316', 100),
  ('e0000000-0000-0000-0000-0000000000f8', 'Rehearsal Hawks', 'HAW', '#a78bfa', 95),
  ('e0000000-0000-0000-0000-0000000000f8', 'Rehearsal Bulls', 'BUL', '#34d399', 105),
  ('e0000000-0000-0000-0000-0000000000f8', 'Rehearsal Panthers', 'PAN', '#f87171', null)
on conflict do nothing;
insert into public.event_members (event_id, user_id, role, status)
values ('e0000000-0000-0000-0000-0000000000f8', :'operator', 'data_entry', 'approved')
on conflict (event_id, user_id) do update set role = 'data_entry', status = 'approved';

select set_config('request.jwt.claim.sub', :'operator', false);
do $$
declare
  e uuid := 'e0000000-0000-0000-0000-0000000000f8';
  t record;
  r record;
begin
  for r in select * from (values
    -- name,                rating, team, price, status,  category, origin,     nationality, base
    ('Rehearsal Batter 1',   9.20, 'LIO', 12.0, 'sold',   'BAT',  'indian',   'India',     2.0),
    ('Rehearsal Keeper 1',   8.60, 'TIG',  7.5, 'sold',   'WK',   'indian',   null,        null),
    ('Rehearsal Pacer 1',    8.90, 'EAG', 10.0, 'sold',   null,   null,       null,        null),
    ('Rehearsal Spinner 1',  7.40, 'SHA',  3.0, 'sold',   'BOWL', 'overseas', 'Afghanistan', 1.0),
    ('Rehearsal Allround 1', 9.50, 'WOL', 15.5, 'sold',   'AR',   'overseas', 'Australia', 3.0),
    ('Rehearsal Batter 2',   6.80, null,  null, 'unsold', 'BAT',  'indian',   null,        0.5),
    ('Rehearsal Batter 3',   8.10, 'HAW',  6.0, 'sold',   null,   null,       null,        null),
    ('Rehearsal Keeper 2',   null, 'BUL',  2.5, 'sold',   'WK',   null,       null,        null),
    ('Rehearsal Pacer 2',    8.30, 'PAN',  9.0, 'sold',   'BOWL', 'indian',   'India',     null),
    ('Rehearsal Pacer 3',    7.90, 'LIO',  4.0, 'sold',   'BOWL', 'overseas', 'England',   1.0),
    ('Rehearsal Allround 2', 7.10, null,  null, 'unsold', null,   null,       null,        null),
    ('Rehearsal Batter 4',   9.80, 'EAG', 21.0, 'sold',   'BAT',  'overseas', 'South Africa', 2.0)
  ) v(name, rating, team, price, status, category, origin, nationality, base) loop
    select id into t from public.teams where event_id = e and short_name = r.team;
    perform public.record_live_entry(e, r.name, r.rating, t.id, r.price, r.status, r.category, r.origin, r.nationality, r.base, gen_random_uuid());
  end loop;
end $$;
