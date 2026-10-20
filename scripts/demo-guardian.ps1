# Demo del guardian de secretos (gitleaks + hook pre-push), para video.
# Crea commits temporales con un indice aparte: no toca el working tree, el
# indice ni las ramas, y al final borra los objetos que creo.
# NUNCA hace push: el hook se ejecuta directo, simulando lo que recibiria de
# git push por stdin, sin contactar ningun remoto.
#
# Uso (desde cualquier carpeta del repo):
#   powershell -ExecutionPolicy Bypass -File scripts\demo-guardian.ps1

$ErrorActionPreference = 'Stop'
$root = (git rev-parse --show-toplevel).Trim()
Set-Location $root

# El hook es un script sh: usar el sh de Git for Windows.
$sh = (Get-Command sh -ErrorAction SilentlyContinue).Source
if (-not $sh) {
    $dir = (git --exec-path).Trim()
    while ($dir -and -not $sh) {
        foreach ($c in "bin\sh.exe", "usr\bin\sh.exe") {
            if (Test-Path (Join-Path $dir $c)) { $sh = Join-Path $dir $c; break }
        }
        $dir = Split-Path $dir -Parent
    }
}
if (-not $sh) { throw "No encontre sh.exe (Git for Windows)." }

$objects = (Resolve-Path (git rev-parse --git-path objects).Trim()).Path
$head = (git rev-parse HEAD).Trim()
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("demo-guardian-" + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
$created = @()

function Step($text) { Write-Host ""; Write-Host $text -ForegroundColor Cyan }
function Result($ok, $okText, $failText) {
    if ($ok) { Write-Host "   OK: $okText" -ForegroundColor Green }
    else { Write-Host "   BLOQUEADO: $failText" -ForegroundColor Red }
}

# Commit temporal = HEAD + un archivo, sin rama ni reflog. Registra los
# objetos nuevos para borrarlos al final.
function New-TempCommit($name, $content, $msg) {
    $file = Join-Path $tmp $name
    [IO.File]::WriteAllText($file, $content)
    $blob = (git hash-object --no-filters $file).Trim()
    git cat-file -e $blob 2>$null
    $blobExisted = ($LASTEXITCODE -eq 0)
    git hash-object -w --no-filters $file | Out-Null
    if (-not $blobExisted) { $script:created += $blob }

    $env:GIT_INDEX_FILE = Join-Path $tmp "index"
    try {
        git read-tree HEAD
        git update-index --add --cacheinfo "100644,$blob,$name"
        $tree = (git write-tree).Trim()
    } finally {
        Remove-Item Env:GIT_INDEX_FILE
        Remove-Item (Join-Path $tmp "index") -ErrorAction SilentlyContinue
    }
    $script:created += $tree
    $commit = (git commit-tree $tree -p HEAD -m $msg).Trim()
    $script:created += $commit
    return $commit
}

# Pasa al hook la misma linea que le daria "git push" (con LF, no CRLF).
function Invoke-PrePush($localSha) {
    & $sh -c "printf '%s\n' 'refs/heads/main $localSha refs/heads/main $head' | sh .githooks/pre-push"
    return ($LASTEXITCODE -eq 0)
}

try {
    Step "1) Escaneo de todo el historial"
    gitleaks git . --config .gitleaks.toml --log-opts="--all" --redact --no-banner
    Result ($LASTEXITCODE -eq 0) "historial sin secretos" "gitleaks encontro posibles secretos"

    Step "2) Intento subir una llave secreta FALSA"
    $fake = "S" + ("FAKE" * 14).Substring(0, 55)   # inventada, no es una llave real
    $bad = New-TempCommit "demo-llave-falsa.txt" "STELLAR_SECRET=$fake`n" "demo: llave falsa (no subir)"
    Result (Invoke-PrePush $bad) "el hook dejo pasar el commit (no deberia)" "el hook detuvo el push de la llave"

    Step "3) Sin la llave"
    $good = New-TempCommit "demo-sin-secretos.txt" "demo-guardian: sin secretos`n" "demo: commit limpio"
    Result (Invoke-PrePush $good) "el hook deja pasar el commit limpio" "el hook bloqueo un commit limpio (no deberia)"
}
finally {
    foreach ($o in $created) {
        Remove-Item (Join-Path $objects ($o.Substring(0, 2) + "\" + $o.Substring(2))) -Force -ErrorAction SilentlyContinue  # git los crea de solo lectura
    }
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    $left = @($created | Where-Object { git cat-file -e $_ 2>$null; $LASTEXITCODE -eq 0 })
    Write-Host ""
    if ($left.Count -eq 0) { Write-Host "Limpio" -ForegroundColor Green }
    else { Write-Host "Quedaron objetos temporales: $($left -join ', ')" -ForegroundColor Red }
}
