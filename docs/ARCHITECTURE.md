# Architecture

This document describes the system architecture, design decisions, and conventions for the Foresight platform.

## High-level overview

```
                                                ┌──────────────┐
                                  HTTP / stream │  Anthropic   │
                                ┌──────────────▶│  Claude API  │
                                │               └──────────────┘
┌─────────────┐  HTTP + SSE    ┌┴─────────────┐    JPA      ┌──────────────┐
│   Browser   │◀──────────────▶│   Backend    │◀───────────▶│  PostgreSQL  │
│  (React)    │  Bearer JWT    │ (Spring Boot)│             └──────────────┘
└──────┬──────┘                └──────▲───────┘
       │                              │  Svix-signed webhooks
       │ Clerk SDK                    │  (user.* + Clerk Billing)
       ▼                              │
┌─────────────────┐                   │
│      Clerk      │───────────────────┘
│ (auth + billing)│
└─────────────────┘

   Side channel: PostHog
   ─────────────────────
   Backend  ── $ai_generation ─▶  PostHog (server SDK, opt-in)
   Browser  ── pageviews/UI  ─▶  PostHog (posthog-js, opt-in)
   Shared distinct id = clerkUserId for correlation
```

- **Frontend** authenticates against Clerk and talks to the backend with the session JWT Clerk hands it. Long-running AI calls are streamed back as Server-Sent Events. It never calls Anthropic directly — that key stays server-side.
- **Backend** is the single gateway: validates Clerk JWTs, enforces subscription gating, runs business logic, persists data, proxies AI calls, captures LLM telemetry. It is stateless.
- **Clerk** owns identities, credentials, sessions, MFA, social login, email delivery, rate-limiting on auth endpoints, **and the billing flow** (Clerk Billing). The backend never sees a password — and never stores the user's email. The only mirrored identity field is the stable `clerk_user_id`; subscription plan and period bounds are mirrored from Clerk Billing via the same webhook.
- **PostgreSQL** stores a minimal `users` row, reports (with cached translations and PDF-optimised text), examples (DEV-curated report snapshots), and share tokens (frozen public snapshots).
- **Anthropic Claude API** is only reachable via the backend, tier-routed (haiku / sonnet / opus) per call.
- **PostHog** receives `$ai_generation` events for every Anthropic call (server-side) plus pageviews / UI events from the browser. Default-off; opt-in per environment.

## Backend

### Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | Java 21 | LTS, modern records / sealed / pattern matching |
| Framework | Spring Boot 3.5 | Industry standard, mature ecosystem |
| DB access | Spring Data JPA + Hibernate | Productivity, rich query support |
| JSONB columns | `hypersistence-utils-hibernate-63` | First-class JSONB mapping (reports, translations, share snapshots) |
| Migrations | Flyway | Versioned, reproducible schema changes |
| HTTP client | Spring WebClient + `RestClient` | Reactive for Anthropic streams; sync `RestClient` for Clerk Backend API |
| Async streaming | Spring MVC + `Flux<JsonNode>` wrapped as `ServerSentEvent` | Backpressure-aware streaming of long Claude calls to the browser |
| Auth | Clerk session JWT, validated against Clerk JWKS | Delegate identity to a hosted provider; keep backend stateless |
| Billing | Clerk Billing (mirrored via webhook); Stripe wiring on `feature/stripe` | Same provider as auth — one webhook, one source of truth |
| JWT validation | `spring-security-oauth2-resource-server` (Nimbus) | Standard, handles JWKS caching and rotation |
| Webhook signatures | `com.svix:svix` | Official Svix client — Clerk webhooks are Svix-signed |
| Validation | Bean Validation (`jakarta.validation`) | Declarative on DTOs |
| Boilerplate | Lombok | Removes getters/setters/builders noise |
| AI SDK | `com.anthropic:anthropic-java` | Official SDK with tool-use, streaming, web_search support |
| Rate limiting | `com.bucket4j:bucket4j_jdk17-core` (in-memory) | Per-user token bucket on `/api/ai/**` |
| Observability | `com.posthog:posthog-server` | `$ai_generation` events for every Anthropic call |
| Env loading | `me.paulschwarz:spring-dotenv` | Reads `../.env.<profile>` so devs don't duplicate config in IntelliJ |
| Docs | springdoc-openapi (Swagger UI) | Auto-generated from controllers |
| Tests | JUnit 5 + Testcontainers | Real Postgres in tests, not mocks |

