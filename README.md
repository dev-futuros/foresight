# Foresight

Strategic foresight platform. Helps organizations anticipate future scenarios through proven methodologies (STEEP analysis, Scenario Planning, Backcasting, Horizon Scanning) and generates comprehensive reports in PDF and PowerPoint.

## Repository structure

```
Foresight/
├── backend/              # Spring Boot 3.5 backend (Java 21)
├── frontend/             # React 19 + Vite + TypeScript frontend
├── docker-compose-backend.yml  # Backend stack: PostgreSQL + Spring Boot + optional SonarQube
├── docker-compose-frontend.yml # Frontend stack: Vite dev / preview server
├── scripts/              # up.ps1 / up.sh / down.ps1 / down.sh helpers
├── .env.example          # Backend env template (Kinde, DB, Anthropic, …)
├── frontend/.env.example # Frontend env template (Kinde domain + client id)
└── docs/
    ├── API.md            # REST API reference
    ├── ARCHITECTURE.md   # System architecture and design decisions
    ├── CHANGELOG.md      # Notable changes by milestone
    ├── ROADMAP.md        # Development plan (M1–M4)
    └── MIGRATION_CLERK_TO_KINDE.md  # Post-mortem of the Clerk → Kinde auth migration (archive eventually)
```

## Quick start

### Requirements

