#!/usr/bin/env bash
# Bring the whole stack up using a specific environment file.
#
# Usage:
#   ./scripts/up.sh local           → reads .env.local   (FRONTEND_MODE=dev, port 5173)
#   ./scripts/up.sh preview         → reads .env.preview (FRONTEND_MODE=preview, port 4173)
#   ./scripts/up.sh dev             → reads .env.dev
#   ./scripts/up.sh local -d        → detached mode (-d passed straight to docker compose)
#
# The frontend container's mode (vite dev vs vite preview) is selected
# at runtime by FRONTEND_MODE in the chosen env file; see
# .env.example for the full set of frontend-related variables.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <environment> [extra docker compose args...]" >&2
  exit 1
fi

env_name="$1"
shift

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$repo_root/.env.$env_name"

if [[ ! -f "$env_file" ]]; then
  echo "Env file '$env_file' does not exist. Copy .env.example and fill it in." >&2
  exit 1
fi

cd "$repo_root"
echo "Starting stack with $env_file"
docker compose \
  -f docker-compose-backend.yml \
  -f docker-compose-frontend.yml \
  --env-file "$env_file" \
  up "$@"
