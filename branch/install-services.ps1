# Install the Bookshop branch runtime as always-on Windows services via NSSM.
# Prereqs: run setup-branch.ps1 first; install NSSM (https://nssm.cc) on PATH; run elevated.

$ErrorActionPreference = 'Stop'

$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
         ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Write-Host "Run this from an elevated PowerShell (right-click > Run as administrator)." -ForegroundColor Red
    exit 1
}

# Fetches NSSM if it is missing. Elevation is already checked above, so writing
# to C:\tools and the machine PATH is safe here.
function Install-Nssm {
    $dest = 'C:\tools'
    $exe = Join-Path $dest 'nssm.exe'
    if (Test-Path $exe) { return $exe }

    $url = 'https://nssm.cc/release/nssm-2.24.zip'
    $zip = Join-Path $env:TEMP 'nssm-2.24.zip'
    Write-Host "  downloading $url" -ForegroundColor Cyan
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

    # Printed rather than pinned: NSSM publishes no per-release checksum, so this
    # is here for you to compare against nssm.cc if you want the assurance.
    Write-Host "  SHA256 $((Get-FileHash $zip -Algorithm SHA256).Hash)" -ForegroundColor DarkGray

    $tmp = Join-Path $env:TEMP "nssm-$(Get-Random)"
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $src = Get-ChildItem $tmp -Recurse -Filter nssm.exe |
           Where-Object { $_.FullName -match '\\win64\\' } | Select-Object -First 1
    if (-not $src) { throw 'win64\nssm.exe was not in the download.' }

    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item $src.FullName $exe -Force
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $zip -Force -ErrorAction SilentlyContinue

    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    if ($machine -notlike "*$dest*") {
        [Environment]::SetEnvironmentVariable('Path', "$machine;$dest", 'Machine')
    }
    $env:Path = "$env:Path;$dest"   # so this run can use it without reopening
    Write-Host "  installed $exe" -ForegroundColor Cyan
    return $exe
}

if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
    Write-Host "NSSM not found." -ForegroundColor Yellow
    try {
        Install-Nssm | Out-Null
    } catch {
        Write-Host "Could not install NSSM automatically: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Download it from https://nssm.cc and put win64\nssm.exe on the PATH." -ForegroundColor Red
        exit 1
    }
}

$backend = (Resolve-Path "$PSScriptRoot/../backend").Path
$node = (Get-Command node).Source

if (-not (Test-Path "$backend\dist\server.js")) {
    Write-Host "Backend not built. Run setup-branch.ps1 first." -ForegroundColor Red
    exit 1
}

# nssm reports ordinary conditions on stderr, which PowerShell turns into a
# terminating error under ErrorActionPreference=Stop. Route it away.
function Invoke-Nssm {
    $out = & nssm @args 2>&1
    return ($out | Out-String).Trim()
}

function Install-BranchService($name, $script, $extraEnv) {
    # Ask Windows, not nssm: `nssm status` on a service that does not exist yet
    # writes to stderr and would abort the script on a first install.
    if (Get-Service -Name $name -ErrorAction SilentlyContinue) {
        Write-Host "  replacing existing service $name" -ForegroundColor Yellow
        Invoke-Nssm stop $name | Out-Null
        Invoke-Nssm remove $name confirm | Out-Null
        Start-Sleep -Seconds 2
    }
    Invoke-Nssm install $name $node "$backend\$script" | Out-Null
    Invoke-Nssm set $name AppDirectory $backend | Out-Null
    Invoke-Nssm set $name AppStdout "$backend\logs\$name.log" | Out-Null
    Invoke-Nssm set $name AppStderr "$backend\logs\$name.err.log" | Out-Null
    Invoke-Nssm set $name Start SERVICE_AUTO_START | Out-Null
    if ($extraEnv) { Invoke-Nssm set $name AppEnvironmentExtra $extraEnv | Out-Null }
    Write-Host "  installed $name" -ForegroundColor Cyan
}

New-Item -ItemType Directory -Force -Path "$backend\logs" | Out-Null
Install-BranchService 'BookshopBranchApi'  'dist\server.js'            'SYNC_ROLE=branch'
Install-BranchService 'BookshopBranchSync' 'dist\sync-runner\index.js' 'SYNC_LOOP=1'

Invoke-Nssm start BookshopBranchApi | Out-Null
Invoke-Nssm start BookshopBranchSync | Out-Null
Start-Sleep -Seconds 4

$bad = $false
foreach ($n in 'BookshopBranchApi', 'BookshopBranchSync') {
    $svc = Get-Service -Name $n -ErrorAction SilentlyContinue
    $state = if ($svc) { $svc.Status } else { 'MISSING' }
    $colour = if ($state -eq 'Running') { 'Green' } else { 'Red' }
    Write-Host ("  {0,-20} {1}" -f $n, $state) -ForegroundColor $colour
    if ($state -ne 'Running') { $bad = $true }
}

if ($bad) {
    Write-Host "`nA service did not start. Check $backend\logs\*.err.log" -ForegroundColor Red
    exit 1
}

Write-Host "`nInstalled and started. Open http://127.0.0.1:4000 in a kiosk browser for the POS." -ForegroundColor Green
Write-Host "Logs: $backend\logs" -ForegroundColor Green
