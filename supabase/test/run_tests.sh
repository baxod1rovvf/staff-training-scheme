#!/usr/bin/env bash
# Runs schema.sql on a fresh local Postgres with Supabase stand-ins, then the flow tests.
# Usage: supabase/test/run_tests.sh   (needs a running Postgres; set PSQL to override the connection)
set -euo pipefail
cd "$(dirname "$0")/../.."
PSQL=${PSQL:-"psql -h /tmp/pgtest -p 54329 -U postgres -v ON_ERROR_STOP=1 -q"}
$PSQL -c "drop database if exists edunest_test" -c "create database edunest_test" >/dev/null
$PSQL -d edunest_test -f supabase/test/supabase_stubs.sql >/dev/null
$PSQL -d edunest_test -f supabase/schema.sql >/dev/null 2>&1
$PSQL -d edunest_test -f supabase/schema.sql >/dev/null 2>&1   # running it twice must work
$PSQL -d edunest_test -f supabase/test/flow_test.sql 2>&1 | sed "s/^psql:[^ ]* NOTICE:  //" | grep -v "^$"
