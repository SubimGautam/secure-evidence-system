#!/bin/sh
set -e

# The official postgres image bootstraps POSTGRES_USER as the cluster's
# superuser — Postgres won't even let it be demoted (it refuses to strip
# superuser from the bootstrap role, since that would leave the cluster with
# none). Superuser status silently defeats the audit_logs immutability
# policy: superusers bypass row security unconditionally, regardless of
# FORCE ROW LEVEL SECURITY (see migration 20260709073329_audit_log_immutability).
#
# So instead of trying to weaken the bootstrap role, the application
# connects at runtime as a second, ordinary role created here. It owns
# nothing — ALTER DEFAULT PRIVILEGES means every table the bootstrap role
# creates via Prisma migrations *from now on* automatically grants this role
# read/write, without a manual GRANT per migration. Not being the owner (and
# not being a superuser) is exactly what lets the existing RLS policies on
# audit_logs actually apply to it.
#
# Runs once, on first initialization of an empty data directory — same as
# every other script in docker-entrypoint-initdb.d/.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE "${POSTGRES_RUNTIME_USER}" WITH LOGIN PASSWORD '${POSTGRES_RUNTIME_PASSWORD}';
  GRANT CONNECT ON DATABASE "${POSTGRES_DB}" TO "${POSTGRES_RUNTIME_USER}";
  GRANT USAGE ON SCHEMA public TO "${POSTGRES_RUNTIME_USER}";
  ALTER DEFAULT PRIVILEGES FOR ROLE "${POSTGRES_USER}" IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${POSTGRES_RUNTIME_USER}";
  ALTER DEFAULT PRIVILEGES FOR ROLE "${POSTGRES_USER}" IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO "${POSTGRES_RUNTIME_USER}";
EOSQL
