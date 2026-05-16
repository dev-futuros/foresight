# Development Roadmap

The MVP is divided into 4 milestones. Each can be worked, reviewed, and merged independently.

---

## M1 — Backend foundation ✅ (completed)

Goal: a production-quality backend skeleton ready to plug a frontend into.

### Deliverables

- [x] Package-by-feature structure (`user/`, `report/`, `ai/`, `webhook/`, `common/`)
- [x] UUID-based entities with auditing (`createdAt`, `updatedAt`)
- [x] Flyway migrations — schema under source control (V1–V4)
- [x] Authentication delegated to Clerk: backend validates session JWTs against Clerk's JWKS, no passwords stored locally
- [x] `JwtAuthFilter` + `@CurrentUser` resolves the local row by `clerk_user_id`, lazy-creates on first authenticated request
- [x] Clerk webhook receiver (`POST /api/webhooks/clerk`) with Svix HMAC verification — keeps the local `users` row in sync on `user.created` / `user.updated` / `user.deleted`
- [x] Global exception handling with normalized `ApiError` response
- [x] Bean Validation on all DTOs
- [x] CORS configurable via env var
- [x] Reports CRUD endpoints (`/api/reports/**`)
- [x] Claude proxy endpoints (`/api/ai/**`) — API key server-side only
- [x] Per-user rate limiting on `/api/ai/**` (Bucket4j, 100 calls/h/user, configurable)
- [x] OpenAPI / Swagger UI at `/swagger-ui.html`
- [x] Testcontainers-ready test setup
- [x] Docker Compose with Postgres + backend

### Migrated away from
The first iteration of M1 had a custom JWT auth stack (`/api/auth/login`, `/api/auth/register`, password reset / email verification tokens, refresh-token plumbing). All of that was replaced by Clerk in May 2026 — see [CHANGELOG.md](CHANGELOG.md). The legacy `tokens` / `auth_tokens` tables and the `password` / `email_verified` columns on `users` were dropped in `V3__clerk_auth.sql`; the `email` column itself was dropped in `V4__fix_user_constraints_for_clerk.sql` once the frontend learned to read it from `useUser()`.

### Out of scope (deferred)

- Full integration test coverage → smoke tests only; per-endpoint tests grow as features stabilise
- Distributed (Redis-backed) rate limiting → deferred until we run more than one backend instance

---

## M2 — Frontend (React + i18n) ✅ (completed)

Goal: replace the vanilla-JS prototype in `frontend/` with a production React app that consumes the backend API.

### Stack decided
Vite · React 19 · TypeScript · React Router v7 · Axios · TanStack Query v5 · i18next · jsPDF · pptxgenjs · CSS variables (no CSS framework). See [ARCHITECTURE.md](ARCHITECTURE.md) for full rationale.

### Deliverables

- [x] Scaffold: Vite + React 19 + TypeScript + ESLint
- [x] Router: React Router v7 with `ProtectedRoute` (Clerk-aware)
- [x] HTTP layer: Axios instance with async Clerk-JWT injection (`src/lib/api.ts` + `<AuthBridge>`)
- [x] Backend `ApiError` → user-facing message helper (`src/lib/apiError.ts`)
- [x] Data fetching: TanStack Query v5 configured (`src/lib/queryClient.ts`)
- [x] TypeScript types for all backend DTOs (`src/types/api.ts`)
- [x] Global design system: dark theme + accent dorado, fuentes DM Sans/DM Mono/Playfair Display (`src/index.css`)
- [x] Auth integration: `@clerk/react@6` (`<ClerkProvider>`, `<SignIn />`, `<SignUp />`, `<UserButton />`)
- [x] Auth hooks: `useCurrentUser` (gated by `isLoaded && isSignedIn`), `useLogout` (delegates to `useClerk().signOut`)
- [x] Screens:
  - [x] `/sign-in/*` and `/sign-up/*` — Clerk's prebuilt components (no custom forms to maintain)
  - [x] `/dashboard` — report list with status badges, empty state, delete, retry on error
  - [x] `/reports/new` — 3-step wizard (Empresa → STEEP → Horizon Scan), fully i18n
  - [x] `/reports/:id` — tabbed result view (Escenarios 3P, señales débiles, wildcards, incertidumbres) with retry on error
  - [x] `/account` — perfil (nombre + idioma local; email/password/MFA via `<UserButton />`)