### Package-by-feature

The backend organises code **by feature**, not by layer:

```
com.foresight.backend/
├── ForesightBackendApplication.java
├── common/                  # cross-cutting: security, base entity, exceptions, health
│   ├── HealthController.java
│   ├── config/              # SecurityConfig, SecurityProperties, OpenApiConfig, ClockConfig, JwtConfig
│   ├── domain/              # BaseEntity (UUID, timestamps)
│   ├── exception/           # GlobalExceptionHandler, ApiError, domain exceptions
│   └── security/            # ClerkJwtDecoderConfig, JwtAuthFilter, AiRateLimitFilter,
│                            # AuthenticatedUser, DevPrincipal, DevUserSeeder, ClerkBackendClient
├── user/                    # User entity (clerk_user_id + role + language + subscription_*),
│                            # UserService (findOrCreateByClerkUserId), UserRole {USER, DEV, ADMIN}
├── report/                  # foresight reports CRUD with translations + pdf_optimized caches
├── ai/                      # Claude proxy: 16 endpoints (analyze pipeline, suggestions,
│                            # chat assistant, tighten) + AssistantTools (15 frontend tools)
├── analytics/               # PostHogConfig + LlmCapture wrapper for $ai_generation events
├── subscription/            # SubscriptionService gate (Clerk Billing-backed), plan/status records
├── share/                   # ShareController, PublicShareController, ShareService,
│                            # ShareToken (frozen multilingual snapshot of report or example)
├── example/                 # Example entity — DEV-promoted report snapshots, viewable to all
└── webhook/                 # ClerkWebhookController + event parser (user.* + subscription mirror)
```

> **Not present today:** a dedicated `billing/` package. Subscription state is mirrored from Clerk Billing through the existing `webhook/` receiver into the `users` table. The Stripe direct-integration branch (`feature/stripe`) lives in parallel; on `develop` there are no Stripe-specific endpoints.

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
| `V5__subscription.sql` | Adds `subscription_plan`, `subscription_current_period_start/end` to `users`; CHECK constraint on plan whitelist; composite index `(user_id, created_at DESC)` on `reports` for period-window counting. |
| `V6__share_tokens.sql` | Creates `share_tokens` table (token, report_id, frozen snapshot columns, expiry); indexes on `token`, `report_id`, `expires_at`. |
| `V7__report_translations.sql` | Adds `translations` (JSONB) and `primary_language` to `reports`. |
| `V8__examples.sql` | Creates `examples` table — DEV-curated report snapshots keyed by `slug`, with `translations` JSONB. |
| `V9__share_tokens_for_examples.sql` | Makes `share_tokens.report_id` nullable; adds `example_id` + XOR CHECK constraint so each share row points at exactly one source. |
| `V10__share_token_translations.sql` | Adds `translations` + `primary_language` to `share_tokens` so a snapshot can ship all baked translations. |
| `V11__report_pdf_optimized.sql` | Adds `pdf_optimized` (JSONB) to `reports` — per-language cache of "tightened" prose for the PDF export pipeline. |

#### Rate limiting

The `AiRateLimitFilter` (Bucket4j, in-memory) caps `/api/ai/**` per authenticated user. Defaults: 100 calls / hour / user — generous for genuine wizard use, hostile to scripted abuse.

Auth-endpoint rate limiting is not implemented in the backend any more — Clerk handles it for the auth flows it owns. If we add public unauthenticated endpoints later (e.g. a public landing page contact form), we'll re-introduce a per-IP filter for those specific paths.

#### Subscription gating

Report creation is gated by `SubscriptionService.assertCanCreateReport()`:

