Param(
  [string]$DbContainer = 'offc_mngr-db-1'
)

Write-Host 'Exporting distinct client names from restore_tmp.client...'
$rawSql = @"SELECT DISTINCT btrim(client_name) FROM client WHERE client_name IS NOT NULL AND btrim(client_name)<>'' ORDER BY 1;"@
# Wrap for bash -lc; escape embedded double quotes
$exportCmd = "psql -U officeuser -d restore_tmp -At -c \"$rawSql\""
$names = docker exec -i $DbContainer bash -lc $exportCmd
if(-not $names){ throw 'No client names extracted' }

$tmpFile = [System.IO.Path]::GetTempFileName()
$sb = New-Object System.Text.StringBuilder
foreach($n in $names -split "`n") {
    $trim = $n.Trim()
    if([string]::IsNullOrWhiteSpace($trim)) { continue }
    $esc = $trim -replace "'","''"
    [void]$sb.AppendLine("INSERT INTO clients(name) VALUES ('$esc') ON CONFLICT DO NOTHING;")
}
[IO.File]::WriteAllText($tmpFile,$sb.ToString(),[System.Text.Encoding]::UTF8)
Write-Host "Generated SQL: $tmpFile"

Write-Host 'Loading into officedb.clients...'
Get-Content $tmpFile | docker exec -i $DbContainer psql -U officeuser -d officedb -v ON_ERROR_STOP=1 -f -

Write-Host 'Row count:'
docker exec -i $DbContainer psql -U officeuser -d officedb -c "SELECT COUNT(*) FROM clients;"