- [x] Frontend tests: Vitest + React Testing Library
- [x] i18n: i18next con catálogos ES/EN — todas las pantallas traducidas (dashboard, wizard, report, account)
- [x] Export: jsPDF + pptxgenjs (`src/lib/exportPdf.ts`, `src/lib/exportPpt.ts`)
- [x] Loading / error states across all screens (loading text + error with retry)

### Done when

A user can sign up via Clerk, create a report through the wizard, see the AI-generated result, and download PDF + PPTX.

---

## M3 — Payments 🚧 (in progress)

Goal: gate paid functionality behind an active subscription.

The shape changed during execution: rather than implementing Stripe directly, the gate is wired against **Clerk Billing**, which sits in front of Stripe and handles checkout + customer portal UI. The Stripe direct-integration branch (`feature/stripe`) is parallel work for environments where Clerk Billing isn't an option.

### Landed on `develop`

- [x] `subscription/` package: `SubscriptionService`, `SubscriptionPlan`, `SubscriptionStatus`, `SubscriptionRequiredException` (402), `ReportLimitExceededException` (429)
- [x] `V5__subscription.sql`: `users.subscription_plan` + `subscription_current_period_start/end`, CHECK constraint on plan whitelist, composite index on `(user_id, created_at DESC)` for period-window counting
- [x] Gate on `POST /api/reports` — enforces plan + period quota (10 reports / period on `FUTUROS_PLATAFORMA`), returns enriched 429 body (`limit`, `used`, `periodEnd`)
- [x] `UserRole.DEV` bypass for the internal team (promotion by direct SQL only)
- [x] Clerk Billing mirror through `/api/webhooks/clerk` — plan + period bounds updated as Clerk reports them
- [x] Frontend `useSubscription` hook surfacing current plan, usage, period bounds
- [x] Paywall UI states (banner when quota exhausted, lock when no plan / period expired)

### In flight on `feature/stripe`

- [ ] `POST /api/billing/checkout-session` — Stripe Checkout session create
- [ ] `POST /api/billing/webhook` — handle `customer.subscription.*` events (signature-verified)
- [ ] `GET /api/billing/status` — explicit endpoint for plan + status (today the status is bundled into user-context responses)
- [ ] 14-day free trial on signup (no credit card required)
- [ ] Frontend screens: `/pricing`, `/account/billing`, post-checkout success page
- [ ] Stripe test-mode keys in `.env.example`, local webhook setup via Stripe CLI

### Done when

A new user can sign up → start a trial → be prompted to subscribe → complete checkout → continue using paid features. Billing state survives reloads and is the source of truth for access. The gating is already live; the open work is the direct-Stripe path for the deploy targets where Clerk Billing isn't used.

---

## M4 — Polish, hardening, deploy 🚧 (partially landed)

Goal: ship to production.

### Already landed

- [x] Rate limiting on `/api/ai/**` (Bucket4j, per-user) — landed early in M1
- [x] LLM observability via PostHog (`$ai_generation` events server-side, `posthog-js` in the browser, shared distinct id by Clerk user id)
- [x] Privacy page (`/privacy`) and cookie consent overlay (`CookieConsent`, gates analytics until accepted)
- [x] Production frontend image: multi-stage `Dockerfile.prod` (Node 20 build → Caddy 2 alpine serve) with SPA fallback in `Caddyfile`
- [x] Static asset cache policy (`/assets/*` 1y, `index.html` / `share-snapshot.html` no-cache)

### Still open

