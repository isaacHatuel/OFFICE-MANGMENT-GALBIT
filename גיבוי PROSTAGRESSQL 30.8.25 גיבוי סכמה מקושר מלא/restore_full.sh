#!/usr/bin/env bash
# Restore full plain SQL dump into running postgres container
# Usage: ./restore_full.sh <container-name> <db-user> <db-name>
set -euo pipefail
CONTAINER=${1:-panelpro-postgres-1}
DB_USER=${2:-panelpro_user}
DB_NAME=${3:-panelpro_db}
DUMP_PATH=/tmp/panelpro_db_full_2025_08_30.sql

echo "Copying dump into container $CONTAINER..."
docker cp "$(pwd)/panelpro_db_full_2025_08_30.sql" $CONTAINER:$DUMP_PATH

echo "Ensuring extensions exist (pg_trgm, unaccent)..."
docker exec -i $CONTAINER psql -U $DB_USER -d postgres -c "CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;"
docker exec -i $CONTAINER psql -U $DB_USER -d postgres -c "CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;"

echo "Terminating connections, dropping and recreating database $DB_NAME..."
docker exec -i $CONTAINER psql -U $DB_USER -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();"
docker exec -i $CONTAINER psql -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME; CREATE DATABASE $DB_NAME;"

echo "Importing dump into $DB_NAME..."
docker exec -i $CONTAINER psql -U $DB_USER -d $DB_NAME -f $DUMP_PATH

echo "Recreating trigram/unaccent-dependent indexes (best-effort)..."
# Add index recreation statements here if you know the exact names; example:
# docker exec -i $CONTAINER psql -U $DB_USER -d $DB_NAME -c "CREATE INDEX IF NOT EXISTS manufacturers_name_norm_trgm ON manufacturers USING gin (norm_brand(name));"

echo "Restore complete."
