-- Live manual entry with an EMPTY player database: 8 teams, different purses (one unknown).
\set ON_ERROR_STOP 1
\o /dev/null
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then execute 'reset role'; else execute 'set role authenticated'; end if;
end $$;
create or replace function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    if sqlerrm not ilike '%' || p_like || '%' then raise exception 'Expected error like "%" but got "%"', p_like, sqlerrm; end if;
    return;
  end;
  raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql;
end $$;
create or replace function pg_temp.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin if not coalesce(p_ok, false) then raise exception 'CHECK FAILED: %', p_msg; end if; end $$;

select pg_temp.as_user(null);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'operator@example.com', '{"full_name":"Operator"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'fan@example.com', '{"full_name":"Participant"}');
insert into events (id, name, invite_code) values ('10000000-0000-0000-0000-0000000000dd', 'Live Entry Test (dev)', 'LIVE0001');
insert into teams (event_id, name, short_name, initial_purse) values
  ('10000000-0000-0000-0000-0000000000dd', 'Alpha', 'ALP', 100), ('10000000-0000-0000-0000-0000000000dd', 'Bravo', 'BRV', 90),
  ('10000000-0000-0000-0000-0000000000dd', 'Charlie', 'CHA', 80), ('10000000-0000-0000-0000-0000000000dd', 'Delta', 'DEL', 120),
  ('10000000-0000-0000-0000-0000000000dd', 'Echo', 'ECH', 100), ('10000000-0000-0000-0000-0000000000dd', 'Foxtrot', 'FOX', 70),
  ('10000000-0000-0000-0000-0000000000dd', 'Golf', 'GOL', 100), ('10000000-0000-0000-0000-0000000000dd', 'Hotel', 'HOT', null);
update auction_rules set squad_min = 5, squad_max = 7 where event_id = '10000000-0000-0000-0000-0000000000dd';
select pg_temp.check((select count(*) from players where event_id = '10000000-0000-0000-0000-0000000000dd') = 0, 'starts with an empty player database');
select pg_temp.check((select remaining from team_financials f join teams t on t.id = f.team_id where t.name = 'Hotel') is null, 'unknown purse stays unknown');

