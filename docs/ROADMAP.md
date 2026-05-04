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

## M3 — Payments (Stripe)

Goal: gate AI functionality behind a paid subscription (with trial).

### Deliverables

- [ ] New entities: `SubscriptionPlan`, `Subscription`, `PaymentEvent`
- [ ] Flyway migration for billing tables
- [ ] Plans seeded (e.g. Starter / Pro / Enterprise)
- [ ] `POST /api/billing/checkout-session` — create Stripe Checkout session
- [ ] `POST /api/billing/webhook` — handle `customer.subscription.*` events
- [ ] `GET /api/billing/status` — current user's plan + status
- [ ] 14-day free trial on signup (no credit card required)
- [ ] Subscription gate middleware: block `/api/ai/**` if user is not on an active plan or trial
- [ ] Frontend screens: `/pricing`, `/account/billing`, post-checkout success page
- [ ] Stripe test-mode keys in `.env.example`, local webhook setup via Stripe CLI

### Done when

A new user can sign up → use the product free for 14 days → be prompted to subscribe → complete checkout → regain access to AI features. Billing state survives reloads and is the source of truth for access.

---

## M4 — Polish, hardening, deploy

Goal: ship to production.

### Deliverables

- [x] Rate limiting on `/api/ai/**` (Bucket4j, per-user) — landed early in M1
- [ ] Structured JSON logging with correlation IDs
- [ ] Micrometer metrics + `/actuator/prometheus`
- [ ] Full integration test suite (reports, webhook, billing flows)
- [ ] Production Dockerfile optimisations (layered JAR, smaller base)
- [ ] CI pipeline (GitHub Actions): test, build, push image
- [ ] Deployment (Railway / Fly.io / VPS — to decide)
- [ ] Domain + HTTPS, including a Clerk **production** instance bound to a custom domain (`clerk.<yourdomain>`) with its own webhook signing secret
- [ ] Error tracking (Sentry or similar)
- [ ] Basic admin endpoints for observability
- [ ] Privacy policy / terms of service pages
- [ ] Transactional emails for billing events (signup / password-reset emails are already handled by Clerk)

### Done when

The product is publicly reachable at a domain, users can sign up and pay, and we can observe and debug production traffic.

---

## Out of MVP scope (future)

These are intentionally **not** in the MVP but are worth noting so we don't build ourselves into a corner:

- **Multi-user organisations / teams** — sharing reports across users
- **Report versioning** — track edits over time
- **Server-side PDF/PPTX generation** — as a fallback if client-side gets too heavy for large reports
- **Streaming AI responses** — show Claude's output progressively as it arrives
- **Alternative LLM providers** — swap Claude for OpenAI/Gemini if needed
- **Fine-grained roles & permissions** — beyond USER/ADMIN
- **Mobile app**

If any of these becomes a hard requirement mid-way, we'll slot them into the relevant milestone rather than tacking them on at the end.
