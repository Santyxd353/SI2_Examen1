param([switch]$Rebuild)
. (Join-Path $PSScriptRoot 'local-common.ps1')
Push-Location $ProjectRoot
try {
    if (-not (Test-Path -LiteralPath '.env')) { throw 'Primero ejecuta scripts/setup.ps1.' }
    Start-LocalDatabase
    if ($Rebuild -or -not (Test-Path -LiteralPath 'dist/api/main.js')) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'La compilación falló.' }
    }
    $node = (Get-Command node.exe).Source
    $pidFile = Join-Path $ProjectRoot '.local/services.json'
    $services = @{}
    if (Test-Path -LiteralPath $pidFile) {
        $saved = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
        foreach ($entry in $saved.PSObject.Properties) { $services[$entry.Name]=$entry.Value }
    }
    foreach ($spec in @(@{Name='api';Port=3018;Args=@((Join-Path $ProjectRoot 'dist/api/main.js'))}, @{Name='web';Port=5173;Args=@((Join-Path $ProjectRoot 'node_modules/vite/bin/vite.js'),'--config',(Join-Path $ProjectRoot 'apps/web/vite.config.ts'))})) {
        if (Test-LocalPort $spec.Port) {
            $existing = $services[$spec.Name]
            $process = if ($existing) { Get-CimInstance Win32_Process -Filter "ProcessId=$($existing.pid)" } else { $null }
            if (-not $process -or -not $process.CommandLine.Contains($ProjectRoot)) { throw ('El puerto ' + $spec.Port + ' está ocupado por un proceso no registrado. No se ha modificado.') }
            continue
        }
        $quotedArgs = $spec.Args | ForEach-Object { '"' + $_ + '"' }
        $p = Start-Process -FilePath $node -ArgumentList $quotedArgs -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $ProjectRoot ('.local/' + $spec.Name + '.log')) -RedirectStandardError (Join-Path $ProjectRoot ('.local/' + $spec.Name + '-error.log'))
        $services[$spec.Name] = @{pid=$p.Id}
        $services | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding utf8
        for ($i=0; $i -lt 80 -and -not (Test-LocalPort $spec.Port); $i++) {
            if ($p.HasExited) { throw ($spec.Name + ' no arrancó. Revisa sus registros en .local.') }
            Start-Sleep -Milliseconds 250
        }
        if (-not (Test-LocalPort $spec.Port)) { throw ($spec.Name + ' no respondió a tiempo.') }
    }
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3018/api/health'
    if ($health.status -ne 'ok') { throw 'La API no está disponible.' }
    Write-Host 'Sistema disponible en http://localhost:5173'
} finally { Pop-Location }
