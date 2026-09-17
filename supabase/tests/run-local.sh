#!/usr/bin/env bash
set -euo pipefail
# Run against a NEW, isolated PostgreSQL cluster, never an existing server.
# Requires PostgreSQL initdb, pg_ctl and psql on PATH; run as a non-root user.
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/dairy-sql.XXXXXX")
export PGHOST="$test_dir" PGPORT=55439 PGDATABASE=postgres
cleanup() { pg_ctl -D "$test_dir/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$test_dir"; }
trap cleanup EXIT
initdb -D "$test_dir/db" -A trust >/dev/null
pg_ctl -D "$test_dir/db" -l "$test_dir/server.log" -o "-k $test_dir -p $PGPORT -h ''" start >/dev/null
psql -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap.sql -f supabase/migrations/202609160001_intake.sql -f supabase/tests/security.sql
python3 supabase/tests/caps.py
