# One-time Bookshop branch setup (run on the Windows branch desktop).
# Generates the SQLite Prisma client to the DEFAULT @prisma/client (BRANCH_BUILD=1) so the
# shared server/route code runs against SQLite, creates the local DB, and builds.

$ErrorActionPreference = 'Stop'
$backend = (Resolve-Path "$PSScriptRoot/../backend").Path
Push-Location $backend
try {
    if (-not (Test-Path .env)) {
        Copy-Item "$PSScriptRoot/.env.branch.example" .env
        Write-Host "Created backend/.env from template. EDIT it (SYNC_TOKEN, CLOUD_URL, JWT_SECRET) before syncing." -ForegroundColor Yellow
    }
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    npm ci
    Write-Host "Generating SQLite Prisma client (branch build)..." -ForegroundColor Cyan
    $env:BRANCH_BUILD = '1'
    node scripts/gen-sqlite-schema.mjs
    npx prisma generate --schema prisma/schema.sqlite.prisma
    Write-Host "Creating the local SQLite database..." -ForegroundColor Cyan
    npx prisma db push --schema prisma/schema.sqlite.prisma --skip-generate
    Write-Host "Building the backend..." -ForegroundColor Cyan
    npm run build
    Write-Host "Branch setup complete. Ensure backend/.env has a valid SYNC_TOKEN, then run branch/run-branch.ps1" -ForegroundColor Green
}
finally {
    Remove-Item Env:\BRANCH_BUILD -ErrorAction SilentlyContinue
    Pop-Location
}
