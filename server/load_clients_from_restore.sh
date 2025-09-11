#!/usr/bin/env bash
# Load distinct client names from legacy restore_tmp.client into normalized officedb.clients
# Preconditions:
#   - Container has both databases: restore_tmp (legacy dump) and officedb (normalized)
#   - Table restore_tmp.public.client exists with column client_name
#   - Table officedb.public.clients exists with UNIQUE(name)
# Usage inside container:
#   bash /server/load_clients_from_restore.sh
# From host (project root):
#   docker exec -i offc_mngr-db-1 bash /server/load_clients_from_restore.sh
# Idempotent: uses ON CONFLICT DO NOTHING

set -euo pipefail

LEGACY_DB="restore_tmp"
TARGET_DB="officedb"
DB_USER="officeuser"
TMP_LIST="/tmp/_client_names.txt"
TMP_SQL="/tmp/_clients_load.sql"

# Validate legacy table exists
if ! psql -U "$DB_USER" -d "$LEGACY_DB" -At -c "SELECT 1 FROM information_schema.tables WHERE table_name='client' LIMIT 1;" | grep -q 1; then
  echo "[clients-load] ERROR: legacy table 'client' not found in $LEGACY_DB" >&2
  exit 1
fi

echo "[clients-load] Extracting distinct client names from ${LEGACY_DB}.client ..."
psql -U "$DB_USER" -d "$LEGACY_DB" -At -c "SELECT DISTINCT btrim(client_name) FROM client WHERE client_name IS NOT NULL AND btrim(client_name)<>'' ORDER BY 1;" > "$TMP_LIST"

COUNT_SRC=$(wc -l < "$TMP_LIST" | tr -d ' ')
echo "[clients-load] Found $COUNT_SRC distinct names"

if [ "$COUNT_SRC" -eq 0 ]; then
  echo "[clients-load] Nothing to load. Exiting."; exit 0
fi

: > "$TMP_SQL"
while IFS= read -r line; do
  [ -z "$line" ] && continue
  esc=${line//"'"/"''"}
  printf "INSERT INTO clients(name) VALUES ('%s') ON CONFLICT DO NOTHING;\n" "$esc" >> "$TMP_SQL"
done < "$TMP_LIST"

LOAD_COUNT=$(wc -l < "$TMP_SQL" | tr -d ' ')
echo "[clients-load] Generated $LOAD_COUNT INSERT statements"

before=$(psql -U "$DB_USER" -d "$TARGET_DB" -At -c "SELECT COUNT(*) FROM clients;")
psql -U "$DB_USER" -d "$TARGET_DB" -f "$TMP_SQL" > /dev/null
after=$(psql -U "$DB_USER" -d "$TARGET_DB" -At -c "SELECT COUNT(*) FROM clients;")
added=$(( after - before ))

echo "[clients-load] Done. clients before=$before after=$after added=$added"
