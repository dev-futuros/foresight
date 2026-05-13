# Single image, dual-purpose: dev (Vite HMR) and preview (built dist/).
#
# Mode is selected at runtime via the FRONTEND_MODE env var (set in the
# stack-level .env.<profile> file and forwarded by docker-compose):
#   FRONTEND_MODE=dev     → npm run dev      (HMR, source-driven)
#   FRONTEND_MODE=preview → npm run preview  (serves dist/, built first)
#
# Bind-mounting the host's frontend/ over /app (default in compose) is
# safe for both modes: dev reads source directly, preview rebuilds on
# container start before serving so the dist/ that ends up on the
# bind-mounted host folder matches the live source.
FROM node:20-alpine

WORKDIR /app

# Cache npm install on package manifest changes only.
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the source so the image is bootable standalone
# (without a bind mount) — useful for one-off `docker compose run` and
# CI pipelines that don't mount the host folder.
COPY . .

# Pre-build for the preview path. The bind mount will shadow this at
# runtime in the default compose setup, but the entrypoint re-runs the
# build then anyway; for setups without a bind mount the pre-built
# artefacts are ready to serve immediately.
RUN npm run build

# Entrypoint dispatcher — branches on FRONTEND_MODE.
# `sed -i 's/\r$//'` strips any stray CRLF the file may have picked up
# on a Windows host. .gitattributes pins this to LF in the repo, but
# the sed pass means a careless editor can't break the image build
# either — the shebang is parsed by the kernel and a trailing \r turns
# `#!/bin/sh` into a request for an interpreter that doesn't exist.
COPY docker-entrypoint.sh /usr/local/bin/foresight-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/foresight-entrypoint \
 && chmod +x /usr/local/bin/foresight-entrypoint

# Both ports are exposed; the active one depends on FRONTEND_MODE.
EXPOSE 5173 4173

ENTRYPOINT ["foresight-entrypoint"]
