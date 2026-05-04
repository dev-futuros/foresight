# Architecture

This document describes the system architecture, design decisions, and conventions for the Foresight platform.

## High-level overview

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   Browser   │ ──HTTP─▶│   Backend    │ ──HTTP─▶│  Anthropic   │
│  (React)    │         │ (Spring Boot)│         │  Claude API  │
└──────┬──────┘         └──────┬───────┘         └──────────────┘
       │                       │
       │ JWT (session)         ▼
       │                ┌──────────────┐
       ▼                │  PostgreSQL  │
┌─────────────┐         └──────────────┘
│    Clerk    │ ─webhook────▲
│ (auth host) │             │
└─────────────┘ ─────────────┘  user.created / updated / deleted
```

- **Frontend** authenticates against Clerk and talks to the backend with the session JWT Clerk hands it. It never calls Anthropic directly — that key stays server-side.
- **Backend** is the single gateway: validates Clerk JWTs, runs business logic, persists data, proxies AI calls. It is stateless.
- **Clerk** owns identities, credentials, sessions, MFA, social login, email delivery, and rate-limiting on auth endpoints. The backend never sees a password — and never even stores the user's email. The only mirrored identity field is the stable `clerk_user_id`.
- **PostgreSQL** stores a minimal `users` row (linked to Clerk by `clerk_user_id`, kept in sync via webhook + lazy creation), reports, and — eventually — billing data.
- **Anthropic Claude API** is only reachable via the backend.

## Backend

### Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | Java 21 | LTS, modern records / sealed / pattern matching |
| Framework | Spring Boot 3.5 | Industry standard, mature ecosystem |
| DB access | Spring Data JPA + Hibernate | Productivity, rich query support |
| Migrations | Flyway | Versioned, reproducible schema changes |
| HTTP client | Spring WebClient | Reactive, supports streaming later |
| Auth | Clerk session JWT, validated against Clerk JWKS | Delegate identity to a hosted provider; keep backend stateless |
| JWT validation | `spring-security-oauth2-resource-server` (Nimbus) | Standard, handles JWKS caching and rotation |
| Webhook signatures | `com.svix:svix` | Official Svix client — Clerk webhooks are Svix-signed |
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
│   └── security/            # ClerkJwtDecoderConfig, JwtAuthFilter,
│                            # AiRateLimitFilter, AuthenticatedUser, DevPrincipal
├── user/                    # User entity (linked to Clerk via clerk_user_id),
│                            # UserService (incl. findOrCreateByClerkUserId),
│                            # /api/users/me endpoints
├── report/                  # foresight reports CRUD
├── ai/                      # Claude proxy service
├── webhook/                 # ClerkWebhookController + event parser
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

The internal `User.id` (UUID) is the foreign-key target for everything the backend owns (`reports`, future `subscriptions`, …) — this stays stable even if Clerk identifiers change.

Implemented in `common/domain/BaseEntity.java`, inherited by all entities.

#### Auditing

Every entity inherits `createdAt` and `updatedAt` via JPA's `@EntityListeners(AuditingEntityListener.class)`. Activated at the app level with `@EnableJpaAuditing`.

#### Authentication flow (Clerk-based)

1. The user signs in or signs up through Clerk's prebuilt React components (`<SignIn>` / `<SignUp>`) — Clerk handles email verification, social login, MFA, password reset, etc.
2. Clerk issues a short-lived **session JWT** signed with its private key. The frontend retrieves it via `useAuth().getToken()` (wired through `<AuthBridge>`).
3. Every API request goes out with `Authorization: Bearer <clerk-session-jwt>`.
4. `JwtAuthFilter` extracts the token and validates it through a `JwtDecoder` (Nimbus) configured against Clerk's JWKS URI. Validators enforce signature + issuer + expiration.
5. The filter pulls the `sub` claim (Clerk's stable user id) and looks up the local `users` row by `clerk_user_id`. If the row doesn't exist yet (race against the `user.created` webhook), it lazy-creates one — `name` is sourced via `ClerkBackendClient` (see below), with the JWT claims (`name`, `first_name`) as fallback.
6. The filter populates the `SecurityContext` with an `AuthenticatedUser(uuid, clerkUserId, role)` principal, so `@CurrentUser`-annotated controller params keep working unchanged.

The backend never sees a password, never issues a token, and has no `accessTokenTtl` to manage. Token lifetime is governed entirely by Clerk's JWT template settings.

#### How `name` is populated

Clerk's default session JWT carries only identity claims (`sub`, `iss`, `iat`, `exp`, `nbf`, `azp`) — no `name`. To surface the user's display name without forcing every deployment to manually configure a JWT template, the backend has a tiny client (`ClerkBackendClient`) that calls Clerk's Backend API:

- **On lazy-create**: `GET https://api.clerk.com/v1/users/{sub}` with `Authorization: Bearer ${CLERK_SECRET_KEY}` returns the live profile. We compose `name` from `first_name + last_name` and persist it.
- **As a heal-on-read**: if `findOrCreateByClerkUserId` finds an existing row whose `name` is null/blank (e.g. created before the secret was wired in), the same call backfills it in place. The guard short-circuits as soon as `name` is set, so the heal only runs once per user.
- **Fallback chain**: Backend API → JWT claims (`name`, `first_name`) → leave `null`. The user can always edit `name` from the account page later, and the `user.updated` webhook will keep the row in sync.