- Docker Desktop
- Node.js 20+ (for the frontend)
- A Kinde account — sign up at [kinde.com](https://kinde.com), create a tenant, and have a Front-end app + a Machine-to-Machine (M2M) app set up (see [One-time Kinde setup](#one-time-kinde-setup) below)
- (Optional, only if you want to run the backend with `mvnw` outside Docker) JDK 21 + Maven

### One-time Kinde setup

Authentication is delegated to Kinde. The migration post-mortem in [docs/MIGRATION_CLERK_TO_KINDE.md](docs/MIGRATION_CLERK_TO_KINDE.md) has the complete dashboard checklist; the minimum to boot the stack is:

1. **Front-end app** (Kinde Dashboard → Applications → Add → "Front-end and mobile"). Note the **Client ID** (public — it ships in the browser bundle). Configure:
   - **Allowed Callback URLs**: `http://localhost:5173/callback`, `http://localhost:4173/callback`, plus your deployed URL (e.g. `https://app.example.com/callback`).
   - **Allowed Logout Redirect URLs**: same set without `/callback`.
   - **Application login URI**: where Kinde sends users to restart the auth flow (e.g. `http://localhost:5173/sign-in`).
2. **M2M app** (Applications → Add → "Machine to Machine"). Note the **Client ID** + **Client Secret**. Grant the following scopes on the **Kinde Management API**: `read:users` (lazy-create needs the user's name), `update:users` (account-modal name editing pushes back to Kinde), `delete:users` (for the GDPR-cascade work pending on `DELETE /api/users/me`).
3. **Webhook endpoint** (Workflows → Webhooks → Add endpoint). URL = `https://<your-domain>/api/webhooks/kinde`. Subscribe to `user.created`, `user.updated`, `user.deleted`. **No signing secret to copy** — Kinde signs webhook deliveries with a JWT verified against the same JWKS endpoint that validates session tokens.
4. **Authentication methods** (Authentication → enable email + password + whichever social providers you want, e.g. Google).

The tenant domain is the value you put in `KINDE_DOMAIN` / `VITE_KINDE_DOMAIN` (e.g. `https://foresight.kinde.com`). It's the same domain for the SPA and M2M apps; what differs is the Client ID + (for M2M) the Client Secret.

### One-command stack

Each environment lives in its own `.env.<name>` file at the repo root. Pick the one you want and run the helper script — it brings up the database, the backend, and (in `local`) SonarQube:

```powershell
# First-time setup: copy the templates and fill in real values
cp .env.example .env.local
cp frontend/.env.example frontend/.env.local

# Start everything for local development
./scripts/up.ps1 local

# Detached
./scripts/up.ps1 local -d

# Stop
./scripts/down.ps1 local
```

Bash/macOS/Linux equivalents: `./scripts/up.sh local`, `./scripts/down.sh local`.

Once it boots:

| Service     | URL                                         |
|-------------|---------------------------------------------|
| Backend     | http://localhost:8080                       |
| Swagger UI  | http://localhost:8080/swagger-ui.html       |
| SonarQube   | http://localhost:9000  (admin / admin)      |

### Starting the frontend

In a separate terminal:

```bash
cd frontend
npm install      # first time only
npm run dev
```

| Service     | URL                        |
|-------------|----------------------------|
| Frontend    | http://localhost:5173      |

The frontend proxies all `/api/*` calls to `http://localhost:8080` automatically — no CORS setup needed in development.

> **First-time use:** open http://localhost:5173, click sign-in → "Continue →" to be sent to Kinde's hosted page, and either use one of the social providers (Google etc.) you enabled in the Kinde Dashboard, or sign up with email + password. The first authenticated request lazy-creates the matching row in the `users` table — only `external_user_id`, `name`, `role`, and `language` are stored locally. Email, password, MFA, and the user's session live in Kinde and are managed from its hosted account portal (accessible via the "Gestionar cuenta" section of our in-app Account modal — opened from the topbar avatar button).

### How environments work

| File              | Purpose                                                                 |
|-------------------|-------------------------------------------------------------------------|
| `.env.example`    | Backend template, **versioned**. Lists every variable the stack expects. |
| `.env.local`      | Your local-dev backend values, **gitignored**. `SPRING_PROFILES_ACTIVE=local` or `dev`. |
| `frontend/.env.example` | Frontend template, **versioned**. Kinde tenant domain + SPA client id + redirect / logout URIs. |
| `frontend/.env.local`   | Your local Kinde values + Vite/PostHog overrides, **gitignored**. |
| `.env.dev`, `.env.prod` | Backend values for other environments — same shape, different secrets / profile. |

Two backend env vars drive the orchestration:

- **`SPRING_PROFILES_ACTIVE`** picks `application-<profile>.properties` inside the backend (e.g. `local` → auth disabled, debug logging, dev user auto-seeded).
- **`COMPOSE_PROFILES`** picks which optional Docker services come up (e.g. `quality` → SonarQube alongside the app).

In `.env.local`, both are set to give you the comfiest dev experience by default.

### Required Kinde env vars

| Variable | Where it lives | What it is |
|---|---|---|
| `VITE_KINDE_DOMAIN` | `frontend/.env.local` | Your Kinde tenant URL, e.g. `https://foresight.kinde.com`. Same value the backend reads as `KINDE_DOMAIN`. |
| `VITE_KINDE_CLIENT_ID` | `frontend/.env.local` | Client ID of the Front-end SPA app. Public — it ships in the browser bundle. |
| `VITE_KINDE_REDIRECT_URI` | `frontend/.env.local` | Where Kinde redirects after sign-in. Defaults to `${origin}/callback` if unset; explicit value lets you point at a non-standard port (e.g. Vite preview on 4173). |
| `VITE_KINDE_LOGOUT_REDIRECT_URI` | `frontend/.env.local` | Where Kinde sends users after sign-out. Usually the app root. |
| `KINDE_DOMAIN` | `.env.local` (root) | Tenant URL — same value as `VITE_KINDE_DOMAIN`. |
| `KINDE_ISSUER` | `.env.local` (root) | The `iss` claim Kinde puts on session JWTs. Stock tenants: same as `KINDE_DOMAIN`. |
| `KINDE_JWKS_URI` | `.env.local` (root) | `${KINDE_DOMAIN}/.well-known/jwks`. Validates both session JWTs and webhook JWTs (Kinde signs both with the same key set). |
| `KINDE_TOKEN_ENDPOINT` | `.env.local` (root) | `${KINDE_DOMAIN}/oauth2/token`. Used by `KindeBackendClient` for the M2M `client_credentials` flow. |
| `KINDE_MANAGEMENT_API_BASE_URL` | `.env.local` (root) | `${KINDE_DOMAIN}/api/v1`. Base URL for user-profile fetch / update calls. |
| `KINDE_M2M_CLIENT_ID` | `.env.local` (root) | Client ID of the Machine-to-Machine app. |
| `KINDE_M2M_CLIENT_SECRET` | `.env.local` (root) | Secret of the M2M app — sensitive. The M2M app must have `read:users` + `update:users` + `delete:users` scopes granted on the Kinde Management API. |

> There is intentionally **no `KINDE_WEBHOOK_SIGNING_SECRET`**. Kinde signs webhook deliveries with a JWT — verifiable against `KINDE_JWKS_URI`, the same endpoint that validates session tokens. The webhook controller uses the same `JwtDecoder` bean as the auth filter.

### Running the backend with `mvnw` (hot reload / IDE debugger)

If you prefer to run the backend on the host (e.g. for hot reload from IntelliJ), bring up **only the database** in Docker and let `mvnw` do the rest:

```powershell
docker compose --env-file .env.local up -d db
cd backend
./mvnw spring-boot:run
```

The backend uses [`spring-dotenv`](https://github.com/paulschwarz/spring-dotenv), so it reads `../.env.local` automatically — no need to set anything in IntelliJ or PowerShell. Real environment variables always take precedence over the file, which keeps production safe.

### What the `local` profile does

- `foresight.security.auth-disabled=true` → every endpoint is `permitAll`.
- `JwtAuthFilter` injects a synthetic dev principal (id `00000000-0000-0000-0000-000000000001`, external id `user_local_dev`) when no token is present, so `@CurrentUser` still works and you can hit endpoints from Swagger without going through Kinde.
- `DevUserSeeder` ensures the matching row exists in the `users` table on startup with that same synthetic external id.
- A loud `WARN` is logged at boot so you cannot miss it: `AUTHENTICATION IS DISABLED`.

> ⚠️ The `local` profile must NEVER be activated in production. The toggle defaults to `false` in `application.properties` and is only flipped on by `application-local.properties`.

To test the **real** Kinde auth path (recommended before shipping anything that touches security), set `SPRING_PROFILES_ACTIVE=dev` in `.env.local` (or use `.env.dev`), recreate the stack, then sign in through the frontend and click **Authorize** in Swagger pasting the access token from your browser (paste it as `eyJ...` — Swagger adds the `Bearer ` prefix itself).

### Webhooks (Kinde → backend)

The backend exposes `POST /api/webhooks/kinde` to receive `user.created`, `user.updated`, and `user.deleted` events from Kinde so the local `users` table stays in sync. **The request body IS the JWT** — Kinde signs webhook deliveries with a JWT validated against the same JWKS endpoint that validates session tokens. No separate signing secret exists.

To wire it up in dev:

1. Expose your local backend with a tunnel (e.g. `ngrok http 8080`).
2. In the Kinde Dashboard → Workflows → Webhooks → Add Endpoint, point at `https://<tunnel>/api/webhooks/kinde` and subscribe to the `user.*` events.

Kinde's free tier only allows **one webhook endpoint per environment**; the team-shared one currently points at `https://dev.futuros.io/api/webhooks/kinde`. For local-dev iterations either (a) write unit tests with forged JWTs, (b) deploy to the dev environment, or (c) temporarily edit the webhook URL in Kinde to your ngrok tunnel.

The lazy-sync in `JwtAuthFilter` covers the case where the webhook hasn't fired yet — a brand-new Kinde user can authenticate immediately and the local row is created on their first authenticated request. The webhook is the canonical channel for `user.deleted` and for keeping `name` in sync after profile edits in Kinde's portal.

> **Where does `name` come from on first sign-in?** Kinde's default session JWT does not include the user's name. The backend therefore calls Kinde's Management API (`GET /api/v1/user?id=...`) via the M2M `client_credentials` flow whenever it lazy-creates a local row, and fills `name` from the live profile (`given_name`/`family_name` or `first_name`/`last_name` — both accepted via `@JsonAlias`). The same call backfills the name on a subsequent login if a previously-created user happens to have `name = null`. If `KINDE_M2M_CLIENT_*` are blank, the API call is skipped silently — auth still works, just with `name = null` until the webhook fires or the user edits the profile.

---

## Progress

### ✅ M1 — Backend foundation

All core backend infrastructure is in place:

- **Authentication via Kinde** (migrated from Clerk on `feature/kinde`, 2026-05-16) — sessions and credentials owned by Kinde; the backend only validates Kinde's session JWTs against its JWKS and mirrors a minimal `users` row keyed by `external_user_id`. Editable name flows back to Kinde via the Management API on `PATCH /api/users/me`. See [docs/MIGRATION_CLERK_TO_KINDE.md](docs/MIGRATION_CLERK_TO_KINDE.md) for the post-mortem.
- **User management**: profile endpoints (`GET /api/users/me`, `PATCH /api/users/me`, `DELETE /api/users/me`) — `name` is pushed to Kinde on update; `language` and `role` are local-only. Email / password / MFA / active sessions are managed from Kinde's hosted portal (deep-linked from the in-app Account modal).
- **Webhooks**: `POST /api/webhooks/kinde` (JWT-signed by Kinde, verified with the same `JwtDecoder` bean as session JWTs) keeps the local `users` row in sync with Kinde on `user.created` / `user.updated` / `user.deleted`
- **Reports CRUD**: create/list/get/update/delete with user-scoped ownership (`/api/reports/**`)
- **AI proxy**: server-side calls to Anthropic Claude API (`/api/ai/suggest-steep`, `/api/ai/suggest-horizon`, `/api/ai/analyze`) — the API key never leaves the server
- **Database**: PostgreSQL 16 with Flyway migrations; UUID-based entities with auditing (`created_at`, `updated_at`)
- **Error handling**: global exception handler returning normalized `ApiError` JSON responses
- **Validation**: Bean Validation on all DTOs (`jakarta.validation`)
- **CORS**: configurable via env var
- **Docs**: OpenAPI / Swagger UI auto-generated from controllers
- **Code quality**: Spotless (Palantir format) + JaCoCo (coverage) + SonarQube — enforced on every `verify` build

Package structure follows **package-by-feature** (`user/`, `report/`, `ai/`, `webhook/`, `common/`) to make the codebase scalable — modules can be extracted to microservices later if needed.

### ✅ M2 — Frontend (React + i18n)

React 19 + TypeScript frontend with Kinde-hosted auth (sign-in / sign-up redirect to Kinde's hosted pages), an in-app Account modal (preferences + Kinde portal link + sign-out), a 4-step report wizard, full i18n (ES/EN), and PDF / PPTX / HTML exports. See [ROADMAP.md](docs/ROADMAP.md).

### 🚧 M3 — Payments (in progress)

Subscription gating on `POST /api/reports` is **live** — quota enforcement (10 reports / period), `402` when no plan, enriched `429` (`limit`, `used`, `periodEnd`) when the quota is burned, `UserRole.DEV` bypass for the team. The Stripe integration (`/api/billing/*` endpoints + Stripe Tax wiring + pricing page) is the in-flight work on the `feature/stripe` branch — we'll be Merchant of Record ourselves via an autónomo in Spain, with Stripe Tax handling EU VAT calculation. See [ROADMAP.md](docs/ROADMAP.md).

### 🚧 M4 — Polish, hardening, deploy

Production frontend image (Caddy + multi-stage Docker), privacy page, cookie consent, and PostHog LLM observability already landed. Open: structured logging, Metrics, CI, hosting target, error tracking. See [ROADMAP.md](docs/ROADMAP.md).

### ➕ Shipped beyond the original M1–M4 plan

The product picked up several features that weren't in the linear roadmap. They're all production code today — full detail in [ARCHITECTURE.md](docs/ARCHITECTURE.md) and the [CHANGELOG.md](docs/CHANGELOG.md) `[Unreleased]` block:

- **Public share tokens** (multilingual, 7-day expiry) — clients receive a self-contained HTML snapshot
- **Examples** — DEV-curated report templates visible to all authenticated users
- **Chat assistant with tool use** — 15 frontend tools the model can call to drive the UI
- **Phased streaming analysis pipeline** — 8 SSE endpoints replacing the legacy `POST /api/ai/analyze`
- **Server-side report translations** + PDF "tighten" cache for export polish
- **Per-tier model selection** (haiku / sonnet / opus) tunable per environment

---

## Development

### Backend

```bash
cd backend
./mvnw spring-boot:run         # local dev (needs Postgres running)
./mvnw test                    # run tests (Testcontainers-based)
./mvnw verify                  # full pipeline: tests + Spotless check + JaCoCo report
./mvnw clean package           # build JAR
```

### Code quality

We enforce three tools on every `verify` build so the `main` branch stays consistent:

| Tool       | Purpose                                                            | When it runs                      |
|------------|--------------------------------------------------------------------|-----------------------------------|
| **Spotless** (Palantir Java Format) | Canonical code formatting, import ordering, trailing whitespace | `verify` → fails if unformatted   |
| **JaCoCo**                          | Line/branch coverage report (XML + HTML)                        | `verify` → report in `target/site/jacoco/` |
| **SonarQube**                       | Static analysis (bugs, code smells, security hotspots, coverage) | On-demand via `sonar:sonar`       |

```bash
cd backend

# Formatting
./mvnw spotless:apply          # rewrite all files to the canonical format
./mvnw spotless:check          # validate only (what CI runs)

# Sonar against a local SonarQube (optional service in docker-compose)
docker compose --profile quality up -d sonarqube   # starts SonarQube on :9000
# First login admin/admin → create a token → then:
./mvnw verify sonar:sonar -Dsonar.token=<TOKEN>

# Sonar against SonarCloud
./mvnw verify sonar:sonar \
  -Dsonar.host.url=https://sonarcloud.io \
  -Dsonar.organization=<your-org> \
  -Dsonar.token=<TOKEN>
```

`sonar:sonar` is intentionally **not** bound to the `verify` phase — you run it when you want to publish a report, not on every local build.

### Database migrations

Add new migrations under `backend/src/main/resources/db/migration/` following Flyway's naming convention — note the **double underscore** between version and description; a single underscore makes Flyway silently skip the file:

- `V5__add_subscription_table.sql` ✅
- `V5_add_subscription_table.sql` ❌ (silently ignored)

Current migrations: `V1__init` through `V12__rename_clerk_user_id_to_external` — auth (V1–V4), subscriptions (V5), share tokens (V6/V9/V10), translations (V7), examples (V8), PDF cache (V11), Clerk→Kinde column rename (V12). See [ARCHITECTURE.md](docs/ARCHITECTURE.md#database-migrations) for what each one does.

Never modify an already-applied migration — always add a new one.

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)
- [Changelog](docs/CHANGELOG.md)
- [Roadmap (M1–M4)](docs/ROADMAP.md)
- [Migration: Clerk → Kinde post-mortem](docs/MIGRATION_CLERK_TO_KINDE.md) — archive eventually

## License

Private project.
