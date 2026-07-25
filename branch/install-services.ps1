# Install the Bookshop branch runtime as always-on Windows services via NSSM.
# Prereqs: run setup-branch.ps1 first; install NSSM (https://nssm.cc) on PATH; run elevated.

$ErrorActionPreference = 'Stop'

if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
    Write-Host "nssm.exe not found on PATH. Install NSSM from https://nssm.cc first." -ForegroundColor Red
    exit 1
}

$backend = (Resolve-Path "$PSScriptRoot/../backend").Path
$node = (Get-Command node).Source

function Install-BranchService($name, $script, $extraEnv) {
    if (nssm status $name 2>$null) {
        nssm stop $name 2>$null | Out-Null
        nssm remove $name confirm 2>$null | Out-Null
    }
    nssm install $name $node "$backend\$script"
    nssm set $name AppDirectory $backend
    nssm set $name AppStdout "$backend\logs\$name.log"
    nssm set $name AppStderr "$backend\logs\$name.err.log"
    nssm set $name Start SERVICE_AUTO_START
    if ($extraEnv) { nssm set $name AppEnvironmentExtra $extraEnv }
}

New-Item -ItemType Directory -Force -Path "$backend\logs" | Out-Null
Install-BranchService 'BookshopBranchApi'  'dist\server.js'            'SYNC_ROLE=branch'
Install-BranchService 'BookshopBranchSync' 'dist\sync-runner\index.js' 'SYNC_LOOP=1'
nssm start BookshopBranchApi
nssm start BookshopBranchSync
Write-Host "Installed and started: BookshopBranchApi, BookshopBranchSync." -ForegroundColor Green
Write-Host "Open http://127.0.0.1:4000 in a kiosk browser for the POS." -ForegroundColor Green
