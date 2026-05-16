# Migration: Clerk → Kinde

**Status: COMPLETED** ✅ on `feature/kinde`, 2026-05-16. Merge to `develop` pending.

This document records what was migrated and why, so future maintainers can understand the auth choices without spelunking through commit history. **Archive or delete after one or two release cycles** — the canonical references for the resulting architecture are `docs/ARCHITECTURE.md` (auth flow) and `README.md` (Kinde setup).

## Decision

We migrated from **Clerk** (auth + Clerk Billing) to **Kinde** (auth) + **Stripe directly** (billing — pending) because Clerk Billing turned out to be unviable for an EU SaaS:

| Blocker | Clerk Billing | Kinde |
|---|---|---|
| Billing currency | USD-only (per their docs) | EUR + 130+ currencies |
| EU VAT / IVA | "Planned, no timeline" | Handled via Stripe Tax on the underlying Stripe account |
| SCA / 3D Secure | FAQ says "additional factor authentication not currently supported" | Inherits Stripe's native 3DS support |
| GA status | Beta — APIs experimental | GA |
| Plans synced to Stripe Billing | No — Clerk creates subs directly | Yes (Kinde uses Stripe under the hood) |
| Spring Boot SDK | None — vanilla nimbus/OAuth2 wiring by hand | Official `com.kinde.spring:kinde-springboot-starter` (we did NOT adopt it — kept vanilla nimbus to minimise churn, but it exists) |

The non-Kinde alternative considered was **Clerk for auth + Stripe directly for billing**. We picked Kinde because (a) consolidating auth + billing in one vendor cuts integration surface, and (b) doing the migration pre-launch is far cheaper than after onboarding paying customers.

The boss separately decided we'd be Merchant of Record ourselves (via an individual autónomo registered in Spain) rather than using a third-party MoR like Paddle. That decision is independent of Kinde vs Clerk — see `memory/foresight_auth_billing_decision.md` for the rationale.

## What landed

### Backend

- **New**: `KindeJwtDecoderConfig` (Nimbus `JwtDecoder` bean keyed on Kinde JWKS), `KindeBackendClient` (OAuth2 `client_credentials` token flow + Management API GET/PATCH user), `KindeWebhookController` (JWT-verified webhook receiver — no HMAC, no Svix).
- **Migration V12**: renamed `users.clerk_user_id` → `users.external_user_id` (lexical only; column type/values unchanged). Provider-agnostic schema going forward.
- **Refactored**: `User`, `UserRepository`, `UserService`, `AuthenticatedUser`, `DevPrincipal`, `DevUserSeeder`, `LlmCapture` — every reference to `clerkUserId` is now `externalUserId`. `UserService` exposes `findOrCreateByExternalUserId`, `upsertFromExternal`, `deleteByExternalUserId`.
- **`UserService.updateProfile`** now pushes name changes to Kinde via the Management API **before** persisting locally. Kinde is source of truth — a failure there surfaces as a 500 to the frontend rather than silently letting the next webhook overwrite the local edit. DEV synthetic users skip the Kinde push (no real Kinde counterpart).
- **`SecurityProperties.Kinde`** record with 7 fields. The legacy `Clerk` record + the `foresight.security.clerk.*` block in `application.properties` are gone.
- **Deleted**: `ClerkJwtDecoderConfig`, `ClerkBackendClient`, `ClerkWebhookController`, `ClerkEvent`, `ClerkEventParser`, `JwtConfig` (dead duplicate of the old Clerk decoder), `com.svix:svix` dependency in `pom.xml`.
- **`docker-compose-backend.yml`** updated: `CLERK_*` env mappings removed, `KINDE_*` added (`KINDE_DOMAIN`, `KINDE_ISSUER`, `KINDE_JWKS_URI`, `KINDE_TOKEN_ENDPOINT`, `KINDE_MANAGEMENT_API_BASE_URL`, `KINDE_M2M_CLIENT_ID`, `KINDE_M2M_CLIENT_SECRET`). **No `KINDE_WEBHOOK_SIGNING_SECRET`** — Kinde signs webhooks with JWT, validated against the same JWKS as session tokens.

