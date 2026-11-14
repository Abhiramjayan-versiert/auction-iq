-- End-to-end database test: roles, RLS isolation, atomic sales, safeguards, undo & corrections.
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

-- users
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.com', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-000000000002', 'auc@example.com', '{"full_name":"Auctioneer","requested_role":"auctioneer"}'),
  ('00000000-0000-0000-0000-000000000003', 'p1@example.com', '{"full_name":"P One","college":"X"}'),
  ('00000000-0000-0000-0000-000000000004', 'p2@example.com', '{"full_name":"P Two"}'),
  ('00000000-0000-0000-0000-000000000005', 'outsider@example.com', '{"full_name":"Out"}');
select pg_temp.check((select count(*) from profiles) = 5, 'profiles auto-created');
select pg_temp.check((select requested_role from profiles where email = 'auc@example.com') = 'auctioneer', 'requested role captured');
select pg_temp.check((select platform_role from profiles where email = 'auc@example.com') = 'participant', 'auctioneer needs approval');
select promote_super_admin('admin@example.com');

-- participant cannot escalate
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select pg_temp.expect_error($$update profiles set platform_role = 'super_admin' where id = auth.uid()$$, 'Only a Super Admin');
update profiles set city = 'Kochi' where id = auth.uid();

-- admin approves auctioneer, creates event & teams
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select admin_set_user('00000000-0000-0000-0000-000000000002', 'auctioneer', 'active');
insert into events (id, name, invite_code, default_purse) values
  ('10000000-0000-0000-0000-000000000001', 'Test Fest Auction', 'FEST2026', 100),
  ('10000000-0000-0000-0000-000000000002', 'Other Event', 'OTHER001', 50);
select add_event_auctioneer('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from auction_sessions) = 2, 'sessions auto-created');

-- auctioneer manages assigned event only
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
insert into teams (id, event_id, name, short_name, initial_purse) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Chennai', 'CHE', 100),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Mumbai', 'MUM', 100),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Bengaluru', 'BLR', 30);
select pg_temp.expect_error($$insert into teams (event_id, name, initial_purse) values ('10000000-0000-0000-0000-000000000002', 'Hack', 10)$$, 'row-level security');
select pg_temp.expect_error($$select record_sale('10000000-0000-0000-0000-000000000002', gen_random_uuid(), gen_random_uuid(), 1)$$, 'Not authorized');
select pg_temp.check((select remaining from team_financials where team_id = '20000000-0000-0000-0000-000000000003') = 30, 'financial row created');

select save_event_rules('10000000-0000-0000-0000-000000000001', '{"squad_min":3,"squad_max":3}',
  '[{"label":"Overseas batsmen","category":"BAT","origin":"overseas","min":0,"max":1},{"label":"Wicketkeepers","category":"WK","min":1}]');

insert into players (id, event_id, name, origin, category, base_price) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Alpha', 'overseas', 'BAT', 2),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Bravo', 'overseas', 'BAT', 2),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Charlie', 'indian', 'WK', 1),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Delta', 'indian', 'BOWL', 1),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Echo', 'indian', 'BOWL', 1);
insert into player_ratings (player_id, overall) values
  ('30000000-0000-0000-0000-000000000001', 9.5), ('30000000-0000-0000-0000-000000000002', 9.2),
  ('30000000-0000-0000-0000-000000000003', 8.8), ('30000000-0000-0000-0000-000000000004', 9.7),
  ('30000000-0000-0000-0000-000000000005', 8.9);

