# Migration: Clerk → Kinde

Working checklist for the Clerk-to-Kinde swap on `feature/kinde`. Source of truth for the in-progress migration; **archive or delete this file once the cutover lands on `develop`**.

## Why we're migrating

Clerk Billing (the original plan for paid plans) doesn't work for us in production:

- **USD-only billing currency** — incompatible with our €99/mes Pro plan.
- **No EU VAT handling** — Clerk says it's "planned, no timeline".
- **SCA / 3D Secure ambiguous** — Clerk's own FAQ says it doesn't support "additional factor authentication".
- **Beta status** — `Billing is currently in Beta and its APIs are experimental`.
- **Plans / subscriptions not synced to Stripe** — using Stripe Tax in the underlying Stripe account doesn't help, because Clerk creates subscriptions directly without going through Stripe Billing.

Kinde solves all of these (EUR + multi-currency, SCA via Stripe, GA, official Spring Boot SDK), and consolidates auth + billing in a single provider — same DX shape as Clerk, no migration debt to repay later.

The non-Kinde alternative considered was **Clerk for auth + Stripe directly for billing**. We picked Kinde over that because (a) we want a single vendor for both concerns, and (b) doing the migration pre-launch is cheaper than doing it after onboarding paying customers.

## Scope of this branch

**In scope:** auth migration only — replace every Clerk integration point with the equivalent Kinde one.

**Out of scope for now (deferred):**
- Stripe / Stripe Tax setup → done after auth is verified end-to-end.
- Pricing page (`<PricingTable />` from Kinde) → done with the billing slice.
- Plan creation in Kinde Dashboard (`futuros_plataforma` at 99 €/mes) → done with the billing slice.
- Subscription webhook events (`subscription.created` / `.updated` / `.canceled`) → handler is left as a no-op switch case for now.

While billing isn't wired, **the existing `SubscriptionService.assertCanCreateReport()` gate stays in place**. Newly-created users have `subscription_plan = null` so the gate would block all report creation. To unblock dev/test usage:

- Set the affected user's `role` to `DEV` in the database — the gate has an explicit `UserRole.DEV` bypass.
- Or activate the `local` Spring profile (`SPRING_PROFILES_ACTIVE=local`) which disables auth entirely and seeds a dev user with the right shape.

## Kinde Dashboard setup (manual, one-time)

