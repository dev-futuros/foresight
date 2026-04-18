# Bring the whole stack up using a specific environment file.
#
# Usage:
#   ./scripts/up.ps1 local         → reads .env.local, brings up db + backend (+ sonar if COMPOSE_PROFILES=quality)
#   ./scripts/up.ps1 dev           → reads .env.dev
#   ./scripts/up.ps1 local -d      → detached mode (-d passed straight to docker compose)

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Environment,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ExtraArgs
)

$ErrorActionPreference = "Stop"

# Resolve repo root (one level up from scripts/).
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env.$Environment"

if (-not (Test-Path $envFile)) {
    Write-Error "Env file '$envFile' does not exist. Copy .env.example and fill it in."
    exit 1
}

Push-Location $repoRoot
try {
    Write-Host "Starting stack with $envFile" -ForegroundColor Cyan
    docker compose --env-file $envFile up @ExtraArgs
}
finally {
    Pop-Location
}
