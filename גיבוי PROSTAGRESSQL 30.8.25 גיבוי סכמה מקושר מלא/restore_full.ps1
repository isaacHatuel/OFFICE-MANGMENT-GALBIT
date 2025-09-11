Param(
    [string]$Container = 'panelpro-postgres-1',
    [string]$DbUser = 'panelpro_user',
    [string]$DbName = 'panelpro_db'
)

Write-Host "Copying dump into container $Container..."
# Use script folder so running from another cwd works
$dumpPath = Join-Path $PSScriptRoot 'panelpro_db_full_2025_08_30.sql'
if(!(Test-Path $dumpPath)){ throw "Dump file not found at $dumpPath" }
docker cp "$dumpPath" ${Container}:/tmp/panelpro_db_full_2025_08_30.sql

Write-Host "Ensuring extensions exist (pg_trgm, unaccent)..."
docker exec -i $Container psql -U $DbUser -d postgres -c "CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;"
docker exec -i $Container psql -U $DbUser -d postgres -c "CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;"

Write-Host "Terminating connections, dropping and recreating database $DbName..."
docker exec -i $Container psql -U $DbUser -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DbName' AND pid <> pg_backend_pid();"
docker exec -i $Container psql -U $DbUser -d postgres -c "DROP DATABASE IF EXISTS $DbName;"
docker exec -i $Container psql -U $DbUser -d postgres -c "CREATE DATABASE $DbName;"

Write-Host "Importing dump into $DbName..."
docker exec -i $Container psql -U $DbUser -d $DbName -f /tmp/panelpro_db_full_2025_08_30.sql

Write-Host "Restore complete."
