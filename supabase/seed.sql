-- =====================================================================
-- OPTIONAL DEMO SEED — fictional sample data for local testing only.
-- Player names and ratings below are invented placeholders, clearly
-- labelled "DEMO", and must never be presented as real player data.
-- =====================================================================
insert into public.organizations (id, name, slug, city, state)
values ('a0000000-0000-0000-0000-000000000001', 'Demo Management College', 'demo-college', 'Kochi', 'Kerala')
on conflict do nothing;

insert into public.events (id, organization_id, name, description, venue, starts_at, invite_code, default_purse, status)
values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        'Demo IPL Auction (sample data)', 'Fictional demo event for trying AUCTION IQ. All players and ratings are invented.',
        'Main Auditorium', now() + interval '7 days', 'DEMO2026', 100, 'upcoming')
on conflict do nothing;

update public.auction_rules set squad_min = 9, squad_max = 9, bid_increment = 0.25, ranking_formula = 'average', require_complete_squad = true
 where event_id = 'e0000000-0000-0000-0000-000000000001';
insert into public.rule_constraints (event_id, label, category, origin, min_count, max_count, sort) values
  ('e0000000-0000-0000-0000-000000000001', 'Indian batsmen', 'BAT', 'indian', 2, 2, 0),
  ('e0000000-0000-0000-0000-000000000001', 'Overseas batsmen', 'BAT', 'overseas', 1, 1, 1),
  ('e0000000-0000-0000-0000-000000000001', 'Indian bowlers', 'BOWL', 'indian', 2, 2, 2),
  ('e0000000-0000-0000-0000-000000000001', 'Overseas bowlers', 'BOWL', 'overseas', 2, 2, 3),
  ('e0000000-0000-0000-0000-000000000001', 'Indian all-rounders', 'AR', 'indian', 1, null, 4),
  ('e0000000-0000-0000-0000-000000000001', 'Wicketkeepers', 'WK', null, 1, null, 5);

insert into public.teams (event_id, name, short_name, color, initial_purse)
select 'e0000000-0000-0000-0000-000000000001', 'Demo Team ' || chr(64 + g), 'DT' || chr(64 + g),
       (array['#a3e635','#facc15','#60a5fa','#f472b6','#f97316','#a78bfa','#34d399','#f87171','#22d3ee','#e879f9'])[g], 100
from generate_series(1, 10) g
on conflict do nothing;

with p as (
  insert into public.players (event_id, lot_number, name, nationality, origin, category, base_price, batting_style, bowling_style)
  select 'e0000000-0000-0000-0000-000000000001', g, 'DEMO Player ' || lpad(g::text, 2, '0'),
         case when g % 3 = 0 then 'Overseas (demo)' else 'India' end,
         case when g % 3 = 0 then 'overseas' else 'indian' end,
         (array['BAT','BOWL','AR','WK','BAT','BOWL'])[1 + g % 6],
         (array[0.5, 1, 1.5, 2, 3])[1 + g % 5],
         case when g % 2 = 0 then 'Right-hand bat' else 'Left-hand bat' end,
         case when g % 6 in (1, 5) then 'Right-arm medium' when g % 6 = 2 then 'Slow left-arm' else null end
  from generate_series(1, 72) g
  returning id, lot_number
)
insert into public.player_ratings (player_id, overall, batting, bowling, fielding, wicketkeeping, source)
select id,
       round((7 + ((lot_number * 37) % 30) / 10.0)::numeric, 2),
       round((6 + ((lot_number * 13) % 40) / 10.0)::numeric, 2),
       round((6 + ((lot_number * 17) % 40) / 10.0)::numeric, 2),
       round((6.5 + ((lot_number * 7) % 35) / 10.0)::numeric, 2),
       case when lot_number % 6 = 3 then round((7 + ((lot_number * 11) % 30) / 10.0)::numeric, 2) end,
       'DEMO sample rating (fictional)'
from p;
