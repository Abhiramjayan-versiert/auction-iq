#!/usr/bin/env bash
# Applies all migrations to a throwaway local PostgreSQL database and runs the SQL test suite.
# Usage: PGHOST=/tmp/pgaiq PGPORT=54329 PGUSER=postgres scripts/db-test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-auction_iq_test}
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
for f in supabase/tests/[1-9]*; do echo "== $f"; case "$f" in *.sql) psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f";; *.sh) DB=$DB bash "$f";; esac; done
echo "All database tests passed."
