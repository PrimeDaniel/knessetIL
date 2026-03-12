# ╔══════════════════════════════════════════════════════════════╗
# ║           KnessetIL — Dev Stack Launcher                    ║
# ║  Starts: Redis · PostgreSQL · FastAPI · Next.js             ║
# ╚══════════════════════════════════════════════════════════════╝

$RepoRoot  = $PSScriptRoot
$Compose   = Join-Path $RepoRoot "infra\docker-compose.dev.yml"
$AppUrl    = "http://localhost:3000"
$ApiUrl    = "http://localhost:8000/docs"

function Write-Header {
    Clear-Host
    Write-Host ""
    Write-Host "  ██╗  ██╗███╗   ██╗███████╗███████╗███████╗███████╗████████╗" -ForegroundColor Blue
    Write-Host "  ██║ ██╔╝████╗  ██║██╔════╝██╔════╝██╔════╝██╔════╝╚══██╔══╝" -ForegroundColor Blue
    Write-Host "  █████╔╝ ██╔██╗ ██║█████╗  ███████╗███████╗█████╗     ██║   " -ForegroundColor Cyan
    Write-Host "  ██╔═██╗ ██║╚██╗██║██╔══╝  ╚════██║╚════██║██╔══╝     ██║   " -ForegroundColor Cyan
    Write-Host "  ██║  ██╗██║ ╚████║███████╗███████║███████║███████╗   ██║   " -ForegroundColor White
    Write-Host "  ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝╚══════╝╚══════╝   ╚═╝   " -ForegroundColor White
    Write-Host ""
    Write-Host "  שקיפות הכנסת — Civic Transparency Platform" -ForegroundColor Yellow
    Write-Host ""
}

function Check-Docker {
    try {
        $null = docker info 2>&1
        if ($LASTEXITCODE -ne 0) { throw }
        Write-Host "  ✓ Docker is running" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Docker Desktop is not running!" -ForegroundColor Red
        Write-Host "    Please start Docker Desktop and try again." -ForegroundColor Yellow
        Write-Host ""
        Read-Host "  Press Enter to exit"
        exit 1
    }
}

function Wait-ForService {
    param([string]$Name, [string]$Url, [int]$MaxSeconds = 120)
    Write-Host "  ⏳ Waiting for $Name..." -ForegroundColor Yellow -NoNewline
    $elapsed = 0
    while ($elapsed -lt $MaxSeconds) {
        try {
            $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            Write-Host " ✓" -ForegroundColor Green
            return $true
        } catch {
            Start-Sleep -Seconds 3
            $elapsed += 3
            Write-Host "." -NoNewline -ForegroundColor DarkGray
        }
    }
    Write-Host " TIMEOUT" -ForegroundColor Red
    return $false
}

# ── Main ──────────────────────────────────────────────────────────────────────
Write-Header
Check-Docker

Write-Host "  [1/3] Starting all services via Docker Compose..." -ForegroundColor Cyan
Write-Host ""

# Start everything in the background
docker compose -f $Compose up -d --build 2>&1 | ForEach-Object {
    if ($_ -match "error|Error|ERROR") {
        Write-Host "  $_" -ForegroundColor Red
    } elseif ($_ -match "Started|Running|healthy") {
        Write-Host "  $_" -ForegroundColor Green
    } else {
        Write-Host "  $_" -ForegroundColor DarkGray
    }
}

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  ✗ Docker Compose failed. Check errors above." -ForegroundColor Red
    Read-Host "  Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "  [2/3] Waiting for services to be ready..." -ForegroundColor Cyan
Write-Host ""

$apiReady = Wait-ForService -Name "API (FastAPI)" -Url "http://localhost:8000/api/v1/health" -MaxSeconds 120
$webReady = Wait-ForService -Name "Web (Next.js)" -Url "http://localhost:3000" -MaxSeconds 180

Write-Host ""
Write-Host "  [3/3] Opening browser..." -ForegroundColor Cyan
Write-Host ""

if ($webReady) {
    Start-Process $AppUrl
    if ($apiReady) {
        Start-Sleep -Seconds 1
        Start-Process $ApiUrl
    }
}

# ── Status summary ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  🌐  App (Hebrew RTL)  →  $AppUrl" -ForegroundColor White
Write-Host "  🔌  API Docs          →  $ApiUrl" -ForegroundColor White
Write-Host "  🗄️   Redis             →  localhost:6379" -ForegroundColor White
Write-Host "  🐘  PostgreSQL        →  localhost:5432" -ForegroundColor White
Write-Host ""
Write-Host "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  To stop all services:" -ForegroundColor DarkGray
Write-Host "    docker compose -f infra\docker-compose.dev.yml down" -ForegroundColor Gray
Write-Host ""
Write-Host "  To view logs:" -ForegroundColor DarkGray
Write-Host "    docker compose -f infra\docker-compose.dev.yml logs -f api" -ForegroundColor Gray
Write-Host "    docker compose -f infra\docker-compose.dev.yml logs -f web" -ForegroundColor Gray
Write-Host ""
Read-Host "  Press Enter to exit this window (services keep running)"
