#!/usr/bin/env bash
# Two operators type the SAME new player at the same moment for different teams:
# exactly one player row and one sale must result.
set -uo pipefail
DB=${DB:-auction_iq_test}
for i in $(seq 1 12); do
  team=$([ $((i % 2)) -eq 0 ] && echo Bravo || echo Echo)
  psql -q -d "$DB" -c "select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',false); set role authenticated; select record_live_entry('10000000-0000-0000-0000-0000000000dd','Race Condition Kid',8,(select id from teams where name='$team' and event_id='10000000-0000-0000-0000-0000000000dd'),3);" >/dev/null 2>&1 &
done
wait
p=$(psql -tA -d "$DB" -c "select count(*) from players where event_id='10000000-0000-0000-0000-0000000000dd' and name_key='race condition kid'")
s=$(psql -tA -d "$DB" -c "select count(*) from auction_transactions t join players p on p.id=t.player_id where p.name_key='race condition kid' and t.status='active'")
if [ "$p" != "1" ] || [ "$s" != "1" ]; then echo "LIVE CONCURRENCY FAILED: $p players, $s sales"; exit 1; fi
echo "live entry concurrency: OK (12 simultaneous entries → 1 player, 1 sale)"
