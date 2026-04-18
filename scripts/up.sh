#!/usr/bin/env bash
# Bring the whole stack up using a specific environment file.
#
# Usage:
#   ./scripts/up.sh local         → reads .env.local
#   ./scripts/up.sh dev           → reads .env.dev
#   ./scripts/up.sh local -d      → detached mode

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
docker compose --env-file "$env_file" up "$@"