`CLERK_SECRET_KEY` is optional. When blank, `ClerkBackendClient.fetchUser()` is a silent no-op returning `Optional.empty()`, and the chain falls through to JWT/null. Auth keeps working in environments that haven't wired the key yet.

#### Concurrency on first sign-in

`findOrCreateByClerkUserId` runs on **every** authenticated request, so the very first time a brand-new user lands on the dashboard several requests typically hit it in parallel (e.g. `/users/me` and `/reports`). Each thread sees "user not found" and would race to INSERT.

Two layers handle this:

1. **JVM-level lock per Clerk id** — `UserService` keeps a `ConcurrentMap<String, Object>` of locks keyed by `clerkUserId`. The first thread acquires it and INSERTs; subsequent threads wait briefly, then read the row that the first one just wrote. The map entry is removed after creation finishes so it cannot grow unbounded.
2. **DB unique constraint as last-resort guard** — if a different JVM instance ever wins the race, the second INSERT fails with `DataIntegrityViolationException`. The catch falls back to a SELECT and returns the row written by the winner. The method is intentionally not `@Transactional` at the top level so a failed save does not poison the caller's transaction (which would otherwise be marked rollback-only and break the recovery query).

#### User lifecycle (Clerk → backend)

The `users` table mirrors a tiny subset of Clerk's user store:

- **Create / update**: the `user.created` and `user.updated` webhooks fire `UserService.upsertFromClerk(clerkId, name)`. As a safety net, `JwtAuthFilter.findOrCreateByClerkUserId` lazy-creates the row on first authenticated request — handles the brief window between sign-up and webhook delivery.
- **Delete**: the `user.deleted` webhook fires `UserService.deleteByClerkUserId(clerkId)`, which cascades to all owned resources via the `reports.user_id` FK. `DELETE /api/users/me` is the user-initiated counterpart (and should also delete the Clerk side via Clerk's management API — TODO).

The webhook receiver (`/api/webhooks/clerk`) verifies the Svix signature on every delivery; deliveries with a missing or invalid signature are rejected with 400 before any work is done.

#### What lives where

| Field | Source of truth | Notes |
|---|---|---|
| `email`, `password`, MFA, social identities, email verification | **Clerk** | Never stored locally. The frontend reads the email from `useUser().primaryEmailAddress` when it needs to display it (e.g. in the account page). |
| `clerk_user_id` | **Clerk** (mirrored) | Stable identifier; what we look up by. |
| `name` | **Clerk** (mirrored) | Filled from the JWT `name` claim on lazy-create, or by the `user.updated` webhook. Locally editable via `PATCH /api/users/me` for convenience, but Clerk is still authoritative — webhook overwrites are accepted. |
| `role` | **Backend** | `USER` / `ADMIN`. Authorization decisions stay in the backend. |
| `language` | **Backend** | UI preference (`es` / `en`), edited from the account page. |
| Reports, future subscriptions | **Backend** | Owned entirely by us, FK'd to `users.id`. |

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

Domain exceptions: `NotFoundException`, `ConflictException`, `ForbiddenException`, `BadRequestException`.

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

Current migrations:

| Version | What it does |
|---------|--------------|
| `V1__init.sql` | Initial schema: `users`, `reports`. |
| `V2__auth_tokens.sql` | Legacy: short-lived password-reset / email-verification tokens. (Dropped by V3.) |
| `V3__clerk_auth.sql` | Adds `clerk_user_id` to `users`; drops `password`, `email_verified`, and the V2 token tables. |
| `V4__fix_user_constraints_for_clerk.sql` | Drops the `email` column entirely (Clerk owns it); makes `clerk_user_id` `NOT NULL` and unique-indexed. |

#### Rate limiting

The `AiRateLimitFilter` (Bucket4j, in-memory) caps `/api/ai/**` per authenticated user. Defaults: 100 calls / hour / user — generous for genuine wizard use, hostile to scripted abuse.

Auth-endpoint rate limiting is not implemented in the backend any more — Clerk handles it for the auth flows it owns. If we add public unauthenticated endpoints later (e.g. a public landing page contact form), we'll re-introduce a per-IP filter for those specific paths.

## Security decisions

| Threat | Mitigation |
|---|---|
| API key theft | Claude key only server-side; never reaches browser. |
| Password cracking | We don't store passwords — Clerk does, with their own hashing + breach detection. |
| Token forgery | Backend validates Clerk JWTs against Clerk's JWKS (public-key signature, can't be forged). Issuer is pinned. |
| Webhook forgery | Every Clerk webhook delivery verified via Svix HMAC signature before any side effect. |
| ID enumeration | UUIDs everywhere. |
| Cross-origin attacks | CORS whitelist configured via env var. |
| Mass assignment | DTOs never expose entity fields directly. |
| SQL injection | JPA + parameterized queries only. |
| Logging secrets | API keys / JWTs / webhook secrets never logged. |
| AI cost abuse | Per-user token bucket on `/api/ai/**` (Bucket4j). |
| Replay of webhooks | Svix verification rejects events outside a 5-minute timestamp window. |

## Frontend

### Tech stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite | Fast HMR, native ESM, minimal config |
| Language | TypeScript | Type-safe API contracts, autocomplete on DTOs |
| Framework | React 19 | Component model, large ecosystem |
| Routing | React Router v7 | Protected routes, nested layouts |
| Auth | `@clerk/react@6` | Hosted auth with prebuilt `<SignIn>` / `<SignUp>` / `<UserButton>` components |
| HTTP | Axios | Async request interceptor for Clerk session JWT injection |
| Server state | TanStack Query v5 | Caching, invalidation, background refresh |
| i18n | i18next | TS catalogs, ES default, EN secondary |
| Export PDF | jsPDF | Direct multi-page generation with the platform's design system |
| Export PPT | pptxgenjs | Already proven in prototype |
| Styles | CSS variables | Port dark design system from prototype (no CSS framework) |
| Tests | Vitest + React Testing Library | Fast, integrated with Vite |

### Package-by-feature structure

