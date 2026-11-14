-- Tracker mode: participant-owned private tracker, crew roles, data-entry vs analyst permissions.
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
  ('00000000-0000-0000-0000-0000000000c1', 'lead@example.com', '{"full_name":"Crew Lead"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'mate@example.com', '{"full_name":"Crew Mate"}'),
  ('00000000-0000-0000-0000-0000000000c3', 'rival@example.com', '{"full_name":"Rival"}');

-- a plain participant creates a tracker
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
create temp table t as select create_tracker('Fest outside auction', 'Chennai', array['Mumbai', 'Bengaluru', 'chennai', ''], 100, 'Cr',
  (select id from rule_templates where name like '9-player%')) as id;
grant select on t to authenticated;
select pg_temp.check((select mode from events where id = (select id from t)) = 'tracker', 'tracker created');
select pg_temp.check((select count(*) from teams where event_id = (select id from t)) = 3, 'own team + 2 competitors (duplicate skipped)');
select pg_temp.check((select count(*) from rule_constraints where event_id = (select id from t)) = 6, 'template constraints copied');
select pg_temp.check(can_manage_event((select id from t)), 'owner is data entry');
select pg_temp.check(my_team_id((select id from t)) = (select tracker_team_id from events where id = (select id from t)), 'owner owns own team');
-- data entry can add players & record a result
insert into players (id, event_id, name, origin, category, base_price) values
  ('30000000-0000-0000-0000-0000000000c1', (select id from t), 'Observed One', 'indian', 'BAT', 1),
  ('30000000-0000-0000-0000-0000000000c2', (select id from t), 'Observed Two', 'overseas', 'BAT', 1),
  ('30000000-0000-0000-0000-0000000000c3', (select id from t), 'Observed Three', 'overseas', 'BAT', 1);
select record_sale((select id from t), '30000000-0000-0000-0000-0000000000c1', (select id from teams where event_id = (select id from t) and name = 'Mumbai'), 12);
-- trackers record reality: rule maxima and overspend warn but do not block
select record_sale((select id from t), '30000000-0000-0000-0000-0000000000c2', (select id from teams where event_id = (select id from t) and name = 'Mumbai'), 50);
select record_sale((select id from t), '30000000-0000-0000-0000-0000000000c3', (select id from teams where event_id = (select id from t) and name = 'Mumbai'), 60);
select pg_temp.check((select remaining from team_financials where team_id = (select id from teams where event_id = (select id from t) and name = 'Mumbai')) = -22, 'overspend recorded in tracker');

select pg_temp.as_user(null);
create temp table code as select invite_code from events where id = (select id from t);
grant select on code to authenticated;
-- crew mate joins with the crew code as a read-only analyst on the owner's team
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check(join_event((select invite_code from code)) = 'approved', 'mate joined');
select pg_temp.check((select role from event_members where event_id = (select id from t) and user_id = auth.uid()) = 'analyst', 'mate is analyst');
select pg_temp.check(my_team_id((select id from t)) = (select tracker_team_id from events where id = (select id from t)), 'mate on owner team');
select pg_temp.check((select count(*) from auction_transactions where event_id = (select id from t)) = 3, 'analyst sees live data');
select pg_temp.check((select count(*) from get_crew((select id from t))) = 2, 'analyst sees crew');
select pg_temp.expect_error($$select record_sale((select id from t), '30000000-0000-0000-0000-0000000000c1', (select tracker_team_id from events where id = (select id from t)), 1)$$, 'Not authorized');
select pg_temp.expect_error($$select set_crew_role((select id from t), auth.uid(), 'data_entry')$$, 'Only the tracker owner');
select pg_temp.expect_error($$select claim_team((select id from t), (select tracker_team_id from events where id = (select id from t)))$$, 'assigned by the tracker owner');
insert into players (event_id, name, origin, category) select id, 'Hack', 'indian', 'BAT' from t where false; -- no-op
select pg_temp.expect_error($$insert into players (event_id, name, origin, category) values ((select id from t), 'Hack', 'indian', 'BAT')$$, 'row-level security');

-- owner hands data entry to the mate; owner becomes analyst
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select set_crew_role((select id from t), '00000000-0000-0000-0000-0000000000c2', 'data_entry');
select set_crew_role((select id from t), '00000000-0000-0000-0000-0000000000c1', 'analyst');
select pg_temp.check(not can_manage_event((select id from t)), 'owner now read-only');
select pg_temp.check(is_tracker_owner((select id from t)), 'owner still manages crew');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check(can_manage_event((select id from t)), 'mate can enter data');
select undo_last_transaction((select id from t));

-- outsiders cannot see or discover the tracker
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select pg_temp.check((select count(*) from events where id = (select id from t)) = 0, 'tracker not discoverable');
select pg_temp.check((select count(*) from get_crew((select id from t))) = 0, 'outsider cannot list crew');
select pg_temp.expect_error($$select reset_crew_code((select id from t))$$, 'Only the tracker owner');

-- owner removes the mate; mate loses access
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select remove_crew_member((select id from t), '00000000-0000-0000-0000-0000000000c2');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check((select count(*) from auction_transactions where event_id = (select id from t)) = 0, 'removed mate sees nothing');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select delete_tracker((select id from t));
select pg_temp.as_user(null);
select pg_temp.check((select count(*) from events where id = (select id from t)) = 0, 'tracker deleted');
\o
\echo 'trackers: OK'