-- participants join by code
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from preview_event_by_code('fest2026')) = 1, 'preview by code (case-insensitive)');
select pg_temp.expect_error($$select join_event('WRONGCODE')$$, 'Invalid');
select pg_temp.check(join_event('FEST2026') = 'approved', 'join approved');
select claim_team('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
select join_event('FEST2026');
select pg_temp.expect_error($$select claim_team('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001')$$, 'already claimed');
select claim_team('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002');

-- participant sees event data but cannot write official records
select pg_temp.check((select count(*) from players where event_id = '10000000-0000-0000-0000-000000000001') = 5, 'member reads players');
select pg_temp.check((select count(*) from teams where event_id = '10000000-0000-0000-0000-000000000002') = 0, 'event isolation: no teams from other event');
select pg_temp.expect_error($$select record_sale('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 5)$$, 'Not authorized');
update team_financials set remaining = 999; -- silently affects 0 rows under RLS
update player_ratings set overall = 10;
select pg_temp.check((select count(*) from auction_transactions) = 0, 'no tx by participant');

-- private workspace isolation
insert into private_notes (user_id, event_id, body) values (auth.uid(), '10000000-0000-0000-0000-000000000001', 'P2 secret plan');
insert into player_shortlists (user_id, event_id, player_id, list) values (auth.uid(), '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'target');
select pg_temp.expect_error($$insert into private_notes (user_id, event_id, body) values ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'forged')$$, 'row-level security');
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from private_notes) = 0, 'P1 cannot see P2 notes');
select pg_temp.check((select count(*) from player_shortlists) = 0, 'P1 cannot see P2 shortlist');
-- outsider sees nothing
select pg_temp.as_user('00000000-0000-0000-0000-000000000005');
select pg_temp.check((select count(*) from players) = 0, 'outsider sees no players');
select pg_temp.check((select count(*) from auction_transactions) = 0, 'outsider sees no tx');

-- auctioneer conducts the auction
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select set_session_status('10000000-0000-0000-0000-000000000001', 'live');
select set_current_player('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001');
select record_sale('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 12);
select pg_temp.check((select remaining from team_financials where team_id = '20000000-0000-0000-0000-000000000001') = 88, 'purse deducted');
select pg_temp.check((select auction_status from players where id = '30000000-0000-0000-0000-000000000001') = 'sold', 'player sold');
-- duplicate purchase blocked
select pg_temp.expect_error($$select record_sale('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 15)$$, 'already sold');
-- below base / overspend / max constraint
select pg_temp.expect_error($$select record_sale('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 0.5)$$, 'below base');
select pg_temp.expect_error($$select record_sale('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 31)$$, 'Insufficient purse');
select pg_temp.expect_error($$select record_sale('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 5)$$, 'Overseas batsmen');
-- unsold then re-auctioned
select mark_unsold('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002');
select record_sale('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 4);
select record_sale('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 10);
select pg_temp.check((select avg_rating from team_scores where team_id = '20000000-0000-0000-0000-000000000001') = 9.60, 'avg rating (9.5+9.7)/2');
-- undo latest (Delta -> Chennai)
select undo_last_transaction('10000000-0000-0000-0000-000000000001');
select pg_temp.check((select remaining from team_financials where team_id = '20000000-0000-0000-0000-000000000001') = 88, 'undo restores purse');
select pg_temp.check((select auction_status from players where id = '30000000-0000-0000-0000-000000000004') = 'available', 'undo restores player');
-- correction: Bravo actually went to Bengaluru for 6
select correct_sale((select id from auction_transactions where player_id = '30000000-0000-0000-0000-000000000002' and status = 'active'),
                    '20000000-0000-0000-0000-000000000003', 6);
select pg_temp.check((select remaining from team_financials where team_id = '20000000-0000-0000-0000-000000000002') = 100, 'correction refunds old team');
select pg_temp.check((select remaining from team_financials where team_id = '20000000-0000-0000-0000-000000000003') = 24, 'correction charges new team');
-- squad full
select record_sale('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 1);
select record_sale('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 1);
select pg_temp.expect_error($$select record_sale('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 1)$$, 'Squad is full');

-- reproducibility: derived tables equal a full recompute from transactions
select pg_temp.as_user(null);
create temp table before_fin as select team_id, spent, remaining, players_count from team_financials;
update team_financials set spent = 0, remaining = 0, players_count = 0;
select recompute_event('10000000-0000-0000-0000-000000000001');
select pg_temp.check(not exists (select * from before_fin except select team_id, spent, remaining, players_count from team_financials
  where event_id = '10000000-0000-0000-0000-000000000001') , 'recompute reproduces balances');

-- audit trail
select pg_temp.check((select count(*) from activity_logs where action like 'transaction.%') >= 8, 'transactions audited');
-- participants see official updates
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
select pg_temp.check((select count(*) from auction_transactions where status = 'active') = 4, 'participant sees official tx');
select pg_temp.check((select count(*) from activity_logs) = 0, 'participant cannot read audit log');
select pg_temp.as_user(null);
\echo 'auction flow: OK'
