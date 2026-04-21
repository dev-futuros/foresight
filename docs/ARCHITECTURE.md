# Architecture

This document describes the system architecture, design decisions, and conventions for the Foresight platform.

## High-level overview

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   Browser   │ ──HTTP─▶│   Backend    │ ──HTTP─▶│  Anthropic   │
│  (React)    │         │ (Spring Boot)│         │  Claude API  │
└─────────────┘         └──────┬───────┘         └──────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │  PostgreSQL  │
                        └──────────────┘
```

- **Frontend** talks only to our backend (no third-party calls from the browser → API keys stay server-side).
- **Backend** is the single gateway: handles auth, persistence, business logic, and proxies AI calls.
- **Anthropic Claude API** is only reachable via the backend.
- **PostgreSQL** stores users, reports, and (future) billing data.

## Backend

### Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | Java 21 | LTS, modern records/sealed/pattern matching |
| Framework | Spring Boot 3.5 | Industry standard, mature ecosystem |
| DB access | Spring Data JPA + Hibernate | Productivity, rich query support |
| Migrations | Flyway | Versioned, reproducible schema changes |
| HTTP client | Spring WebClient | Reactive; supports streaming later |
| Auth | JWT (HS256) + BCrypt | Stateless, scalable horizontally |
| Validation | Bean Validation (`jakarta.validation`) | Declarative on DTOs |
| Boilerplate | Lombok | Removes getters/setters/builders noise |
| Docs | springdoc-openapi (Swagger UI) | Auto-generated from controllers |
| Tests | JUnit 5 + Testcontainers | Real Postgres in tests, not mocks |

### Package-by-feature

The backend organises code **by feature**, not by layer:

```
com.foresight.backend/
├── ForesightBackendApplication.java
├── common/                  # cross-cutting: security, base entity, exceptions
│   ├── config/              # SecurityConfig, SecurityProperties
│   ├── domain/              # BaseEntity (UUID, timestamps)
│   ├── exception/           # GlobalExceptionHandler, ApiError, domain exceptions
│   └── security/            # JwtService, JwtAuthFilter, AuthenticatedUser
├── auth/                    # login, register, token issuance
├── user/                    # user entity, profile endpoints
├── report/                  # foresight reports CRUD
├── ai/                      # Claude proxy service
└── billing/                 # (M3) Stripe integration
```

**Why package-by-feature?**

- Each feature is self-contained → low coupling, easier refactors
- Clear boundary for extraction into a microservice if a feature grows
- Easy to navigate: "where's the billing code?" → `billing/`
- Each feature has its own DTOs, preventing cross-feature contamination

### Key conventions

#### Entity IDs

All entities use `UUID` (v4), not auto-incrementing `Long`.

- **Scalability**: works in distributed systems without coordination
- **Security**: prevents enumeration attacks (`/reports/1`, `/reports/2`, …)
- **Merge-safe**: no collisions when merging datasets

Implemented in `common/domain/BaseEntity.java`, inherited by all entities.

#### Auditing

Every entity inherits `createdAt` and `updatedAt` via JPA's `@EntityListeners(AuditingEntityListener.class)`. Activated at the app level with `@EnableJpaAuditing`.

#### Authentication flow

1. Client calls `POST /api/auth/login` with email/password.
2. Backend verifies BCrypt hash → issues a JWT signed with HS256 using `foresight.security.jwt.secret`.
3. JWT contains `sub` (user UUID), `email`, `role`, `exp`.
4. Client sends `Authorization: Bearer <token>` on subsequent requests.
5. `JwtAuthFilter` validates the token and populates the `SecurityContext` with an `AuthenticatedUser` principal.
6. Controllers use `@CurrentUser AuthenticatedUser principal` to identify the caller.

**Token lifetime**: 24h access token (configurable via `foresight.security.jwt.access-token-ttl`). Refresh tokens will be added when needed.

#### Error handling

All exceptions flow through `GlobalExceptionHandler`, which returns a standardised JSON response:

```json
{
  "timestamp": "2026-04-18T10:00:00Z",
  "status": 404,
  "error": "Not Found",
  "message": "Report not found",
  "path": "/api/reports/...",
  "fieldErrors": null
}
```

Domain exceptions: `NotFoundException`, `ConflictException`, `ForbiddenException`.

#### Ownership & authorization

The `ReportService` enforces ownership at query time (`findByIdAndUserId`), not by filtering after fetching. This prevents accidental cross-user data leaks and avoids an extra DB roundtrip.

#### JSONB columns

`Report.inputData` and `Report.resultData` are stored as PostgreSQL `JSONB` via `hypersistence-utils`. This gives us:
- Schema flexibility (input/output shape evolves without migrations)
- Native JSON querying if needed later
- No object-relational impedance for document-like data

#### Database migrations

- Flyway is the **single source of truth** for the schema.
- Hibernate runs with `ddl-auto=validate` (never modifies schema in any environment).
- Migrations live in `backend/src/main/resources/db/migration/V<N>__<description>.sql`.
- **Never edit a migration that has been applied.** Always add a new one.

## Security decisions

| Threat | Mitigation |
|---|---|
| API key theft | Claude key only server-side; never reaches browser |
| Password cracking | BCrypt hashing (cost 10); no plaintext storage |
| Token forgery | JWT signed with HS256, secret min 32 chars |
| ID enumeration | UUIDs everywhere |
| Cross-origin attacks | CORS whitelist configured via env var |
| Mass assignment | DTOs never expose entity fields directly |
| SQL injection | JPA + parameterized queries only |
| Logging secrets | API key never logged; JWT content never logged |

## Frontend (M2)

### Tech stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite | Fast HMR, native ESM, minimal config |
| Language | TypeScript | Type-safe API contracts, autocomplete on DTOs |
| Framework | React 18 | Component model, large ecosystem |
| Routing | React Router v6 | Protected routes, nested layouts |
| HTTP | Axios | Interceptors for JWT injection and 401 handling |
| Server state | TanStack Query v5 | Caching, invalidation, background refresh |
| i18n | i18next | JSON catalogs, ES default, EN secondary |
| Export PDF | html2pdf.js | Already proven in prototype |
| Export PPT | pptxgenjs | Already proven in prototype |
| Styles | CSS variables | Port dark design system from prototype (no CSS framework) |

### Package-by-feature structure

```
frontend/src/
├── main.tsx
├── App.tsx                   # router root
├── lib/
│   ├── api.ts                # Axios instance — JWT injection + 401 → logout
│   └── queryClient.ts        # TanStack Query global config
├── hooks/
│   ├── useAuth.ts            # login, register, logout, current user
│   └── useReports.ts         # CRUD reports
├── features/
│   ├── auth/                 # LoginPage, RegisterPage
│   ├── dashboard/            # DashboardPage (report list)
│   ├── report/
│   │   ├── NewReportPage.tsx # 3-step wizard
│   │   ├── ReportPage.tsx    # result tabs
│   │   ├── steps/            # StepEmpresa, StepSteep, StepHorizon
│   │   └── tabs/             # TabScenarios, TabBackcasting, TabWeakSignals, TabMatrix
│   └── account/              # AccountPage (profile + language)
├── components/               # shared UI primitives (Button, Input, Spinner…)
├── i18n/
│   ├── es.json
│   └── en.json
└── types/
    └── api.ts                # TypeScript types mirroring backend DTOs
