#!/usr/bin/env bash
# Runs the core migration and the access-rule tests against a throwaway database on plain Postgres.
# Usage: PGHOST=… PGPORT=… PGUSER=… supabase/tests/run.sh   (any Postgres 15+ you can create databases on)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
db="accountability_test_$$"
createdb "$db"
trap 'dropdb --if-exists "$db"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$db" -c 'create extension if not exists pgcrypto' -f "$here/shim.sql" \
  -f "$here/../migrations/20261117000000_init.sql"
psql -d "$db" -f "$here/rls.test.sql" 2>&1 | sed -E 's/^psql:.*NOTICE:  //'
