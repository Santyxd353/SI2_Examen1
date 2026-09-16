. (Join-Path $PSScriptRoot 'local-common.ps1')
$pidFile = Join-Path $ProjectRoot '.local/services.json'
if (Test-Path -LiteralPath $pidFile) {
    $services = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
    foreach ($entry in $services.PSObject.Properties) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($entry.Value.pid)"
        if ($process) {
            if ($process.Name -ne 'node.exe' -or -not $process.CommandLine.Contains($ProjectRoot)) { throw 'El identificador fue reutilizado por otro proceso. No se detuvo.' }
            Stop-Process -Id $process.ProcessId
        }
    }
    Remove-Item -LiteralPath (Assert-ProjectPath $pidFile)
}
$cluster = Assert-ProjectPath (Join-Path $ProjectRoot '.local/pgdata')
$pgBin = Get-PostgresBin
& (Join-Path $pgBin 'pg_ctl.exe') status -D $cluster *> $null
if ($LASTEXITCODE -eq 0) {
    & (Join-Path $pgBin 'pg_ctl.exe') stop -D $cluster -m fast
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo detener la base local.' }
}
Write-Host 'Servicios del proyecto detenidos. Los datos se conservan.'
