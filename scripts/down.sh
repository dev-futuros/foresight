#!/usr/bin/env bash
# Tear the stack down. Pass -v to also wipe the database volume.

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
  echo "Env file '$env_file' does not exist." >&2
  exit 1
fi

cd "$repo_root"
docker compose --env-file "$env_file" down "$@"