- [ ] Structured JSON logging with correlation IDs
- [ ] Micrometer metrics + `/actuator/prometheus`
- [ ] Full integration test suite (reports, webhook, billing flows)
- [ ] Production backend Dockerfile optimisations (layered JAR, smaller base)
- [ ] CI pipeline (GitHub Actions): test, build, push image
- [ ] Deployment target (Railway / Fly.io / VPS — to decide)
- [ ] Domain + HTTPS, including a Clerk **production** instance bound to a custom domain (`clerk.<yourdomain>`) with its own webhook signing secret
- [ ] Error tracking (Sentry or similar)
- [ ] Basic admin endpoints for observability
- [ ] Terms of service page (privacy is done)
- [ ] Transactional emails for billing events (signup / password-reset emails are already handled by Clerk)

### Done when

The product is publicly reachable at a domain, users can sign up and pay, and we can observe and debug production traffic.

---

## Shipped beyond the M1–M4 plan

These features weren't part of the original linear roadmap but landed because the product needed them. They're called out here so the milestone view stays honest:

- **Public share tokens** (multilingual) — `share/` package + V6/V9/V10 migrations + `vite.snapshot.config.ts` single-file build. Lets users hand a client a self-contained HTML report without exposing app access. See [ARCHITECTURE.md → Share tokens](ARCHITECTURE.md#share-tokens-public-snapshots).
- **Examples** (DEV-curated report templates) — `example/` package + V8. Read-only snapshots that show new users what a finished analysis looks like; promoted/demoted by the team via DEV-only endpoints.
- **Chat assistant with tool use** — `AssistantTools.java` + `features/chat/` + `commandBus.ts`. Stateless agent with 15 frontend tools (navigation, wizard control, generation). Stitched USER STATE snapshot replaces a RAG layer.
- **Phased streaming analysis pipeline** — 8 SSE endpoints (`/api/ai/analyze/*` + `/api/ai/global-steep-*`) replacing the single legacy `/api/ai/analyze` call. The legacy endpoint stays for backwards compatibility.
- **Report translations** (V7) + **example translations** (V8) + **share token translations** (V10) — on-demand Claude translation cached per-language at every level of the share chain.
- **PDF export with light/dark themes + AI-assisted "tighten" cache** (V11) — `lib/exportPdf.ts` + `lib/pdfFit.ts` + `POST /api/ai/tighten` + the `pdf_optimized` JSONB column. Multi-page editorial layout generated entirely client-side.
- **PowerPoint export** — `lib/exportPpt.ts`. Editable slide deck, dark theme with gold accent.
- **HTML export** — `lib/exportHtml.tsx` reuses the share-snapshot build to produce a stand-alone offline report.
- **Per-tier model selection** — `foresight.ai.anthropic.models.{haiku,sonnet,opus}` so cost/quality trade-offs are tunable per environment without code changes.
- **PostHog LLM observability** — `LlmCapture` wraps every Anthropic call with `$ai_generation` events (tokens, latency, citations, errors, stop reason). Default-off, fail-fast on misconfig.

These are all production code today, not experiments — they're treated as such by the rest of the docs (ARCHITECTURE / API / CHANGELOG).

---

## Out of MVP scope (future)

These are intentionally **not** in the MVP but are worth noting so we don't build ourselves into a corner:

- **Multi-user organisations / teams** — sharing reports inside an org (note: public share tokens already cover one-off sharing with clients). Maps cleanly onto Clerk Organizations when needed.
- **Report versioning** — track edits over time.
- **Server-side PDF/PPTX generation** — as a fallback if client-side gets too heavy for large reports.
- **Alternative LLM providers** — swap Claude for OpenAI/Gemini if needed.
- **Fine-grained roles & permissions** — beyond `USER` / `DEV` / `ADMIN`.
- **Mobile app**.

If any of these becomes a hard requirement mid-way, we'll slot them into the relevant milestone rather than tacking them on at the end.

> Note: **streaming AI responses** was on this list and has since landed — see "Shipped beyond the M1–M4 plan" above.
