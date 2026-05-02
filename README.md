# Foresight

Strategic foresight platform powered by Claude AI. Helps organizations anticipate future scenarios through proven methodologies (STEEP analysis, Scenario Planning, Backcasting, Horizon Scanning) and generates comprehensive reports in PDF and PowerPoint.

## Repository structure

```
Foresight/
├── backend/              # Spring Boot 3.5 backend (Java 21)
├── frontend/             # React 19 + Vite + TypeScript frontend
├── docker-compose.yml    # Orchestrates backend + PostgreSQL
├── .env.example          # Backend env template (Clerk, DB, Anthropic, …)
├── frontend/.env.example # Frontend env template (Clerk publishable key)
└── docs/
    ├── API.md            # REST API reference
    ├── ARCHITECTURE.md   # System architecture and design decisions
    ├── CHANGELOG.md      # Notable changes by milestone
    └── ROADMAP.md        # Development plan (M1–M4)
```

## Quick start

### Requirements

- Docker Desktop
- Node.js 20+ (for the frontend)
- A Clerk account — sign up at [clerk.com](https://clerk.com), create an application, and have its **Publishable Key** + **Frontend API URL** ready
- (Optional, only if you want to run the backend with `mvnw` outside Docker) JDK 21 + Maven

### One-time Clerk setup

Authentication is delegated to Clerk. Before the app can run with auth enabled you need to copy three values from your Clerk Dashboard:

1. **Publishable Key** — Dashboard → API Keys → React (`pk_test_...` for the dev instance).
2. **Frontend API URL** — Dashboard → API Keys → Show JWT Public Key → the issuer URL it shows, e.g. `https://your-app.clerk.accounts.dev`.
3. **Webhook signing secret** — only needed once you wire the webhook (see [Webhooks](#webhooks-clerk--backend) below).

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

> **First-time use:** open http://localhost:5173, click sign-in, and either use one of the social providers (Google / LinkedIn / Apple) you enabled in the Clerk Dashboard, or sign up with email + password if you have that strategy enabled. The first authenticated request lazy-creates the matching row in the `users` table — only `clerk_user_id`, `name`, `role`, and `language` are stored locally. Email, password, and MFA all stay in Clerk.

### How environments work

| File              | Purpose                                                                 |
|-------------------|-------------------------------------------------------------------------|
| `.env.example`    | Backend template, **versioned**. Lists every variable the stack expects. |
| `.env.local`      | Your local-dev backend values, **gitignored**. `SPRING_PROFILES_ACTIVE=local`. |
| `frontend/.env.example` | Frontend template, **versioned**. Just the Clerk publishable key. |
| `frontend/.env.local`   | Your local Clerk publishable key, **gitignored**. |
| `.env.dev`, `.env.prod` | Backend values for other environments — same shape, different secrets / profile. |

Two backend env vars drive the orchestration:

- **`SPRING_PROFILES_ACTIVE`** picks `application-<profile>.properties` inside the backend (e.g. `local` → auth disabled, debug logging, dev user auto-seeded).
- **`COMPOSE_PROFILES`** picks which optional Docker services come up (e.g. `quality` → SonarQube alongside the app).

In `.env.local`, both are set to give you the comfiest dev experience by default.

### Required Clerk env vars

| Variable | Where it lives | What it is |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | `frontend/.env.local` | Public key that boots the Clerk SDK in the browser. |
| `CLERK_ISSUER` | `.env.local` (root) | Frontend API URL of your Clerk instance, no trailing slash. |
| `CLERK_JWKS_URI` | `.env.local` (root) | `${CLERK_ISSUER}/.well-known/jwks.json`. Used by the backend to validate session JWTs. |
| `CLERK_WEBHOOK_SIGNING_SECRET` | `.env.local` (root) | HMAC secret from Clerk Dashboard → Webhooks → endpoint → Signing Secret. |
| `CLERK_SECRET_KEY` | `.env.local` (root) | Backend API secret (`sk_test_...` / `sk_live_...`). Lets the backend fetch a user's first/last name from Clerk on first sign-in so `name` is populated immediately. Optional but recommended — without it, `name` stays null until the webhook fires or the user edits their profile. |

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
- `JwtAuthFilter` injects a synthetic dev principal (id `00000000-0000-0000-0000-000000000001`, clerk id `user_local_dev`) when no token is present, so `@CurrentUser` still works and you can hit endpoints from Swagger without going through Clerk.
- `DevUserSeeder` ensures the matching row exists in the `users` table on startup with that same synthetic Clerk id.
- A loud `WARN` is logged at boot so you cannot miss it: `AUTHENTICATION IS DISABLED`.

> ⚠️ The `local` profile must NEVER be activated in production. The toggle defaults to `false` in `application.properties` and is only flipped on by `application-local.properties`.

To test the **real** Clerk auth path (recommended before shipping anything that touches security), spin up with a different env file (e.g. `.env.dev`) where `SPRING_PROFILES_ACTIVE` is unset or set to a non-`local` value, then sign in through the frontend and click **Authorize** in Swagger pasting the session JWT (paste it as `eyJ...` — Swagger adds the `Bearer ` prefix itself).

### Webhooks (Clerk → backend)

The backend exposes `POST /api/webhooks/clerk` to receive `user.created`, `user.updated`, and `user.deleted` events from Clerk so the local `users` table stays in sync. It's authenticated by Svix signature, not by JWT.

To wire it up in dev:

1. Expose your local backend with a tunnel (e.g. `ngrok http 8080`).
2. In the Clerk Dashboard → Webhooks → Add Endpoint, point at `https://<tunnel>/api/webhooks/clerk` and subscribe to the `user.*` events.
3. Copy the endpoint's Signing Secret into `CLERK_WEBHOOK_SIGNING_SECRET`.

The lazy-sync in `JwtAuthFilter` covers the case where the webhook hasn't fired yet — a brand-new Clerk user can authenticate immediately and the local row is created on their first authenticated request. The webhook is the canonical channel for `user.deleted` and for keeping `name` in sync after profile edits in Clerk.

> **Where does `name` come from on first sign-in?** Clerk's default session JWT does not include the user's name. The backend therefore calls Clerk's Backend API (`GET /v1/users/{id}`) with `CLERK_SECRET_KEY` whenever it lazy-creates a local row, and fills `name` from the live profile (`first_name + last_name`). The same call backfills the name on a subsequent login if a previously-created user happens to have `name = null`. If `CLERK_SECRET_KEY` is blank the API call is skipped silently — auth still works, just with `name = null` until the webhook is wired or the user edits the profile.

---

## Progress

### ✅ M1 — Backend foundation

All core backend infrastructure is in place:

- **Authentication via Clerk** — sessions and credentials owned by Clerk; the backend only validates Clerk's session JWTs and mirrors a minimal `users` row keyed by `clerk_user_id`
- **User management**: profile endpoints (`GET /api/users/me`, `PATCH /api/users/me`, `DELETE /api/users/me`) — only the locally-owned fields (`name`, `language`, `role`); email/password/MFA changes go through Clerk's `<UserButton />`
- **Webhooks**: `POST /api/webhooks/clerk` (Svix-signed) keeps the local `users` row in sync with Clerk on `user.created` / `user.updated` / `user.deleted`
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

React 19 + TypeScript frontend with Clerk-hosted auth, three-step report wizard, full i18n (ES/EN), and PDF / PPTX exports. See [ROADMAP.md](docs/ROADMAP.md).

### 🔜 M3 — Payments (Stripe)

Subscription gating on `/api/ai/**`. See [ROADMAP.md](docs/ROADMAP.md).

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

Current migrations: `V1__init`, `V2__auth_tokens`, `V3__clerk_auth`, `V4__fix_user_constraints_for_clerk`. See [ARCHITECTURE.md](docs/ARCHITECTURE.md#database-migrations) for what each does.

Never modify an already-applied migration — always add a new one.

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)
- [Changelog](docs/CHANGELOG.md)
- [Roadmap (M1–M4)](docs/ROADMAP.md)

## License

Private project.
