# Wipe this till's local database and pull a fresh copy from the cloud.
#
# Needed when the cloud catalogue has had products REMOVED. A normal sync only
# adds and updates, so a product deleted centrally lives on at the branch
# forever - and selling one fails to push, because the cloud no longer knows it.
#
#   .\reset-branch-data.ps1
#
# Refuses to run if the till is holding sales it has not sent yet.

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$services = @('BookshopBranchApi', 'BookshopBranchSync')
$dbPath = Join-Path $backend 'branch.db'

$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
         ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Write-Host 'Run this from an elevated PowerShell (right-click > Run as administrator).' -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "$backend\.env")) {
    Write-Host 'backend\.env is missing. Run setup-branch.ps1 first.' -ForegroundColor Red
    exit 1
}

# --- anything unsent? then stop -------------------------------------------
if (Test-Path $dbPath) {
    Write-Host 'Checking for sales this till has not sent yet...' -ForegroundColor Cyan
    Push-Location $backend
    try {
        $pending = & node -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.outbox.count({ where: { sentAt: null } })
  .then(n => { console.log(n); return db.\$disconnect(); })
  .catch(() => { console.log('unknown'); process.exit(0); });
" 2>$null
    }
    catch { $pending = 'unknown' }
    finally { Pop-Location }

    $pending = ("$pending").Trim()
    if ($pending -eq 'unknown') {
        Write-Host "Could not read the outbox. Not wiping - check the till manually." -ForegroundColor Red
        exit 1
    }
    if ([int]$pending -gt 0) {
        Write-Host "`n$pending item(s) still waiting to reach the cloud." -ForegroundColor Red
        Write-Host 'Wiping now would lose them. Get the till online, let it sync, then run this again.' -ForegroundColor Red
        exit 1
    }
    Write-Host '  nothing pending.' -ForegroundColor Green
}

foreach ($s in $services) {
    if (Get-Service -Name $s -ErrorAction SilentlyContinue) { Stop-Service $s -Force -ErrorAction SilentlyContinue }
}

if (Test-Path $dbPath) {
    $bak = "$dbPath.$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
    Move-Item $dbPath $bak -Force
    Write-Host "  old database kept as $(Split-Path $bak -Leaf)" -ForegroundColor Yellow
}
Get-ChildItem $backend -Filter 'branch.db-*' -ErrorAction SilentlyContinue | Remove-Item -Force

Write-Host 'Rebuilding an empty database and the app...' -ForegroundColor Cyan
Push-Location $backend
try {
    $env:BRANCH_BUILD = '1'
    node scripts/gen-sqlite-schema.mjs
    npx prisma generate --schema prisma/schema.sqlite.prisma | Out-Null
    npx prisma db push --schema prisma/schema.sqlite.prisma --skip-generate | Out-Null
    npm run build | Out-Null
}
finally {
    Remove-Item Env:\BRANCH_BUILD -ErrorAction SilentlyContinue
    Pop-Location
}
Push-Location $frontend; npm run build | Out-Null; Pop-Location

foreach ($s in $services) { Start-Service $s -ErrorAction SilentlyContinue }
Write-Host 'Services started. Waiting for the first pull...' -ForegroundColor Cyan

# The sync runner pulls on its own cadence; give it a reasonable window.
$books = 0
for ($i = 0; $i -lt 20 -and $books -eq 0; $i++) {
    Start-Sleep -Seconds 6
    Push-Location $backend
    try {
        $books = [int](& node -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.book.count().then(n => { console.log(n); return db.\$disconnect(); }).catch(() => console.log(0));
" 2>$null).Trim()
    }
    catch { $books = 0 }
    finally { Pop-Location }
    Write-Host "  products pulled so far: $books"
}

if ($books -eq 0) {
    Write-Host "`nNothing arrived. Check SYNC_TOKEN and CLOUD_URL in backend\.env, and backend\logs\BookshopBranchSync.err.log" -ForegroundColor Red
    exit 1
}

Write-Host "`nDone: $books products. Sign in and confirm the stock figures look right." -ForegroundColor Green
