#!/usr/bin/env bash
# Fires 20 concurrent record_sale calls for the SAME player across different teams.
# Exactly one must succeed: row locks + the partial unique index prevent double purchase.
set -uo pipefail
DB=${DB:-auction_iq_test}
psql -q -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
reset role;
insert into players (id, event_id, name, origin, category, base_price) values
  ('30000000-0000-0000-0000-0000000000ff', '10000000-0000-0000-0000-000000000001', 'Race', 'indian', 'BAT', 1);
update auction_rules set squad_max = 30 where event_id = '10000000-0000-0000-0000-000000000001';
SQL
for i in $(seq 1 20); do
  team=$([ $((i % 2)) -eq 0 ] && echo 20000000-0000-0000-0000-000000000002 || echo 20000000-0000-0000-0000-000000000003)
  psql -q -d "$DB" -c "select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false); set role authenticated; select record_sale('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-0000000000ff','$team',2);" >/dev/null 2>&1 &
done
wait
n=$(psql -tA -d "$DB" -c "select count(*) from auction_transactions where player_id='30000000-0000-0000-0000-0000000000ff' and status='active'")
r=$(psql -tA -d "$DB" -c "select count(*) from team_rosters where player_id='30000000-0000-0000-0000-0000000000ff'")
if [ "$n" != "1" ] || [ "$r" != "1" ]; then echo "CONCURRENCY FAILED: $n active tx, $r roster rows"; exit 1; fi
echo "concurrency: OK (1 of 20 concurrent sales succeeded)"
