# Development Roadmap

The MVP is divided into 4 milestones. Each can be worked, reviewed, and merged independently.

---

## M1 — Backend foundation ✅ (completed)

Goal: a production-quality backend skeleton ready to plug a frontend into.

### Deliverables

- [x] Package-by-feature structure (`auth/`, `user/`, `report/`, `ai/`, `common/`)
- [x] UUID-based entities with auditing (`createdAt`, `updatedAt`)
- [x] Flyway migrations — schema under source control
- [x] JWT authentication with custom filter + `@CurrentUser` support
- [x] Global exception handling with normalized `ApiError` response
- [x] Bean Validation on all DTOs
- [x] CORS configurable via env var
- [x] Reports CRUD endpoints (`/api/reports/**`)
- [x] Claude proxy endpoints (`/api/ai/**`) — API key server-side only
- [x] OpenAPI / Swagger UI at `/swagger-ui.html`
- [x] Testcontainers-ready test setup
- [x] Docker Compose with Postgres + backend

### Out of scope (deferred)

- Email verification → deferred (needs SMTP setup)
- Refresh tokens → deferred (24h access token is enough for MVP)
- Rate limiting → deferred to M4
- Full test coverage → only smoke tests for now; per-endpoint tests grow as features stabilise

---

## M2 — Frontend (React + i18n)

Goal: replace the vanilla-JS prototype in `frontend/` with a production React app that consumes the backend API.

### Stack decided
Vite · React 18 · TypeScript · React Router v6 · Axios · TanStack Query v5 · i18next · html2pdf.js · pptxgenjs · CSS variables (no CSS framework). See [ARCHITECTURE.md](ARCHITECTURE.md) for full rationale.

### Deliverables

- [x] Scaffold: Vite + React 18 + TypeScript + ESLint + Prettier
- [x] Router: React Router v6 with protected routes (`ProtectedRoute` component)
- [x] HTTP layer: Axios instance with JWT injection and 401 → logout handler (`src/lib/api.ts`)
- [x] Data fetching: TanStack Query v5 configured (`src/lib/queryClient.ts`)
- [x] TypeScript types for all backend DTOs (`src/types/api.ts`)
- [x] Global design system: dark theme + accent dorado, fuentes DM Sans/DM Mono/Playfair Display (`src/index.css`)
- [x] Auth hooks: `useLogin`, `useRegister`, `useCurrentUser`, `useLogout` (`src/hooks/useAuth.ts`)
- [x] Auth: JWT in memory + restore via `GET /api/users/me` on reload
- [x] Screens:
  - [x] `/login` — LoginPage with dark design system
  - [x] `/register` — RegisterPage with dark design system
  - [x] `/dashboard` — report list with status badges, empty state, delete
  - [x] `/reports/new` — 3-step wizard (Empresa → STEEP → Horizon Scan)
  - [x] `/reports/:id` — tabbed result view (Escenarios 3P, señales débiles, wildcards, incertidumbres)
  - [x] `/account` — perfil (nombre, email, rol), preferencias (idioma), seguridad (cambio contraseña)
- [x] Frontend tests: Vitest + React Testing Library — 41 tests (auth, protected routes, dashboard, report hooks, account)
- [x] i18n: i18next con catálogos ES/EN — dashboard y account traducidos; arquitectura lista para extender al resto de pantallas
- [ ] Export: port `html2pdf.js` + `pptxgenjs` from the prototype
- [ ] Loading / error states across all screens

### Done when

A user can register, log in, create a report through the wizard, see the AI-generated result, and download PDF + PPTX.

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

- [ ] Rate limiting on `/api/ai/**` (bucket4j, per-user)
- [ ] Structured JSON logging with correlation IDs
- [ ] Micrometer metrics + `/actuator/prometheus`
- [ ] Full integration test suite (auth, reports, billing flows)
- [ ] Production Dockerfile optimisations (layered JAR, smaller base)
- [ ] CI pipeline (GitHub Actions): test, build, push image
- [ ] Deployment (Railway / Fly.io / VPS — to decide)
- [ ] Domain + HTTPS
- [ ] Error tracking (Sentry or similar)
- [ ] Basic admin endpoints for observability
- [ ] Privacy policy / terms of service pages
- [ ] Email delivery (transactional emails for signup, password reset, subscription events)

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