- **Required plan**: `FUTUROS_PLATAFORMA` (the only plan today; a DB CHECK constraint on `users.subscription_plan` enforces the whitelist so a typo can't sneak in via webhook).
- **Quota**: 10 reports per billing period. Period bounds come from `subscription_current_period_start` / `subscription_current_period_end` on the user row; usage is counted by `reports.created_at` falling inside that window (covered by a composite index on `(user_id, created_at DESC)`).
- **Exceptions**:
  - `SubscriptionRequiredException` → `402 Payment Required` — user has no plan, or the current period has ended.
  - `ReportLimitExceededException` → `429 Too Many Requests` — period quota exhausted. The response body carries `limit`, `used`, `periodEnd` so the frontend can render an informative paywall instead of a generic error.
- **DEV bypass**: users with `UserRole.DEV` skip the check entirely — used by the internal team for demos and testing. The role is promoted by direct SQL only (no UI surface, no endpoint).

The plan, period bounds, and quota counters are mirrored from **Clerk Billing** via the same `/api/webhooks/clerk` receiver that handles `user.*` events. The backend does not talk to Stripe directly on `develop` — Clerk Billing intermediates the payment flow. A frontend `useSubscription` hook surfaces `SubscriptionService.statusOf()` (no dedicated controller endpoint; the status is bundled into the user-context responses the UI already fetches).

> **M3 status:** the gate + DB columns + DEV bypass + Clerk-mirrored fields landed first so the rest of the product could be built behind a real paywall. Direct Stripe integration (checkout sessions, `/api/billing/*`) lives on the `feature/stripe` branch and is the in-flight work.

#### Share tokens (public snapshots)

Reports and examples can be made publicly viewable via a URL-safe random token (no auth). Three guarantees:

- **Frozen snapshot.** When the token is minted, the source is copied verbatim into the `share_tokens` row (`title`, `input_data`, `result_data`, all cached `translations`). Subsequent edits to the source do **not** propagate — recipients always see what was shared at mint time.
- **XOR scope.** A row references exactly one of `report_id` or `example_id` (DB CHECK constraint). Same `ShareService` mints both; two controller endpoints (`POST /api/reports/{id}/share` and `POST /api/examples/{id}/share`).
- **Hard expiry.** Default 7 days. `GET /api/public/share/{token}` returns 404 once `expires_at` has passed (no grace period, no revocation endpoint — let it expire).

Multilingual support landed in V10: a single token bakes in all the source's cached translations at mint time. The public viewer toggles languages client-side without re-fetching. Tokens minted before V10 fall back to `primary_language='es', translations=NULL` for backward compatibility.

The public viewer is served via a **separate Vite build** (`vite.snapshot.config.ts` → `share-snapshot.html`) that inlines all JS and CSS into a single self-contained HTML file (via `vite-plugin-singlefile`). The export pipeline can download this as a stand-alone file that opens in any browser — the "Informe cliente digital" deliverable on the marketing site.

#### Examples (curated snapshots)

Examples are read-only **report snapshots** promoted by the team to act as on-platform references — they show new users what a finished analysis looks like without exposing real client data. Concretely:

- An example is a copy of a report's `inputData` + `resultData` keyed by a stable kebab-case `slug` (the upsert key on re-promotions, so re-running the analysis for a known example refreshes it in place).
- Every authenticated user can list (`GET /api/examples`) and view (`GET /api/examples/{id}`).
- Promotion, deletion, translation management, and demotion are all `UserRole.DEV` only — enforced inside `ExampleService`.
- Examples can be **shared publicly** (`POST /api/examples/{id}/share`) — same `share_tokens` table, same snapshot semantics as reports.
- Demotion (`POST /api/examples/{id}/demote`) creates a fresh private report owned by the caller and removes the example row — useful when an example needs editing.

#### Streaming AI endpoints (SSE)

The full-report generation pipeline is split into named phases so the frontend can render progress and partial output without waiting for one 60-120s call to finish:

| Step | Endpoint | Model tier | Streamed |
|---|---|---|---|
| Global STEEP scan | `POST /api/ai/global-steep-scan` | sonnet (web_search) | yes |
| Global STEEP per-dimension | `POST /api/ai/global-steep-dim` | haiku | yes |
| Research pass | `POST /api/ai/analyze/scan` | opus (web_search) | yes |
| Executive summary + signals + wildcards | `POST /api/ai/analyze/summary` | opus | yes |
| 3P scenarios | `POST /api/ai/analyze/scenarios` | opus | yes |
| Scenario planning (2×2, driving forces) | `POST /api/ai/analyze/scenario-planning` | opus | yes |
| Strategic map (H1/H2/H3) | `POST /api/ai/analyze/strategic-map` | opus | yes |
| Backcasting | `POST /api/ai/analyze/backcasting` | opus | yes |
| Sources gathering | `POST /api/ai/analyze/sources` | opus (web_search) | no |
| One-shot full analysis (legacy) | `POST /api/ai/analyze` | opus | no |

Streaming endpoints return `Flux<JsonNode>` wrapped as `text/event-stream`. Event shape is `{type, ...}`:

- `progress` — fires ~5×/sec with running `chars` and (for web_search calls) `sources` counts. Lets the UI animate.
- `done` — terminal frame with the parsed result (text or JSON) and `citations`.

Client disconnects propagate up to the Anthropic call so token generation stops — important for cost containment. Non-streaming endpoints that still call AI (translate, share-create) return `Callable<T>` so Spring MVC's async dispatcher uses `spring.mvc.async.request-timeout=480000` (480s) instead of Tomcat's ~30s default.

#### Per-tier model selection

Each AI call picks the cheapest model that's still good enough for the job. The mapping is config-driven so we can re-tune per environment without changing code:

| Tier | Default model | Used by |
|---|---|---|
| `haiku` | `claude-haiku-4-5-20251001` | All "suggest" endpoints, Step 2 per-dimension reformulations |
| `sonnet` | `claude-sonnet-4-6` | Step 2 global STEEP scan (web_search), chat assistant |
| `opus` | `claude-opus-4-7` | Research scan, all 5 analyze section calls, legacy `/analyze`, `/analyze/sources` |

Keys live under `foresight.ai.anthropic.models.{haiku,sonnet,opus}` in `application.properties`. The fallback `foresight.ai.anthropic.model` is read only if a tier slot is left blank in an env-specific override.

#### Chat assistant (`/api/ai/chat`)

`POST /api/ai/chat` (and `/api/ai/chat/stream`) implements a stateless conversational agent — the frontend sends the full message history each turn. Two pieces of context are stitched into the system prompt:

- **USER STATE snapshot** — a pre-formatted block of the current screen, current draft report, recent reports list, locale, etc. Built in the browser by `buildAssistantSnapshot()` (in `frontend/src/lib/`) and passed as `context`. Lets the model answer "what's in step 2?" without a RAG round-trip.
- **Tool catalogue** — 15 declarative tools (`AssistantTools.java`) the model can call to drive the UI. Tool calls flow back to the browser as part of the chat response and are executed by `commandBus.ts` against the active React tree. Two tools (`generateGlobalSteep`, `runAnalysis`) require explicit user confirmation before firing.

Tools cover navigation (`goTo`, `openDashboard`, `closeDashboard`, `newReport`, `loadReport`), wizard control (`wizardNext`, `wizardBack`, `setField`), report management (`editReport`, `deleteReport`, `refreshReports`), generation (`generateGlobalSteep`, `runAnalysis`), and locale (`setLang`).

The chat endpoint uses the **sonnet** tier — fast enough for conversational latency, capable enough for multi-tool reasoning.

#### Report translations + PDF-optimised cache

Reports carry two extra JSONB caches keyed by language:

| Column | Migration | Shape | Used by |
|---|---|---|---|
| `translations` | V7 | `{ "<lang>": {inputData, resultData, generatedAt} }` | Viewing a report in another language without re-running analyze |
| `pdf_optimized` | V11 | `{ "<lang>": {version, generatedAt, fields: {"<dotted.path>": "shortened text"}} }` | PDF export pipeline when long prose would overflow the layout |

Translation is on-demand and cached:

- `POST /api/reports/{id}/translate?targetLanguage=<lang>&force=false` — runs Claude to translate the full report; cached on success. Returns `Callable<T>` for async dispatch.
- `POST /api/reports/{id}/translate/stream?...` — SSE variant.
- `DELETE /api/reports/{id}/translations/{language}` — evicts a cached language.

PDF-optimised text is a separate cache fed by `POST /api/ai/tighten`, which shortens individual prose blocks to fit a layout budget without losing meaning. Values are stored under dotted paths (`"steep.global.S"`, `"scenarios.0.description"`, …) and pushed via `PUT /api/reports/{id}/pdf-optimized/{language}` with `{fields: {...}}`. The `version` field lets the export pipeline invalidate the cache when the layout changes.

The same translations shape is used by `share_tokens.translations` (V10) and `examples.translations` (V8) so a snapshot inherits whatever translations its source had cached at mint / promotion time.

#### LLM observability (PostHog)

Every Anthropic call fires a `$ai_generation` event to PostHog using the canonical LLM schema:

- **Identity**: `$ai_trace_id`, `$ai_session_id` (forwarded from the frontend via the `X-PostHog-Session-Id` header), `$ai_span_name`, distinct id = the authenticated user's Clerk id
- **Call**: `$ai_provider=anthropic`, `$ai_model`, `$ai_base_url`, `$ai_stream`, `$ai_max_tokens`, `$ai_tools`
- **Usage**: `$ai_input_tokens`, `$ai_output_tokens`, `$ai_cache_read_input_tokens`, `$ai_cache_creation_input_tokens`
- **Result**: `$ai_input`, `$ai_output_choices`, `$ai_stop_reason`, `$ai_latency`, `$ai_http_status`, `$ai_is_error`, `$ai_error`
- **Custom**: `feature` (which endpoint), `sources_count` (for web_search calls)

`LlmCapture.capture()` is invoked from `AiService` after every call — success or failure. Distinct id matches the frontend's `posthog.identify(clerkUserId)` so backend `$ai_generation` events correlate with browser pageviews and UI events from `posthog-js`.

Default-off (`foresight.analytics.posthog.enabled=false`). When enabled with a blank API key, the app **fails to start** — a deliberate fail-fast so silent misconfigs don't ship as no-ops in production. The frontend snippet, by contrast, installs a no-op stub when either flag or key is missing (so the UI never breaks on missing analytics).

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
| Build | Vite (dual config: SPA + single-file snapshot) | Fast HMR; `vite-plugin-singlefile` builds the public share snapshot as one inline HTML |
| Language | TypeScript | Type-safe API contracts, autocomplete on DTOs |
| Framework | React 19 | Component model, large ecosystem |
| Routing | React Router v7 | Protected routes, nested layouts |
| Auth | `@clerk/react@6` | Hosted auth with prebuilt `<SignIn>` / `<SignUp>` / `<UserButton>` components |
| HTTP | Axios | Async request interceptor for Clerk session JWT injection |
| Server state | TanStack Query v5 | Caching, invalidation, background refresh |
| AI streaming | Native `fetch` + `ReadableStream` parser | Consumes the backend's SSE phases of the analyze pipeline |
| i18n | i18next + `react-i18next` | TS catalogs, ES default, EN secondary; wraps `TranslationsContext` for in-app dynamic copy |
| Analytics | `posthog-js` (no-op stub when disabled) | Pageviews + UI events, correlated server-side via shared distinct id |
| Export PDF | jsPDF + custom layout engine (`pdfFit.ts`) + AI-assisted "tighten" cache | Generates light/dark themed multi-page reports client-side |
| Export PPT | pptxgenjs | Generates editable slide decks client-side |
| Export HTML | Standalone snapshot build (`exportHtml.tsx` + `share-snapshot.html`) | Self-contained client deliverable |
| Styles | CSS variables, per-feature `.css` files | Dark design system ported from the prototype (no CSS framework) |
| Production server | Caddy 2 alpine, SPA fallback to `index.html` | Multi-stage Dockerfile: Node 20 build → Caddy serve |
| Tests | Vitest + React Testing Library | Fast, integrated with Vite |

### Package-by-feature structure

```
frontend/src/
├── main.tsx                 # mounts <ClerkProvider> with VITE_CLERK_PUBLISHABLE_KEY
├── App.tsx                  # router root; mounts <AuthBridge> + global CookieConsent
├── share-snapshot.tsx       # entry for vite.snapshot.config.ts → standalone share viewer
├── lib/
│   ├── api.ts               # Axios instance — async tokenGetter for Clerk JWT
│   ├── apiError.ts          # Backend ApiError → user-facing message
│   ├── queryClient.ts       # TanStack Query global config
│   ├── aiClient.ts          # AI fetch wrappers (SSE parsers for analyze phases + chat)
│   ├── posthog.ts           # posthog-js bootstrap; no-op stub when disabled
│   ├── exportPdf.ts         # jsPDF report export, light/dark theme
│   ├── exportPpt.ts         # pptxgenjs slide deck export
│   ├── exportHtml.tsx       # injects report payload into share-snapshot.html
│   ├── pdfFit.ts            # layout-budget helper feeding the "tighten" cache
│   ├── assistantBridge.ts   # wires chat tool-calls to the running React tree
│   ├── buildAssistantSnapshot.ts  # serialises USER STATE block sent to /api/ai/chat
│   ├── commandBus.ts        # executes assistant tool calls (with confirm modal where needed)
│   └── useCommands.ts       # hook surface around commandBus for components
├── hooks/
│   ├── useAuth.ts           # useCurrentUser (gated by isSignedIn) + useLogout
│   ├── useAccount.ts        # useUpdateProfile (name + language only)
│   ├── useLanguageSync.ts   # syncs user.language to i18next on load
│   ├── useReports.ts        # CRUD reports + translation management
│   ├── useChat.ts           # chat assistant request/response + streaming
│   ├── useShare.ts          # create share tokens for reports/examples
│   ├── useExamples.ts       # list/get examples + promote/demote (DEV)
│   ├── useSubscription.ts   # current plan, usage, period bounds
│   └── useStopwatch.ts      # ticking timer for streaming UIs
├── features/
│   ├── dashboard/           # DashboardPage (report list, status, delete)
│   ├── report/
│   │   ├── NewReportPage.tsx     # 4-step wizard
│   │   ├── ReportPage.tsx        # tabbed result view with export menu
│   │   ├── ReportContent.tsx     # shared body used by ReportPage + ShareView
│   │   ├── steps/                # StepEmpresa, StepSteep, StepHorizon, StepGlobal
│   │   └── tabs/                 # TabSummary, TabScenarios, TabScenarioPlanning,
│   │                             # TabBackcasting, TabStrategicMap, TabSignals,
│   │                             # TabSources, ImpactMatrix
│   ├── chat/                # ChatAssistant + AssistantCommands + AssistantContextProvider
│   ├── publicShare/         # PublicSharePage (router-mounted) + ShareView (shared body)
│   ├── account/             # ClerkPreferencesPage + AppUserButton + appearance config
│   ├── auth/                # AuthLayout, Clerk appearance, Clerk localization (ES/EN)
│   ├── shell/               # AppShell, TopBar, AppFooter, Stepper + StepperContext
│   ├── translations/        # TranslationsContext (per-report language toggle)
│   ├── privacy/             # PrivacyPage (public)
│   └── cookies/             # CookieConsent (overlays every page until accepted)
├── components/              # ConfirmDialog, ExportModal, ShareModal, PromoteToExampleModal,
│                            # OnboardingDialog, Modal, InfoTooltip, LineClamp, LoadingOverlay,
│                            # LoadingPanel, SplitButton, IconSprite, LanguageToggle,
│                            # AuthBridge, ProtectedRoute, useMaximizable
├── i18n/
│   ├── index.ts             # i18next init
│   └── locales/
│       ├── es.ts            # default
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

**Vite proxy.** In development, `/api/*` is proxied to `http://localhost:8080` to avoid CORS. In production, CORS is configured on the backend via `CORS_ALLOWED_ORIGINS` and Caddy serves the SPA.

**Prototype as reference, not as code.** The vanilla-JS prototype (committed at `frontend/Futuros — Advanced AI Strategic Tools.html`) is the UX/design reference. Logic (AI calls, export) is ported; the code is rewritten in React + TypeScript from scratch. The marketing landing page lives in the same file and is the canonical source for the public site.

**Dual Vite build.** Production runs two passes:
- `vite build` → SPA bundle in `dist/` (Caddy serves it; React Router resolves client-side via a catch-all to `/index.html`).
- `vite build --config vite.snapshot.config.ts` → single-file `dist/share-snapshot.html` (one HTML with all JS/CSS inlined). The export pipeline downloads it, splices the report payload, and hands the user a stand-alone file. Snapshot config uses `emptyOutDir: false` so it doesn't wipe the SPA build.

**Streaming-aware UI.** Long-running analyze phases consume SSE via `aiClient.ts`. The UI shows per-phase progress (chars + sources) and renders sections as they complete, so the user never stares at a spinner for a full minute.

**Chat assistant tool dispatch.** `commandBus.ts` is the bridge between the model's tool calls and the React tree. A small `useCommands` hook lets any component register a handler for a given tool name; the bus invokes the right one, surfacing a confirm modal for destructive or expensive actions (`runAnalysis`, `generateGlobalSteep`).

## Deployment

The shape is in place; the actual hosting target is the last open item on M4.

### What's wired

- **Containerised**: backend, frontend, and Postgres all Dockerised. Two compose files (`docker-compose-backend.yml`, `docker-compose-frontend.yml`) share an external `foresight` network so each can be cycled independently.
- **Frontend prod image**: multi-stage `frontend/Dockerfile.prod` — Node 20-alpine builds (SPA + snapshot), Caddy 2-alpine serves. `Caddyfile` routes unmatched paths to `/index.html` for client-side routing; `/assets/*` cached 1 year (content-hashed), `index.html` + `share-snapshot.html` no-cache.
- **Env separation**: `.env.local` / `.env.dev` / `.env.prod` at the repo root, each picked by the `up.ps1` / `up.sh` helper scripts. `application-<profile>.properties` for backend-side tuning.
- **Port autodetection**: backend reads `SERVER_PORT` then `PORT` (Railway / Heroku / Fly inject the latter) then falls back to 8080.
- **Health probe**: `/actuator/health` is the only Actuator endpoint exposed publicly.
- **Zero secrets in git**: all credentials via env vars only. `.env.*` files gitignored; `.env.example` is the source of truth for which variables exist.

### What's still open

- Picking the hosting target (Railway / Fly.io / VPS).
- CI pipeline (GitHub Actions: test → build → push image).
- Clerk **production** instance bound to a custom domain (`clerk.<yourdomain>`) with its own webhook signing secret.
- Error tracking (Sentry or similar).
- Structured JSON logs with correlation IDs + Micrometer `/actuator/prometheus`.

## Future scaling considerations

- **Long-running AI calls**: streaming SSE covers the 60-120s analyze pipeline well today. For full background processing (e.g. batch re-translation of many reports), move to a job queue (Spring Batch, or a simple async endpoint + polling).
- **Caching**: Redis in front of Claude for identical prompts (saves cost). The `translations` / `pdf_optimized` JSONB caches already cover the highest-leverage cases at the DB level.
- **Multi-tenancy**: current model is single-user ownership. If orgs/teams come, Clerk Organizations maps cleanly onto an `organization_id` FK across relevant entities; `ShareToken` already supports the snapshot pattern teams will need.
- **Observability**: PostHog covers LLM + product analytics. Still pending: Micrometer metrics, structured JSON logs with correlation IDs, error tracking (Sentry-class tool).
- **Distributed rate limiting**: today's `AiRateLimitFilter` is in-memory; swap to a Redis-backed bucket once we scale beyond a single instance.
- **Stripe direct integration**: lives on `feature/stripe`. The hook is the existing `webhook/` package and `SubscriptionService.assertCanCreateReport()` — Stripe wiring just needs to fire `UserService.updateSubscription(...)` the same way Clerk Billing already does today.
