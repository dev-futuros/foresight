#!/bin/sh
# Frontend container entrypoint — branches on FRONTEND_MODE.
#
# Modes:
#   dev     — Vite dev server on port 5173 with HMR. Reads the bind-
#             mounted source directly; no build step.
#   preview — Vite preview server on port 4173 serving dist/. Rebuilds
#             on start so the bind-mounted source produces a fresh dist/
#             (the image's pre-built dist/ gets shadowed by the host
#             bind mount).
#
# Selection comes from the stack-level .env.<profile> file via
# docker-compose's environment block. Defaults to dev so a bare
# `docker compose up` without env files still produces a usable
# development server.

set -e

mode="${FRONTEND_MODE:-dev}"

case "$mode" in
  dev)
    echo "[entrypoint] FRONTEND_MODE=dev — starting Vite dev server (HMR, port 5173)"
    exec npm run dev
    ;;
  preview)
    echo "[entrypoint] FRONTEND_MODE=preview — building, then serving dist/ (port 4173)"
    # The host bind-mount over /app shadows the image's pre-built
    # dist/, so a build is required on every start to capture current
    # source. Slow once (~10-20s) but predictable.
    npm run build
    exec npm run preview
    ;;
  *)
    echo "[entrypoint] Unknown FRONTEND_MODE='$mode' — expected: dev | preview" >&2
    exit 1
    ;;
esac
