param([switch]$SkipWorker)
. (Join-Path $PSScriptRoot 'local-common.ps1')
Push-Location $ProjectRoot
try {
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $pgBin = Get-PostgresBin
    New-Item -ItemType Directory -Path '.local' -Force | Out-Null
    if (-not (Test-Path -LiteralPath '.env')) {
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        $bytes = New-Object byte[] 48
        $rng.GetBytes($bytes); $secret = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
        $rng.GetBytes($bytes); $dbPassword = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
        $rng.Dispose()
        @("DATABASE_URL=postgresql://vestidor:$dbPassword@127.0.0.1:55418/vestidor18", "JWT_SECRET=$secret", 'API_PORT=3018', 'WEB_ORIGIN=http://localhost:5173', 'STORAGE_ROOT=.local/storage', 'PYTHON_PATH=workers/avatar/.venv/Scripts/python.exe') | Set-Content -LiteralPath '.env' -Encoding ascii
        Set-Content -LiteralPath '.local/pg-password' -Value $dbPassword -Encoding ascii
    }
    $config = Read-LocalConfig
    $dbUri = [Uri]$config.DATABASE_URL
    if ($dbUri.Host -ne '127.0.0.1' -or $dbUri.Port -ne 55418 -or $dbUri.AbsolutePath -ne '/vestidor18') { throw 'Este instalador solo prepara la base local vestidor18 en 127.0.0.1:55418. Usa Prisma manualmente para otra base.' }
    $cluster = Assert-ProjectPath (Join-Path $ProjectRoot '.local/pgdata')
    if (-not (Test-Path -LiteralPath (Join-Path $cluster 'PG_VERSION'))) {
        if (-not (Test-Path -LiteralPath '.local/pg-password')) {
            $password = [Uri]::UnescapeDataString($dbUri.UserInfo.Split(':',2)[1])
            Set-Content -LiteralPath '.local/pg-password' -Value $password -Encoding ascii
        }
        & (Join-Path $pgBin 'initdb.exe') -D $cluster -U vestidor --encoding=UTF8 --locale=C --auth-host=scram-sha-256 --auth-local=scram-sha-256 --pwfile=.local/pg-password
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el clúster local.' }
    }
    Start-LocalDatabase
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias web/API.' }
    & $node scripts/ensure-databases.cjs
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron preparar las bases de datos.' }
    & npm.cmd run db:generate
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar el cliente Prisma.' }
    & npm.cmd run db:migrate
    if ($LASTEXITCODE -ne 0) { throw 'Falló una migración. No se borraron datos.' }
    if (-not $SkipWorker) { & (Join-Path $PSScriptRoot 'setup-worker.ps1') }
    & npm.cmd run db:seed
    if ($LASTEXITCODE -ne 0) { throw 'Falló la semilla.' }
    & npm.cmd run db:prepare-test
    if ($LASTEXITCODE -ne 0) { throw 'Falló la preparación de pruebas.' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación.' }
    Write-Host 'Preparación terminada. Ejecuta scripts/start.ps1 para abrir el sistema.'
} finally { Pop-Location }
