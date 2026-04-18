# Foresight

Strategic foresight platform powered by Claude AI. Helps organizations anticipate future scenarios through proven methodologies (STEEP analysis, Scenario Planning, Backcasting, Horizon Scanning) and generates comprehensive reports in PDF and PowerPoint.

## Repository structure

```
Foresight/
├── backend/              # Spring Boot 3.5 backend (Java 21)
├── frontend/             # React + Vite + TypeScript (to be built in M2)
├── docker-compose.yml    # Orchestrates backend + PostgreSQL
├── .env.example          # Template for environment variables
└── docs/
    ├── ARCHITECTURE.md   # System architecture and design decisions
    └── ROADMAP.md        # Development plan (M1–M4)
```

## Quick start

### Requirements

- Docker Desktop
- (Optional, for local dev) JDK 21 + Maven; Node.js 20+

### Running locally (Docker)

```bash
# 1. Copy the template and fill in real values
cp .env.example .env

# 2. Start PostgreSQL + backend
docker compose up --build
```

Backend available at http://localhost:8080
Swagger UI: http://localhost:8080/swagger-ui.html

### Environment variables

See [.env.example](.env.example). You will need a valid `ANTHROPIC_API_KEY` to use the AI endpoints.

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

### 🚧 Next up — M2: Frontend

Build the React frontend that replaces the existing vanilla-JS prototype in `frontend/`. See [ROADMAP.md](docs/ROADMAP.md) for full plan.

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
