# Run the Bookshop branch runtime in the foreground (pilot / manual use).
# Starts the branch API and the sync runner; both read backend/.env.

$ErrorActionPreference = 'Stop'
$backend = (Resolve-Path "$PSScriptRoot/../backend").Path

if (-not (Test-Path "$backend/dist/server.js")) {
    Write-Host "Backend not built. Run branch/setup-branch.ps1 first." -ForegroundColor Red
    exit 1
}

Write-Host "Starting sync runner..." -ForegroundColor Cyan
$sync = Start-Process -FilePath 'node' -ArgumentList 'dist/sync-runner/index.js' -WorkingDirectory $backend -PassThru

Write-Host "Starting branch API..." -ForegroundColor Cyan
try {
    node "$backend/dist/server.js"
}
finally {
    if ($sync -and -not $sync.HasExited) { Stop-Process -Id $sync.Id -ErrorAction SilentlyContinue }
}
