# Tear the stack down. Pass -v to also wipe the database volume.
#
# Usage:
#   ./scripts/down.ps1 local
#   ./scripts/down.ps1 local -v    → also drops volumes (DESTROYS DB DATA)

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Environment,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ExtraArgs
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env.$Environment"

if (-not (Test-Path $envFile)) {
    Write-Error "Env file '$envFile' does not exist."
    exit 1
}

Push-Location $repoRoot
try {
    docker compose `
        -f docker-compose-backend.yml `
        -f docker-compose-frontend.yml `
        --env-file $envFile `
        down @ExtraArgs
}
finally {
    Pop-Location
}
