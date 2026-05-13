# Bring the whole stack up using a specific environment file.
#
# Usage:
#   ./scripts/up.ps1 local         → reads .env.local   (FRONTEND_MODE=dev, port 5173)
#   ./scripts/up.ps1 preview       → reads .env.preview (FRONTEND_MODE=preview, port 4173)
#   ./scripts/up.ps1 dev           → reads .env.dev
#   ./scripts/up.ps1 local -d      → detached mode (-d passed straight to docker compose)
#
# The frontend container's mode (vite dev vs vite preview) is selected
# at runtime by FRONTEND_MODE in the chosen env file; see
# .env.example for the full set of frontend-related variables.

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
    docker compose `
        -f docker-compose-backend.yml `
        -f docker-compose-frontend.yml `
        --env-file $envFile `
        up @ExtraArgs
}
finally {
    Pop-Location
}