| Step | Status | Notes |
|---|:---:|---|
| Create Kinde tenant | ✅ | `https://futuros.kinde.com` |
| Create Front-end SPA app `Futuros FE` | ✅ | Client ID `53f7019...d55e` (public) |
| Configure Allowed Callback URLs (5173 / 4173 / dev.futuros.io) | ✅ | One URL per line |
| Configure Allowed Logout URLs | ✅ | Same set without `/callback` |
| Set Application homepage URI to `https://futuros.io` | ✅ | Marketing site, where Kinde's logo-click lands |
| Set Application login URI to `https://dev.futuros.io/sign-in` | ⏳ | Falta corregir — pointed at futuros.io (no /sign-in route there) |
| Create M2M app `Futuros BE` | ✅ | Client ID `8b990f8...ab01` |
| Grant `read:users` scope on Kinde Management API to M2M app | ⏳ | Pending confirmation that scope was saved |
| Create webhook endpoint → `https://dev.futuros.io/api/webhooks/kinde` | ✅ | Single endpoint on free tier; dev-pointed for now |
| Subscribe webhook to `user.created` / `user.updated` / `user.deleted` | ⏳ | Confirm event list during setup |
| Enable email + password authentication method | ⏳ | Mínimo necesario para que auth funcione end-to-end |
| Configure social providers (Google, LinkedIn — matching Clerk's set) | ⏳ | Pending — non-blocking for first iteration |
| Branding (logo Futuros, palette #d4a853, fonts) | ⏳ | Non-blocking |
| Localization (ES + EN) | ⏳ | Non-blocking — Kinde defaults to EN |

## Code phases

### Phase 0 — Scaffold (this commit)

- [x] Branch `feature/kinde` created from `develop`
- [x] `.env.example` and `frontend/.env.example` updated with KINDE_* block (Clerk block kept until cutover)
- [x] `.env.local` and `frontend/.env.local` updated with real Kinde values
- [x] `docs/MIGRATION_CLERK_TO_KINDE.md` created (this file)
- [x] `docs/CHANGELOG.md` entry registering the migration start
- [ ] Initial commit on the branch

### Phase 1 — Backend: DB + entity rename ✅

- [x] `V12__rename_clerk_user_id_to_external.sql` — renames column + unique index
- [x] `User.java` — `@Column(name = "external_user_id")`, field `externalUserId`, class javadoc made provider-agnostic
- [x] `UserRepository.java` — `findByExternalUserId(...)`
- [x] `UserService.java` — renamed `findOrCreateByExternalUserId`, `upsertFromExternal`, `deleteByExternalUserId`; internal vars, log messages and constraint reference updated
- [x] `JwtAuthFilter.java` — local var renamed, call site updated, javadoc made provider-agnostic
- [x] `AuthenticatedUser.java` — field `externalUserId`
- [x] `DevPrincipal.java` — constant `EXTERNAL_USER_ID` (value preserved as `"user_local_dev"` so existing local DBs keep working)
- [x] `DevUserSeeder.java` — uses renamed constant + builder method, log message updated
- [x] `LlmCapture.java` — distinct-id resolver reads `user.externalUserId()` instead of `clerkUserId()`
- [x] `UserResponse.java` (DTO) — javadoc updated; no `clerk` references leak in the wire shape
- [x] `ClerkWebhookController.java` — call sites updated to new service method names (controller class itself stays — replaced in Phase 3)
- [x] `UserServiceTest.java` — builder call uses `externalUserId(...)`, all tests pass
- [x] `./mvnw compile` and `./mvnw test-compile` both green; `UserServiceTest` passes

**Files intentionally left untouched in this phase (deleted/replaced in Phase 2/3):**

- `ClerkBackendClient.java` — `fetchUser(String clerkUserId)` param name kept for now; class is replaced wholesale by `KindeBackendClient` in Phase 2
- `ClerkEvent.java` — record field `clerkUserId` kept; record is replaced by `KindeEvent` in Phase 3
- `ClerkEventParser.java` — local var kept; file deleted in Phase 3 along with `ClerkWebhookController`

### Phase 2 — Backend: auth filter + decoder

- [ ] Replace `ClerkJwtDecoderConfig` → `KindeJwtDecoderConfig` (same Nimbus pattern, Kinde issuer + JWKS)
- [ ] Replace `ClerkBackendClient` → `KindeBackendClient` (OAuth2 client_credentials + Management API `/api/v1/user`)
- [ ] Adapt `JwtAuthFilter` — same lazy-create + concurrency + dev fallback; just consumes Kinde JWT now
- [ ] Update `SecurityProperties.Clerk` → `SecurityProperties.Kinde` (drop `webhookSigningSecret` + `secretKey` + `apiBaseUrl`, add `m2mClientId` + `m2mClientSecret` + `tokenEndpoint` + `managementApiBaseUrl`)
- [ ] Update `application.properties` and per-profile files (`foresight.security.clerk.*` → `foresight.security.kinde.*`)
- [ ] Add `com.kinde.spring:kinde-springboot-starter` to `pom.xml` if helpful (or stick with manual nimbus)
- [ ] Drop `com.svix:svix` dependency from `pom.xml` (no longer needed)
- [ ] `JwtAuthFilter` unit tests updated with Kinde-shaped JWTs

### Phase 3 — Backend: webhook receiver

- [ ] Replace `ClerkWebhookController` → `KindeWebhookController`
  - Body is the JWT itself (not JSON + signature header)
  - Verify using the same `kindeJwtDecoder` bean — no separate HMAC verifier
  - Extract `type` claim, dispatch on `user.created` / `user.updated` / `user.deleted`
  - Leave `subscription.*` cases stubbed for billing phase
- [ ] Update `SecurityConfig` — `permitAll` path `/api/webhooks/clerk` → `/api/webhooks/kinde`
- [ ] Delete `ClerkEvent` + `ClerkEventParser`, create `KindeEvent` if a flat projection helps
- [ ] Integration test for the new webhook controller

### Phase 4 — Frontend: provider + routing

- [ ] `npm install @kinde-oss/kinde-auth-react`
- [ ] `npm uninstall @clerk/react`
- [ ] `main.tsx` — check `VITE_KINDE_*` env vars instead of `VITE_CLERK_*`
- [ ] `App.tsx` — `<KindeProvider>` config; replace `/sign-in/*` and `/sign-up/*` route content with `LoginLink` / `RegisterLink` triggers; add `/callback` route
- [ ] `AuthBridge.tsx` — `useKindeAuth().getToken()`; PostHog `identify` with Kinde user id
- [ ] `ProtectedRoute.tsx` — `useKindeAuth().isAuthenticated / isLoading`
- [ ] `useAuth.ts` — `useCurrentUser` gated by Kinde auth state; `useLogout` calls Kinde's logout
- [ ] `useSubscription.ts` — temporarily reads from backend `/api/users/me` (subscription state still null until billing phase)

### Phase 5 — Frontend: cleanup + account page

- [ ] **DELETE** `features/auth/AuthLayout.tsx` (no embedded form to wrap)
- [ ] **DELETE** `features/auth/clerkAppearance.ts`
- [ ] **DELETE** `features/auth/clerkLocalization.ts`
- [ ] **DELETE** `features/account/AppUserButton.tsx`
- [ ] **DELETE** `features/account/ClerkPreferencesPage.tsx`
- [ ] **DELETE** `features/account/userButtonAppearance.ts`
- [ ] Clean `cl-*` selectors out of `features/auth/auth.css` and `features/account/account.css`
- [ ] Create `features/account/AccountPage.tsx` — standalone page hosting Preferences (language picker, role read-only)
- [ ] Route `/account` in `App.tsx`
- [ ] Update `TopBar` — replace `<AppUserButton />` with avatar + dropdown that links to `/account` + "Manage account" → `<PortalLink>` (Kinde hosted portal)

### Phase 6 — Tests + docs + smoke

- [ ] All existing tests pass (`./mvnw verify` + `npm test`)
- [ ] Smoke E2E manual:
  - [ ] Sign-up new user → user row created in DB on first authenticated request (lazy-create)
  - [ ] Sign-in existing user → lazy-create doesn't fire again
  - [ ] Webhook delivery from Kinde sandbox → row sync confirmed
  - [ ] Sign-out → redirects to landing
  - [ ] Local dev profile (`auth-disabled=true`) → dev user still seeded, endpoints reachable from Swagger
  - [ ] Subscription gate still blocks non-DEV users (expected — billing not wired yet)
- [ ] Update `README.md` — replace Clerk-specific section with Kinde-specific section
- [ ] Update `docs/ARCHITECTURE.md` — auth section, env var table, migrations table includes V12
- [ ] Update `docs/API.md` — webhook path, no more `clerk_user_id` in any DTO
- [ ] Update `docs/CHANGELOG.md` — `[Unreleased]` block summarising the migration
- [ ] Remove Clerk vars from `.env.example` and `frontend/.env.example` (final cleanup)
- [ ] Remove this MIGRATION doc (or archive under `docs/archive/`)

## Gotchas worth remembering

- **Kinde webhooks are JWT-signed, not HMAC.** No `KINDE_WEBHOOK_SIGNING_SECRET` exists. The webhook body **is** the JWT — decode with the same `JwtDecoder` bean used for session JWTs.
- **Free tier limits us to 1 webhook endpoint.** Currently pointed at `dev.futuros.io`. Local dev relies on either (a) unit tests with forged JWTs, (b) deploying to dev, or (c) temporarily editing the webhook URL to an ngrok tunnel.
- **The SPA app has no client secret.** Don't try to find it — it doesn't exist. The Client ID is the only credential needed in the browser.
- **The M2M app uses OAuth2 `client_credentials` flow.** `KindeBackendClient` must POST to `KINDE_TOKEN_ENDPOINT` with `grant_type=client_credentials` to get a Bearer token, then attach that token to Management API calls. Cache the token until `exp`.
- **Kinde JWT `sub` claim format** is `kp_<random>` (e.g. `kp_abc123...`), not the Clerk `user_<random>` shape. We rename the column to `external_user_id` so the schema is provider-agnostic going forward.
- **Auth-disabled local profile must keep working.** The `DevPrincipal` constant is just a string — keep it stable to avoid breaking existing dev DBs.
- **No `name` claim in Kinde session JWTs by default.** Like Clerk, we need to call the Management API (`GET /api/v1/user?id=...`) from `KindeBackendClient` on lazy-create. The fallback chain stays the same: Backend API → JWT claims → null.