### Frontend

- **Swapped dependency**: `@clerk/react` → `@kinde-oss/kinde-auth-react`. Components live under the `/components` subpath import (`LoginLink`, `RegisterLink`, `PortalLink`).
- **`KindeProvider`** in `main.tsx` + `App.tsx`, reading from `VITE_KINDE_DOMAIN`, `VITE_KINDE_CLIENT_ID`, `VITE_KINDE_REDIRECT_URI`, `VITE_KINDE_LOGOUT_REDIRECT_URI`.
- **Routes**: `/sign-in/*` and `/sign-up/*` render `<AuthLayout>` with a single "Continue →" `<LoginLink>` / `<RegisterLink>` that redirects to Kinde's hosted pages. New `/callback` route handles OAuth return. `/account` route was added then removed when we moved Account to a modal — see below.
- **`AccountModal`** (new): overlay opened from the topbar avatar button. Four sections in this order:
  1. **Perfil** — editable display name (pushed to Kinde) + readonly role.
  2. **Gestionar cuenta** — `<PortalLink>` to Kinde's hosted account portal for email / password / MFA / sessions.
  3. **Preferencias** — UI language picker.
  4. **Cerrar sesión** — calls `useKindeAuth().logout()`.

  Built on the existing `Modal` primitive (`components/Modal.tsx`). Small × close button top-right, ESC to close, backdrop click to close.
- **Hooks updated**: `useAuth.ts` (`useCurrentUser`, `useIsDev`, `useLogout`) reads from `useKindeAuth()`. `AuthBridge.tsx` and `ProtectedRoute.tsx` use Kinde's `isLoading`/`isAuthenticated`/`getToken`. `useAccount.useUpdateProfile` is unchanged — same `PATCH /api/users/me` endpoint, backend handles the Kinde sync.
- **Deleted**: `clerkAppearance.ts`, `clerkLocalization.ts`, `AppUserButton.tsx`, `ClerkPreferencesPage.tsx`, `userButtonAppearance.ts`, `AccountPage.tsx` (the standalone page that briefly existed before the modal).
- **i18n keys added**: `auth.{login,register}.continueWithKinde`, `account.manageAccount.{title,description,openPortal}`, `account.signOut.{title,description,button}`, `nav.account`.

### Kinde Dashboard setup (manual, one-time)

| Step | Done |
|---|:---:|
| Create tenant → `https://futuros.kinde.com` | ✅ |
| Create Front-end SPA app `Futuros FE` | ✅ |
| Allowed Callback URLs (`localhost:5173/callback`, `localhost:4173/callback`, `https://dev.futuros.io/callback`) | ✅ |
| Allowed Logout Redirect URLs (same set without `/callback`) | ✅ |
| Application homepage URI → `https://futuros.io` | ✅ |
| Application login URI → `https://dev.futuros.io/sign-in` | ✅ |
| Create M2M app `Futuros BE` | ✅ |
| Grant scopes on Management API: `read:users`, `update:users`, `delete:users` | ✅ |
| Create webhook endpoint → `https://dev.futuros.io/api/webhooks/kinde` subscribed to `user.created` / `user.updated` / `user.deleted` | ✅ |
| Enable email + password authentication method | ✅ |
| Enable social providers (Google et al.) — match the set used in Clerk | ✅ |
| Branding (logo + palette) | ⏳ deferred — non-blocking |
| Localization (ES + EN) | ⏳ deferred — Kinde defaults to EN, our app i18n is independent |

## Gotchas worth remembering

