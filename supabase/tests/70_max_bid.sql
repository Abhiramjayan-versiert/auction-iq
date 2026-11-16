-- Optional maximum-bid rule: a team must keep enough purse to reach the minimum squad.
\set ON_ERROR_STOP 1
\o /dev/null
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
reset role;
insert into events (id, name, invite_code) values ('10000000-0000-0000-0000-0000000000ee', 'Max bid test', 'MAXBID01');
insert into teams (id, event_id, name, initial_purse) values ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000ee', 'Capped', 20);
update auction_rules set squad_min = 5, squad_max = 6, min_player_price = 2 where event_id = '10000000-0000-0000-0000-0000000000ee';
insert into event_members (event_id, user_id, role, status) values ('10000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-0000000000d1', 'data_entry', 'approved');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
set role authenticated;
-- rule off: may spend 15 even though 4 more players are needed
select record_live_entry('10000000-0000-0000-0000-0000000000ee', 'Uncapped Buy', 9, '20000000-0000-0000-0000-0000000000e1', 15);
select undo_last_transaction('10000000-0000-0000-0000-0000000000ee');
reset role;
update auction_rules set enforce_max_bid = true where event_id = '10000000-0000-0000-0000-0000000000ee';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
set role authenticated;
-- 20 purse, after this buy 4 more needed × 2 = 8 reserve → max 12
select pg_temp.check(team_max_bid('10000000-0000-0000-0000-0000000000ee', '20000000-0000-0000-0000-0000000000e1') = 12, 'max bid = 20 − 4×2');
select pg_temp.expect_error($$select record_live_entry('10000000-0000-0000-0000-0000000000ee', 'Too Pricey', 9, '20000000-0000-0000-0000-0000000000e1', 12.5)$$, 'above this team''s maximum bid 12');
select record_live_entry('10000000-0000-0000-0000-0000000000ee', 'Exactly Max', 9, '20000000-0000-0000-0000-0000000000e1', 12);
select pg_temp.check(team_max_bid('10000000-0000-0000-0000-0000000000ee', '20000000-0000-0000-0000-0000000000e1') = 2, 'after buying: 8 left − 3×2 = 2');
reset role;
\o
\echo 'max bid rule: OK'
