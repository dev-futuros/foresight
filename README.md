# Foresight

Strategic foresight platform powered by Claude AI. Helps organizations anticipate future scenarios through proven methodologies (STEEP analysis, Scenario Planning, Backcasting, Horizon Scanning) and generates comprehensive reports in PDF and PowerPoint.

## Repository structure

```
Foresight/
├── backend/              # Spring Boot 3.5 backend (Java 21)
├── frontend/             # React 18 + Vite + TypeScript frontend
├── docker-compose.yml    # Orchestrates backend + PostgreSQL
├── .env.example          # Template for environment variables
└── docs/
    ├── API.md            # Full REST API reference
    ├── ARCHITECTURE.md   # System architecture and design decisions
    └── ROADMAP.md        # Development plan (M1–M4)
```

## Quick start

### Requirements

- Docker Desktop
- Node.js 20+ (for the frontend)
- (Optional, only if you want to run the backend with `mvnw` outside Docker) JDK 21 + Maven

### One-command stack

Each environment lives in its own `.env.<name>` file at the repo root. Pick the one you want
and run the helper script — it brings up the database, the backend, and (in `local`) SonarQube:

```powershell
# First-time setup: copy the template and fill in real values
cp .env.example .env.local

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

> **First-time setup:** register a new account at http://localhost:5173/register. The backend in `local` profile has auth disabled for the dev user, but real JWT auth works — your account is stored in PostgreSQL and persists between restarts.

### How environments work

| File              | Purpose                                                                 |
|-------------------|-------------------------------------------------------------------------|
| `.env.example`    | Template, **versioned**. Lists every variable the stack expects.        |
| `.env.local`      | Your local-dev values, **gitignored**. `SPRING_PROFILES_ACTIVE=local`.  |
| `.env.dev`, `.env.prod` | Add as needed. Same shape, different secrets / profile.            |

Two environment variables drive everything:

- **`SPRING_PROFILES_ACTIVE`** picks `application-<profile>.properties` inside the backend
  (e.g. `local` → auth disabled, debug logging, dev user auto-seeded).
- **`COMPOSE_PROFILES`** picks which optional Docker services come up
  (e.g. `quality` → SonarQube alongside the app).

In `.env.local`, both are set to give you the comfiest dev experience by default.

### Running the backend with `mvnw` (hot reload / IDE debugger)

If you prefer to run the backend on the host (e.g. for hot reload from IntelliJ), bring up
**only the database** in Docker and let `mvnw` do the rest:

```powershell
docker compose --env-file .env.local up -d db
cd backend
./mvnw spring-boot:run
```

The backend uses [`spring-dotenv`](https://github.com/paulschwarz/spring-dotenv), so it reads
`../.env.local` automatically — no need to set anything in IntelliJ or PowerShell. Real
environment variables always take precedence over the file, which keeps production safe.

### What the `local` profile does

- `foresight.security.auth-disabled=true` → every endpoint is `permitAll`.
- `JwtAuthFilter` injects the dev user (`00000000-0000-0000-0000-000000000001`,
  `dev@foresight.local`) when no token is present, so `@CurrentUser` still works.
- A `DevUserSeeder` ensures the matching row exists in the `users` table on startup.
- A loud `WARN` is logged at boot so you cannot miss it: `AUTHENTICATION IS DISABLED`.

> ⚠️ The `local` profile must NEVER be activated in production. The toggle defaults to `false`
> in `application.properties` and is only flipped on by `application-local.properties`.

To test the **real** auth path (recommended before shipping anything that touches security),
spin up with a different env file (e.g. `.env.dev`) where `SPRING_PROFILES_ACTIVE` is unset
or set to a non-`local` value, then grab a JWT via `POST /api/auth/register` →
`POST /api/auth/login` and click **Authorize** in Swagger.

---

## Progress

### ✅ M1 — Backend foundation (completed)

All core backend infrastructure is in place:

- **Authentication**: JWT-based register/login with BCrypt password hashing and a custom `JwtAuthFilter`
- **User management**: profile endpoints (`GET /api/users/me`, `PATCH /api/users/me`)
- **Reports CRUD**: create/list/get/update/delete with user-scoped ownership (`/api/reports/**`)
- **AI proxy**: server-side calls to Anthropic Claude API (`/api/ai/suggest-steep`, `/api/ai/suggest-horizon`, `/api/ai/analyze`) — the API key never leaves the server
- **Database**: PostgreSQL 16 with Flyway migrations; UUID-based entities with auditing (`created_at`, `updated_at`)
- **Error handling**: global exception handler returning normalized `ApiError` JSON responses
- **Validation**: Bean Validation on all DTOs (`jakarta.validation`)
- **CORS**: configurable via env var
- **Docs**: OpenAPI / Swagger UI auto-generated from controllers
- **Code quality**: Spotless (Palantir format) + JaCoCo (coverage) + SonarQube — enforced on every `verify` build

Package structure follows **package-by-feature** (`auth/`, `user/`, `report/`, `ai/`, `common/`) to make the codebase scalable — modules can be extracted to microservices later if needed.

### 🚧 M2 — Frontend (in progress)

React 18 + TypeScript frontend scaffolded and auth flow complete. See [ROADMAP.md](docs/ROADMAP.md) for full plan.

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

Add new migrations under `backend/src/main/resources/db/migration/` following Flyway naming convention:
- `V2__add_subscription_table.sql`
- `V3__<description>.sql`

Never modify an already-applied migration — always add a new one.

---

## Documentation

- [Architecture plan](docs/ARCHITECTURE.md)
- [Development roadmap (M1–M4)](docs/ROADMAP.md)

## License

Private project.