- **Kinde webhooks are JWT-signed, not HMAC.** No `KINDE_WEBHOOK_SIGNING_SECRET` exists — the webhook body **is** the JWT. Decode with the same `JwtDecoder` bean used for session JWTs. Saved us 50+ lines of HMAC verifier code.
- **Free tier limits us to 1 webhook endpoint.** Currently pointed at `dev.futuros.io/api/webhooks/kinde`. For local dev rely on (a) unit tests with forged JWTs, (b) deploying to dev, or (c) temporarily editing the webhook URL to an ngrok tunnel.
- **The SPA app has no client secret.** Don't try to find it — it doesn't exist. The Client ID is the only credential needed in the browser.
- **Auth-disabled local profile must keep working.** `DevPrincipal.EXTERNAL_USER_ID = "user_local_dev"` is preserved across the rename so existing local DBs keep working.
- **Kinde's user response field names are inconsistent across endpoints.** Sometimes `first_name`/`last_name`, sometimes `given_name`/`family_name`. We use `@JsonAlias` on `KindeUser` to accept both, and `KindeBackendClient.updateUser` sends all 4 keys in the PATCH body (Kinde ignores unknowns). Forward-safe against either convention shifting in the future.
- **Lazy-create's name resolution chain**: Kinde Management API (`KindeBackendClient.fetchUser`) → JWT claims (`name`, `given_name`) → `null`. Same defensive pattern as the old Clerk code.
- **`docker-compose-backend.yml` is the env passthrough**: env vars in `.env.local` only reach the container if they're explicitly listed in the compose file's `environment:` block. After Phase 2 we shipped without the `KINDE_*` mappings; result was `Kinde Backend API disabled — M2M client id/secret not set` and head-scratching. Fixed in the same branch — but the lesson is: compose's env block is the source of truth, not the dotenv file alone.
- **`./scripts/up.ps1 local --build`** is how the team brings the stack up. The `local` after `up.ps1` is the env file suffix (`.env.local`), NOT the Spring profile. The Spring profile lives inside the env file as `SPRING_PROFILES_ACTIVE=<profile>`. Don't conflate.

## Deferred — not part of this migration

- **Stripe billing endpoints** (`/api/billing/checkout-session`, `/api/billing/portal-session`, Stripe webhook handler). The subscription gate (`SubscriptionService.assertCanCreateReport()`) and the `users.subscription_plan` columns are still in place from the original M3 work; what's missing is the Stripe-side wiring. Lives on `feature/stripe` and is the next slice.
- **Subscription webhook events** (`subscription.*`) — `KindeWebhookController` has no-op cases for them. Wire when billing lands.
- **GDPR-cascade on account deletion** — `UserService.deleteAccount` only deletes locally. We have the `delete:users` scope granted in Kinde already, so adding `KindeBackendClient.deleteUser()` + calling it from `deleteAccount` is a small follow-up.
- **CSS cleanup** — dead `.cl-*` selectors in `features/auth/auth.css` and `features/account/account.css` are inert (no Clerk components left to target them) but still in the file. ~200 lines of dead CSS, low priority.
- **`DashboardPage.test.tsx`** has 2 failing assertions about empty-state copy that no longer exists. Pre-existing test debt, not auth-related, separately flagged.
- **`AiServiceTest`** has 5 failing prompt-substring assertions. Pre-existing test debt from prompt rewrites that didn't update tests. Separately flagged.

## How to roll back

If something catastrophic surfaces post-merge and Kinde has to come out:

1. Revert the merge commit on `develop`. The whole migration is one logical block — no in-between state to worry about.
2. Re-add the Clerk env vars to `.env.local` (the values are still in `git log`).
3. Local users who signed up via Kinde during the window have rows with `external_user_id` like `kp_xxx` instead of `user_xxx`. Those rows are orphaned in a Clerk-restored world — wipe them with `DELETE FROM users WHERE external_user_id LIKE 'kp_%';` and let users sign back in via Clerk to re-create.
4. The schema (V12 column rename) survives the rollback fine — Clerk-era code looked up by `clerk_user_id`, not by name. The column name is incidental at the application layer.

No actual rollback need is foreseen — this is just the contingency note.