-- operator assignment: a plain participant account becomes the event's data-entry operator
select promote_super_admin('admin@example.com');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select add_event_operator('10000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000d1');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select join_event('LIVE0001');
select pg_temp.expect_error($$select record_live_entry('10000000-0000-0000-0000-0000000000dd', 'Hacker Pick', 9, (select id from teams where name = 'Alpha'), 1)$$, 'Not authorized');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
-- 4 essential fields only: name, rating, team, price → player created + sold
create temp table r1 as select record_live_entry('10000000-0000-0000-0000-0000000000dd', '  Virat   Sharma ', 9.4, (select id from teams where name = 'Alpha'), 12.5, 'sold', null, null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001') as r;
grant select on r1 to authenticated;
select pg_temp.check(((select r from r1) ->> 'created_player')::boolean, 'player created on first entry');
select pg_temp.check((select name from players where event_id = '10000000-0000-0000-0000-0000000000dd') = 'Virat Sharma', 'name whitespace normalised');
select pg_temp.check((select category from players where name = 'Virat Sharma') is null, 'category left unknown (never invented)');
select pg_temp.check((select remaining from team_financials f join teams t on t.id = f.team_id where t.name = 'Alpha') = 87.5, 'purse deducted');
select pg_temp.check((select avg_rating from team_scores s join teams t on t.id = s.team_id where t.name = 'Alpha') = 9.40, 'average rating');
-- idempotent retry (network blip): same client_ref returns the original, no second sale
select pg_temp.check((record_live_entry('10000000-0000-0000-0000-0000000000dd', 'Virat Sharma', 9.4, (select id from teams where name = 'Alpha'), 12.5, 'sold', null, null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001') ->> 'duplicate_submission')::boolean, 'retry is idempotent');
select pg_temp.check((select count(*) from auction_transactions where event_id = '10000000-0000-0000-0000-0000000000dd') = 1, 'still one transaction');
-- duplicate player (case-insensitive) cannot be sold twice
select pg_temp.expect_error($$select record_live_entry('10000000-0000-0000-0000-0000000000dd', 'virat sharma', 9, (select id from teams where name = 'Bravo'), 5)$$, 'already recorded as sold to Alpha');
-- validation
select pg_temp.expect_error($$select record_live_entry('10000000-0000-0000-0000-0000000000dd', 'Too High', 11, (select id from teams where name = 'Bravo'), 5)$$, 'outside the event scale');
select pg_temp.expect_error($$select record_live_entry('10000000-0000-0000-0000-0000000000dd', 'No Team', 8, null, 5)$$, 'Winning team is required');
select pg_temp.expect_error($$select record_live_entry('10000000-0000-0000-0000-0000000000dd', 'Bad Price', 8, (select id from teams where name = 'Bravo'), -1)$$, 'valid sold price');
select pg_temp.expect_error($$select record_live_entry('10000000-0000-0000-0000-0000000000dd', '   ', 8, (select id from teams where name = 'Bravo'), 1)$$, 'name is required');
select pg_temp.expect_error($$select record_live_entry('10000000-0000-0000-0000-0000000000dd', 'Too Rich', 8, (select id from teams where name = 'Foxtrot'), 71)$$, 'Insufficient purse');
-- unknown purse: sale allowed, remaining stays unknown
select record_live_entry('10000000-0000-0000-0000-0000000000dd', 'Hotel Buy', 7.5, (select id from teams where name = 'Hotel'), 999);
select pg_temp.check((select remaining from team_financials f join teams t on t.id = f.team_id where t.name = 'Hotel') is null, 'unknown purse not fabricated');
-- unsold, then re-auctioned later and sold
select record_live_entry('10000000-0000-0000-0000-0000000000dd', 'Late Bloomer', 8.1, null, null, 'unsold', 'BOWL', 'overseas', 'Australia', 2);
select pg_temp.check((select auction_status from players where name = 'Late Bloomer') = 'unsold', 'unsold recorded, player kept');
select record_live_entry('10000000-0000-0000-0000-0000000000dd', 'late bloomer', null, (select id from teams where name = 'Charlie'), 2.5);
select pg_temp.check((select auction_status from players where name = 'Late Bloomer') = 'sold', 'unsold player sold in a later round');
select pg_temp.check((select overall from player_ratings r join players p on p.id = r.player_id where p.name = 'Late Bloomer') = 8.1, 'rating kept when not re-entered');
select pg_temp.check((select count(*) from players where event_id = '10000000-0000-0000-0000-0000000000dd') = 3, 'no duplicate player rows');
-- base price respected when known
select pg_temp.expect_error($$select record_live_entry('10000000-0000-0000-0000-0000000000dd', 'Pricey', 8, (select id from teams where name = 'Bravo'), 1, 'sold', null, null, null, 3)$$, 'below base price');

-- edit: wrong team and price → traceable correction, purses recalculated
create temp table tx as select id from auction_transactions where event_id = '10000000-0000-0000-0000-0000000000dd' and status = 'active'
  and player_id = (select id from players where name = 'Virat Sharma');
grant select on tx to authenticated;
select update_live_entry((select id from tx), null, 9.6, false, 'BAT', 'indian', 'India', null, null, (select id from teams where name = 'Delta'), 14);
select pg_temp.check((select remaining from team_financials f join teams t on t.id = f.team_id where t.name = 'Alpha') = 100, 'old team refunded');
select pg_temp.check((select remaining from team_financials f join teams t on t.id = f.team_id where t.name = 'Delta') = 106, 'new team charged');
select pg_temp.check((select avg_rating from team_scores s join teams t on t.id = s.team_id where t.name = 'Delta') = 9.60, 'edited rating used');
select pg_temp.check((select status from auction_transactions where id = (select id from tx)) = 'voided', 'original kept as voided (history preserved)');
-- rating-only edit refreshes team score without a new transaction
select update_live_entry((select id from auction_transactions where status = 'active' and player_id = (select id from players where name = 'Virat Sharma')), null, 9.0);
select pg_temp.check((select avg_rating from team_scores s join teams t on t.id = s.team_id where t.name = 'Delta') = 9.00, 'rating-only edit recalculates');
-- undo
select undo_last_transaction('10000000-0000-0000-0000-0000000000dd');
select pg_temp.check((select auction_status from players where name = 'Virat Sharma') = 'available', 'undo returns player to pool');

-- participant: read-only
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select pg_temp.check((select count(*) from players where event_id = '10000000-0000-0000-0000-0000000000dd') = 3, 'participant sees entered players');
select pg_temp.expect_error($$select update_live_entry((select id from auction_transactions where event_id = '10000000-0000-0000-0000-0000000000dd' and status = 'active' limit 1), 'Hacked')$$, 'Not authorized');
-- private shortlist by name (player not entered yet)
insert into player_shortlists (user_id, event_id, player_name, list, target_price, high_priority) values (auth.uid(), '10000000-0000-0000-0000-0000000000dd', 'Future Star', 'target', 6, true);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((select count(*) from player_shortlists) = 0, 'shortlist private from operator');
select pg_temp.as_user(null);
\o
\echo 'live entry: OK'
