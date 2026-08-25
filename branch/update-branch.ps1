# Update a branch till to the latest code, safely.
#
# Data (products, prices, users, stock) already arrives on its own through the
# sync runner. This is only for code changes, which need a rebuild.
#
#   .\update-branch.ps1              update now
#   .\update-branch.ps1 -Check       say whether an update is available, change nothing
#   .\update-branch.ps1 -Schedule    also run it nightly at 03:20
#
# Rolls back to the previous commit and database if the till does not come back.

param(
    [switch]$Check,
    [switch]$Schedule
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$services = @('BookshopBranchApi', 'BookshopBranchSync')

function Say($msg, $colour = 'Cyan') { Write-Host $msg -ForegroundColor $colour }

# --- is an update even available? ------------------------------------------
Push-Location $root
try {
    git fetch --quiet origin develop
    $local = (git rev-parse HEAD).Trim()
    $remote = (git rev-parse origin/develop).Trim()
    $behind = (git rev-list --count "$local..$remote").Trim()
}
finally { Pop-Location }

if ($local -eq $remote) {
    Say "Already up to date ($($local.Substring(0,7))). Nothing to do." 'Green'
    if (-not $Schedule) { return }
}
elseif ($Check) {
    Say "$behind update(s) available: $($local.Substring(0,7)) -> $($remote.Substring(0,7))" 'Yellow'
    Push-Location $root
    try { git --no-pager log --oneline "$local..$remote" | ForEach-Object { "    $_" } }
    finally { Pop-Location }
    return
}

if ($Schedule) {
    $admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
             ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $admin) { Write-Host 'Scheduling needs an elevated PowerShell.' -ForegroundColor Red; exit 1 }
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    # 03:20 so it lands well after closing and well before opening.
    $trigger = New-ScheduledTaskTrigger -Daily -At 3:20am
    Register-ScheduledTask -TaskName 'BookshopBranchUpdate' -Action $action -Trigger $trigger `
        -RunLevel Highest -User 'SYSTEM' -Force | Out-Null
    Say 'Nightly update scheduled for 03:20 (task BookshopBranchUpdate).' 'Green'
    if ($local -eq $remote) { return }
}

if ($Check) { return }

# --- elevation is needed to stop and start the services ---------------------
$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
         ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Write-Host 'Run this from an elevated PowerShell (right-click > Run as administrator).' -ForegroundColor Red
    exit 1
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dbPath = Join-Path $backend 'branch.db'
$dbBackup = Join-Path $backend "branch.db.$stamp.bak"

Say "Updating $($local.Substring(0,7)) -> $($remote.Substring(0,7))"

# --- stop, so nothing writes to the database mid-update ---------------------
foreach ($s in $services) {
    if (Get-Service -Name $s -ErrorAction SilentlyContinue) { Stop-Service $s -Force -ErrorAction SilentlyContinue }
}
if (Test-Path $dbPath) {
    Copy-Item $dbPath $dbBackup -Force
    Say "  database backed up to $(Split-Path $dbBackup -Leaf)"
}

function Restore-Previous($reason) {
    Write-Host "`n$reason" -ForegroundColor Red
    Write-Host 'Rolling back.' -ForegroundColor Red
    foreach ($s in $services) { Stop-Service $s -Force -ErrorAction SilentlyContinue }
    Push-Location $root
    try { git reset --hard $local --quiet } finally { Pop-Location }
    if (Test-Path $dbBackup) { Copy-Item $dbBackup $dbPath -Force }
    try {
        Push-Location $backend
        $env:BRANCH_BUILD = '1'
        node scripts/gen-sqlite-schema.mjs | Out-Null
        npx prisma generate --schema prisma/schema.sqlite.prisma | Out-Null
        npm run build | Out-Null
        Remove-Item Env:\BRANCH_BUILD -ErrorAction SilentlyContinue
        Pop-Location
        Push-Location $frontend; npm run build | Out-Null; Pop-Location
    }
    catch { Write-Host 'Rebuild during rollback failed. The till needs attention.' -ForegroundColor Red }
    foreach ($s in $services) { Start-Service $s -ErrorAction SilentlyContinue }
    Write-Host "Rolled back to $($local.Substring(0,7))." -ForegroundColor Yellow
    exit 1
}

try {
    Push-Location $root
    $lockBefore = (Get-FileHash "$backend\package-lock.json").Hash + (Get-FileHash "$frontend\package-lock.json").Hash
    git pull --ff-only origin develop | Out-Null
    $lockAfter = (Get-FileHash "$backend\package-lock.json").Hash + (Get-FileHash "$frontend\package-lock.json").Hash
    Pop-Location

    if ($lockBefore -ne $lockAfter) {
        Say '  dependencies changed - installing'
        Push-Location $backend;  npm install --no-audit --no-fund | Out-Null; Pop-Location
        Push-Location $frontend; npm install --no-audit --no-fund | Out-Null; Pop-Location
    }

    Say '  rebuilding the branch database schema and API'
    Push-Location $backend
    $env:BRANCH_BUILD = '1'
    node scripts/gen-sqlite-schema.mjs | Out-Null
    npx prisma generate --schema prisma/schema.sqlite.prisma | Out-Null
    npx prisma db push --schema prisma/schema.sqlite.prisma --skip-generate | Out-Null
    npm run build | Out-Null
    Remove-Item Env:\BRANCH_BUILD -ErrorAction SilentlyContinue
    Pop-Location

    Say '  rebuilding the web app'
    Push-Location $frontend; npm run build | Out-Null; Pop-Location
}
catch {
    Remove-Item Env:\BRANCH_BUILD -ErrorAction SilentlyContinue
    Restore-Previous "Update failed: $($_.Exception.Message)"
}

foreach ($s in $services) { Start-Service $s -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 6

# --- does the till actually answer? ----------------------------------------
$ok = $false
for ($i = 0; $i -lt 5 -and -not $ok; $i++) {
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:4000/health' -UseBasicParsing -TimeoutSec 8
        if ($r.StatusCode -eq 200) { $ok = $true }
    }
    catch { Start-Sleep -Seconds 3 }
}
if (-not $ok) { Restore-Previous 'The till did not answer on http://127.0.0.1:4000/health after the update.' }

foreach ($s in $services) {
    $state = (Get-Service -Name $s -ErrorAction SilentlyContinue).Status
    if ($state -ne 'Running') { Restore-Previous "$s is $state after the update." }
}

# Keep the last few database backups, discard the rest.
Get-ChildItem $backend -Filter 'branch.db.*.bak' | Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 5 | Remove-Item -Force -ErrorAction SilentlyContinue

Say "`nUpdated to $($remote.Substring(0,7)). Both services running, till answering." 'Green'
