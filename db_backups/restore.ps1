Param(
  [Parameter(Mandatory=$true)][string]$File,
  [string]$DbContainer = 'offc_mngr-db-1',
  [string]$DbName = 'officedb',
  [string]$DbUser = 'officeuser'
)
if (!(Test-Path $File)) { Write-Error "File not found: $File"; exit 1 }
Write-Host "Copying $File to container..."
docker cp $File $DbContainer`:/tmp/restore.sql
Write-Host "Restoring ..."
docker exec -e PGPASSWORD=officepass $DbContainer bash -lc "psql -U $DbUser -d $DbName -f /tmp/restore.sql"
Write-Host "Done."