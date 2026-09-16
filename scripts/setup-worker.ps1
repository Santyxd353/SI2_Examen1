. (Join-Path $PSScriptRoot 'local-common.ps1')
Push-Location $ProjectRoot
try {
    $python = Join-Path $ProjectRoot 'workers/avatar/.venv/Scripts/python.exe'
    if (-not (Test-Path -LiteralPath $python)) {
        & py -3.12 -m venv workers/avatar/.venv
        if ($LASTEXITCODE -ne 0) { throw 'Instala Python 3.12 con su lanzador py.' }
    }
    & $python -m pip install -r workers/avatar/requirements.lock.txt
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias de Python.' }
    New-Item -ItemType Directory -Path '.local/worker' -Force | Out-Null
    $resources = @(
        @{File='pose_landmarker.task'; Url='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'; Hash='5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1'},
        @{File='blender.zip'; Url='https://download.blender.org/release/Blender4.5/blender-4.5.3-windows-x64.zip'; Hash='6b657c8bdd3a7b65b07b9e1ae17eb4be7dd4aa23121da7f3d3354fc2551330a7'}
    )
    foreach ($resource in $resources) {
        $destination = Assert-ProjectPath (Join-Path $ProjectRoot ('.local/worker/' + $resource.File))
        if (-not (Test-Path -LiteralPath $destination)) {
            Write-Host ('Descargando ' + $resource.File + ' desde su proveedor oficial...')
            Invoke-WebRequest -Uri $resource.Url -OutFile $destination -UseBasicParsing
        }
        if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $resource.Hash) { throw ('La descarga no coincide con la versión verificada: ' + $resource.File) }
    }
    if (-not (Test-Path -LiteralPath '.local/worker/blender-4.5.3-windows-x64/blender.exe')) {
        Expand-Archive -LiteralPath '.local/worker/blender.zip' -DestinationPath '.local/worker'
    }
    & $python workers/avatar/process.py --check
    if ($LASTEXITCODE -ne 0) { throw 'El procesador no está disponible.' }
    & $python workers/avatar/process.py --demo .local/storage/public
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron generar los recursos de referencia.' }
} finally { Pop-Location }
