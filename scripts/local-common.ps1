$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
function Assert-ProjectPath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $full.StartsWith($ProjectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'La ruta no pertenece al proyecto.' }
    return $full
}
function Read-LocalConfig {
    $settings = @{}
    foreach ($line in Get-Content -LiteralPath (Join-Path $ProjectRoot '.env')) {
        if ($line -match '^([A-Z_]+)=(.*)$') { $settings[$Matches[1]] = $Matches[2] }
    }
    return $settings
}
function Get-PostgresBin {
    if ($env:VESTIDOR_PG_BIN) { return $env:VESTIDOR_PG_BIN }
    $candidate = Join-Path $env:ProgramFiles 'PostgreSQL/18/bin'
    if (-not (Test-Path -LiteralPath (Join-Path $candidate 'postgres.exe'))) { throw 'Instala PostgreSQL 18 o configura VESTIDOR_PG_BIN con su carpeta bin.' }
    return $candidate
}
function Test-LocalPort([int]$Port) {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        if (-not $task.Wait(300)) { return $false }
        return $client.Connected
    } catch { return $false } finally { $client.Dispose() }
}
function Start-LocalDatabase {
    $pgBin = Get-PostgresBin
    $cluster = Assert-ProjectPath (Join-Path $ProjectRoot '.local/pgdata')
    if (-not (Test-Path -LiteralPath (Join-Path $cluster 'PG_VERSION'))) { throw 'Primero ejecuta scripts/setup.ps1.' }
    & (Join-Path $pgBin 'pg_ctl.exe') status -D $cluster *> $null
    if ($LASTEXITCODE -eq 0) { return }
    if (Test-LocalPort 55418) { throw 'El puerto 55418 está ocupado por otra instancia. No se modificó ese proceso.' }
    $process = Start-Process -FilePath (Join-Path $pgBin 'postgres.exe') -ArgumentList @('-D', ('"' + $cluster + '"'), '-p', '55418', '-h', '127.0.0.1') -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $ProjectRoot '.local/postgres-out.log') -RedirectStandardError (Join-Path $ProjectRoot '.local/postgres-error.log')
    for ($i=0; $i -lt 40; $i++) {
        if (Test-LocalPort 55418) { return }
        if ($process.HasExited) { throw 'PostgreSQL no arrancó; revisa .local/postgres-error.log.' }
        Start-Sleep -Milliseconds 250
    }
    throw 'PostgreSQL no respondió en el tiempo previsto.'
}