```
frontend/src/
├── main.tsx                 # mounts <ClerkProvider> with VITE_CLERK_PUBLISHABLE_KEY
├── App.tsx                  # router root; mounts <AuthBridge>
├── lib/
│   ├── api.ts               # Axios instance — async tokenGetter for Clerk JWT
│   ├── apiError.ts          # Backend ApiError → user-facing message
│   ├── queryClient.ts       # TanStack Query global config
│   ├── exportPdf.ts         # jsPDF report export
│   └── exportPpt.ts         # pptxgenjs report export
├── hooks/
│   ├── useAuth.ts           # useCurrentUser (gated by Clerk's isSignedIn) + useLogout
│   ├── useAccount.ts        # useUpdateProfile (name + language only — Clerk owns email/password)
│   ├── useLanguageSync.ts   # syncs user's language to i18n on load
│   └── useReports.ts        # CRUD reports
├── features/
│   ├── dashboard/           # DashboardPage (report list)
│   ├── report/
│   │   ├── NewReportPage.tsx # 3-step wizard
│   │   ├── ReportPage.tsx    # tabbed result view (Inputs / Resultados)
│   │   └── steps/            # StepEmpresa, StepSteep, StepHorizon
│   └── account/             # AccountPage (profile + language; password/email via UserButton menu)
├── components/
│   ├── AuthBridge.tsx       # connects Clerk's getToken to lib/api.ts on mount
│   └── ProtectedRoute.tsx   # Clerk-based auth guard for routes
├── i18n/
│   ├── index.ts             # i18next init
│   └── locales/
│       ├── es.ts
│       └── en.ts
├── test/                    # Vitest + RTL tests + setup
└── types/
    └── api.ts               # TypeScript types mirroring backend DTOs
```

### Key decisions

**Clerk owns auth UI.** Sign-in and sign-up routes (`/sign-in/*`, `/sign-up/*`) render Clerk's prebuilt `<SignIn>` / `<SignUp>` components. Email verification, password reset, MFA enrolment, and account management UI are all hosted by Clerk — no custom forms to maintain.

**Tokens via async interceptor.** Clerk's `getToken()` is async (it may need to refresh). `lib/api.ts` exposes `setTokenGetter(...)` and runs the getter inside an async axios request interceptor; `<AuthBridge>` (mounted once inside `<ClerkProvider>`) registers Clerk's getter on mount and clears it on unmount. The rest of the codebase keeps using a single shared axios instance without each call having to plumb a token through manually.

**`useCurrentUser` is gated.** The query is `enabled` only after Clerk reports `isLoaded && isSignedIn` — prevents the brief 401 flash that would otherwise happen between mount and the first time `getToken()` resolves, and avoids fetching for signed-out users.

**Email read directly from Clerk.** The DB no longer stores email, so the account page reads it from `useUser().primaryEmailAddress.emailAddress`. The Clerk `<UserButton />` is the canonical entry point for changing email, password, MFA, and social connections.

**Vite proxy.** In development, `/api/*` is proxied to `http://localhost:8080` to avoid CORS. In production, CORS is configured on the backend via `CORS_ALLOWED_ORIGINS`.

**Prototype as reference, not as code.** The vanilla-JS `frontend/app.html` prototype is the UX/design reference. Logic (AI calls, export) is ported; the code is rewritten in React + TypeScript from scratch.

## Deployment (planned for M4)

- **Containerised**: both services Dockerised; `docker compose` for dev.
- **Production options**: Railway / Fly.io / AWS ECS / VPS.
- **Env separation**: `application.properties` with overridable env vars; `application-prod.properties` for prod-specific tuning.
- **Zero secrets in git**: all credentials via env vars only.
- **Clerk prod instance**: separate from the dev instance; bound to a custom domain (`clerk.<yourdomain>`); receives its own webhook signing secret.

## Future scaling considerations

- **Long-running AI calls**: currently synchronous. For >60s requests, move to a job queue (Spring Batch, or a simple async endpoint + polling).
- **Caching**: Redis in front of Claude for identical prompts (saves cost).
- **Multi-tenancy**: current model is single-user ownership. If orgs/teams come, Clerk Organizations maps cleanly onto an `organization_id` FK across relevant entities.
- **Observability**: Micrometer metrics, structured JSON logs with correlation IDs.
- **Distributed rate limiting**: today's `AiRateLimitFilter` is in-memory; swap to a Redis-backed bucket once we scale beyond a single instance.
