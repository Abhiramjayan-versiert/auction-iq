-- Scale test: 40 teams, 240 players, 200 official sales through the real RPCs, then full reproducibility check.
\set ON_ERROR_STOP 1
\o /dev/null
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into events (id, name, invite_code, default_purse) values ('10000000-0000-0000-0000-0000000000aa', 'Scale Test', 'SCALE001', 120);
insert into event_members (event_id, user_id, role, status) values ('10000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000002', 'auctioneer', 'approved');
update auction_rules set squad_min = 6, squad_max = 8 where event_id = '10000000-0000-0000-0000-0000000000aa';
insert into rule_constraints (event_id, label, origin, max_count) values ('10000000-0000-0000-0000-0000000000aa', 'Overseas', 'overseas', 3);
insert into teams (event_id, name, initial_purse)
  select '10000000-0000-0000-0000-0000000000aa', 'Scale Team ' || g, 120 from generate_series(1, 40) g;
insert into players (event_id, name, origin, category, base_price, lot_number)
  select '10000000-0000-0000-0000-0000000000aa', 'Scale Player ' || g, case when g % 4 = 0 then 'overseas' else 'indian' end,
         (array['BAT','BOWL','AR','WK'])[1 + g % 4], 0.5 + (g % 5), g from generate_series(1, 240) g;
insert into player_ratings (player_id, overall, source) select id, 6 + (lot_number % 40) / 10.0, 'scale test' from players where event_id = '10000000-0000-0000-0000-0000000000aa';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
\timing on
\o
do $$
declare p record; t uuid; i int := 0; ok int := 0; failed int := 0; t0 timestamptz := clock_timestamp();
begin
  for p in select id, base_price from players where event_id = '10000000-0000-0000-0000-0000000000aa' order by lot_number limit 200 loop
    select id into t from teams where event_id = '10000000-0000-0000-0000-0000000000aa' order by name offset (i % 40) limit 1;
    begin
      perform record_sale('10000000-0000-0000-0000-0000000000aa', p.id, t, p.base_price + (i % 3));
      ok := ok + 1;
    exception when others then failed := failed + 1; -- rule/purse rejections are expected for some
    end;
    i := i + 1;
  end loop;
  raise notice 'scale: % sales recorded, % rejected by rules, % ms total', ok, failed, round(extract(epoch from clock_timestamp() - t0) * 1000);
  if ok < 150 then raise exception 'too few sales succeeded: %', ok; end if;
end $$;
\o /dev/null
reset role;
-- every balance must equal initial purse minus active sales
do $$ begin
  if exists (
    select 1 from team_financials f join teams t on t.id = f.team_id
     where t.event_id = '10000000-0000-0000-0000-0000000000aa'
       and f.remaining <> t.initial_purse - coalesce((select sum(amount) from auction_transactions x where x.team_id = t.id and x.status = 'active' and x.type = 'sale'), 0)
  ) then raise exception 'balances not reproducible'; end if;
  if exists (select 1 from team_financials f join auction_rules r on r.event_id = f.event_id where f.event_id = '10000000-0000-0000-0000-0000000000aa' and f.players_count > r.squad_max)
    then raise exception 'squad max violated'; end if;
  if exists (select team_id from team_rosters tr join players p on p.id = tr.player_id where tr.event_id = '10000000-0000-0000-0000-0000000000aa' and p.origin = 'overseas' group by team_id having count(*) > 3)
    then raise exception 'overseas max violated'; end if;
end $$;
\o
\echo 'scale: OK'