```

### Key decisions

**JWT in memory** — token lives in a module-level variable, never in `localStorage`. On page reload, the user is restored via `GET /api/users/me`. Safer against XSS.

**Vite proxy** — in development, `/api/*` is proxied to `http://localhost:8080` to avoid CORS. In production, CORS is configured on the backend via `CORS_ALLOWED_ORIGINS`.

**No Docker service for frontend in M2** — frontend runs via `vite dev` locally. A `frontend` service will be added to `docker-compose.yml` in M4.

**Prototype as reference, not as code** — the vanilla-JS `frontend/app.html` prototype is the UX/design reference. Logic (AI calls, export) is ported; the code is rewritten in React + TypeScript from scratch.

## Deployment (planned for M4)

- **Containerised**: both services Dockerised; `docker compose` for dev
- **Production options**: Railway / Fly.io / AWS ECS / VPS
- **Env separation**: `application.properties` with overridable env vars; a `application-prod.properties` if we need prod-specific tuning
- **Zero secrets in git**: all credentials via env vars only

## Future scaling considerations

- **Long-running AI calls**: currently synchronous. For >60s requests, move to a job queue (Spring Batch, or a simple async endpoint + polling)
- **Rate limiting**: add `bucket4j` on `/api/ai/*` per-user
- **Caching**: Redis in front of Claude for identical prompts (saves cost)
- **Multi-tenancy**: current model is single-user ownership. If orgs/teams come, add `organization_id` FK across relevant entities
- **Observability**: Micrometer metrics, structured JSON logs with correlation IDs
