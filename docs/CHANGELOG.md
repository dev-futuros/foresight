# Changelog

All notable changes to this project are documented here.  
Format: `[version/milestone] — date — description`.

---

## [Unreleased — post-M2, M3 en curso]

Bloque consolidado de cambios que han aterrizado entre `2026-05-04` y hoy, agrupados por área. La pista en git está en `develop` (ver `git log` para fechas exactas por commit).

### 2026-05-16 (Migración Clerk → Kinde COMPLETADA — `feature/kinde`)

End-to-end migration de auth de Clerk a Kinde. Backend, frontend, env vars, docker-compose y docs actualizados. Billing (Stripe) sigue diferido para una iteración posterior. Resumen condensado abajo; el detalle completo (decisión, scope, setup Dashboard, gotchas, plan de rollback) vive en [docs/MIGRATION_CLERK_TO_KINDE.md](MIGRATION_CLERK_TO_KINDE.md) hasta que se archive tras 1-2 release cycles.

**Por qué migramos**: Clerk Billing tiene blockers críticos para EU (USD only, sin IVA EU, SCA dudoso, beta, planes no sincronizados con Stripe). Kinde los resuelve todos (EUR + 130 monedas, SCA via Stripe nativo, GA, SDK Spring Boot oficial). Decisión paralela del boss: somos MoR via autónomo en España (no Paddle).

**Backend**:
- **Nuevo**: `KindeJwtDecoderConfig` (Nimbus contra JWKS de Kinde), `KindeBackendClient` (OAuth2 `client_credentials` + Management API con token caching + 60s safety margin), `KindeWebhookController` (webhook body **es** un JWT — verifica con el mismo `JwtDecoder` bean, sin Svix, sin HMAC, sin secret separado).
- **Migración `V12__rename_clerk_user_id_to_external.sql`** — rename lexical de la columna y su índice único. Provider-agnóstico hacia adelante.
- **Refactor**: `User`, `UserRepository`, `UserService`, `AuthenticatedUser`, `DevPrincipal`, `DevUserSeeder`, `LlmCapture` — todas las menciones a `clerkUserId` ahora son `externalUserId`. Métodos del servicio renombrados (`findOrCreateByExternalUserId`, `upsertFromExternal`, `deleteByExternalUserId`).
- **`UserService.updateProfile`** ahora pushea cambios de nombre a Kinde via Management API **antes** de guardar local. Kinde es source of truth; una falla en su API surge como 500 al frontend en vez de divergencia silenciosa (el siguiente webhook sobrescribiría la edición local). DEV users skipean el push (no tienen counterpart en Kinde).
- **`SecurityProperties.Kinde`** record con 7 campos. La `Clerk` y el bloque `foresight.security.clerk.*` se eliminaron.
- **Borrado**: `ClerkJwtDecoderConfig`, `ClerkBackendClient`, `ClerkWebhookController`, `ClerkEvent`, `ClerkEventParser`, `JwtConfig` (duplicado muerto descubierto durante la migración), dependencia `com.svix:svix` del pom.
- **`docker-compose-backend.yml`**: env mappings `CLERK_*` → `KINDE_*`. **No `KINDE_WEBHOOK_SIGNING_SECRET`** — Kinde firma webhooks con JWT, mismo JWKS que para sesión.

**Frontend**:
- **Dependencia**: `@clerk/react` → `@kinde-oss/kinde-auth-react`. Componentes bajo el subpath `/components` (`LoginLink`, `RegisterLink`, `PortalLink`).
- **`KindeProvider`** en `main.tsx` + `App.tsx`. Variables `VITE_KINDE_DOMAIN`, `VITE_KINDE_CLIENT_ID`, `VITE_KINDE_REDIRECT_URI`, `VITE_KINDE_LOGOUT_REDIRECT_URI`.
- **Rutas**: `/sign-in/*` y `/sign-up/*` renderizan el `<AuthLayout>` (existente) con un único botón "Continue →" (`LoginLink` / `RegisterLink`) que redirige a Kinde hosted. Nueva ruta `/callback` que procesa el return del OAuth.
- **Nuevo `AccountModal`**: overlay del topbar avatar, con 4 secciones (Perfil con nombre editable inline + role readonly · Gestionar cuenta con `PortalLink` a portal hosted para email/password/MFA · Preferencias con idioma · Cerrar sesión). Botón × small top-right, ESC/backdrop cierran, reutiliza el primitivo `Modal`.
- **Hooks**: `useAuth` (`useCurrentUser` / `useIsDev` / `useLogout`) leen de `useKindeAuth()`. `AuthBridge` y `ProtectedRoute` adaptados. `getToken()` mapeado con `?? null` shim (Kinde devuelve `undefined`, axios espera `null`).
- **Borrado**: `AppUserButton.tsx`, `ClerkPreferencesPage.tsx`, `clerkAppearance.ts`, `clerkLocalization.ts`, `userButtonAppearance.ts`.
- **i18n** (es + en): añadidas keys `auth.{login,register}.continueWithKinde`, `account.manageAccount.*`, `account.signOut.*`, `nav.account`.

**Limitaciones que aceptamos**:
- **No embedded auth UI** — Kinde por diseño no permite sign-in form custom (impone su página hosted para garantizar SCA/PSD2). Se brandeará la página hosted via Kinde Dashboard.
- **Nombre editable inline, email/password/MFA via portal hosted** — son flows que Kinde solo expone via su portal hosted (verificación, factor extras).
- **Field naming inconsistente en Kinde Management API** (`first_name` vs `given_name`) — manejado defensivamente con `@JsonAlias` en `KindeUser` y enviando ambos formatos en `updateUser` PATCH. Kinde ignora unknowns.

**Diferido para iteración posterior**:
- Stripe billing endpoints (`/api/billing/*`), Stripe Tax wiring, pricing page.
- GDPR cascade en `DELETE /api/users/me` — el scope `delete:users` ya está concedido en el M2M; falta añadir `KindeBackendClient.deleteUser()` y llamarlo desde `UserService.deleteAccount`.
- CSS cleanup de selectores `.cl-*` muertos en `auth.css` / `account.css` (inertes pero ~200 líneas).

**Convención**: el equipo levanta el stack con `./scripts/up.ps1 <env> [--build]` (ej. `./scripts/up.ps1 local --build`). No usar `docker compose` directo — el script combina los dos compose files y pasa el `--env-file` correcto.

### M3 — Subscription gate (sin Stripe directo todavía)

- Nuevo paquete `subscription/`: `SubscriptionService`, `SubscriptionPlan`, `SubscriptionStatus`, `SubscriptionRequiredException` (HTTP 402), `ReportLimitExceededException` (HTTP 429 con `limit` / `used` / `periodEnd` en el body).
- Migración `V5__subscription.sql`: `users.subscription_plan` + `subscription_current_period_start/end`, CHECK constraint sobre la whitelist de planes (`FUTUROS_PLATAFORMA`), índice compuesto `(user_id, created_at DESC)` en `reports` para contar el periodo en O(log n).
- Gate en `POST /api/reports` — bloquea sin plan / fuera de periodo / con cuota agotada (10 informes / periodo).
- `UserRole.DEV` añadido al enum — bypass total del gate para el equipo, no asignable desde UI (sólo `UPDATE users SET role='DEV'` directo).
- ~~Mirror de Clerk Billing a través del receiver `/api/webhooks/clerk` existente — plan + bounds se sincronizan automáticamente.~~ **Superseded** por la migración Clerk → Kinde y la decisión de ir a Stripe directo: el mirror llegará vía un nuevo receiver `/api/webhooks/stripe` (en `feature/stripe`), no via Clerk.
- Frontend `useSubscription` + estados de paywall (banner cuando se llega al límite, lock cuando no hay plan / periodo expirado).
- Integración Stripe directa pendiente — vive en `feature/stripe`, no en `develop`.

### Pipeline de análisis fasificado (streaming SSE)

- Ocho endpoints nuevos sustituyendo la llamada monolítica `POST /api/ai/analyze` (que sigue vivo por compatibilidad):
  - `POST /api/ai/global-steep-scan` (sonnet + web_search), `POST /api/ai/global-steep-dim` (haiku) — Step 2 del wizard
  - `POST /api/ai/analyze/scan` (opus + web_search), `/api/ai/analyze/summary`, `/api/ai/analyze/scenarios`, `/api/ai/analyze/scenario-planning`, `/api/ai/analyze/strategic-map`, `/api/ai/analyze/backcasting` — secciones del informe final
  - `POST /api/ai/analyze/sources` — Mono no-stream que recoge citaciones
- Todos devuelven `Flux<JsonNode>` envuelto como `text/event-stream` con eventos `progress` (~5×/sec, con `chars` y `sources`) y `done` (terminal). Desconexión del cliente cancela la llamada Anthropic.
- Endpoints no-stream que aún llaman a IA (`/api/reports/{id}/translate`, `/api/reports/{id}/share`) devuelven `Callable<T>` y aprovechan `spring.mvc.async.request-timeout=480000ms` para no morir con `AsyncRequestTimeoutException`.
- Selección de modelo por tier vía `foresight.ai.anthropic.models.{haiku,sonnet,opus}` — tunable por entorno sin tocar código.
- Mejoras iterativas en los prompts globales y sectoriales (commits "Improving global and sectorial prompts", "Hardening against 500 errors and adding extra logging").

### Chat assistant con tool use

- `POST /api/ai/chat` y `POST /api/ai/chat/stream` — agente conversacional stateless (el frontend envía la historia completa cada turno). Modelo: sonnet.
- `AssistantTools.java` declara 15 tools que el modelo puede invocar para dirigir la UI: navegación (`goTo`, `openDashboard`, `closeDashboard`, `newReport`, `loadReport`), wizard (`wizardNext`, `wizardBack`, `setField`), informes (`editReport`, `deleteReport`, `refreshReports`), generación con confirmación (`generateGlobalSteep`, `runAnalysis`), locale (`setLang`).
- Frontend: `features/chat/` (`ChatAssistant`, `AssistantCommands`, `AssistantContextProvider`) + `lib/commandBus.ts` + `lib/useCommands.ts` + `lib/assistantBridge.ts` + `lib/buildAssistantSnapshot.ts` (serializa el bloque USER STATE que se cuela en el system prompt).
- Modales de confirmación para tools destructivos / caros.
- Fixes a workflows del assistant (commit "Fixes to assistant workflows").

### Public share tokens (multilingüe)

- Nuevo paquete `share/`: `ShareController`, `PublicShareController`, `ShareService`, `ShareToken`.
- Migraciones:
  - `V6__share_tokens.sql` — tabla `share_tokens` con `token` URL-safe, snapshot congelado (`title`, `input_data`, `result_data`), `expires_at` (default 7 días).
  - `V9__share_tokens_for_examples.sql` — soporte para examples: `report_id` nullable, `example_id` añadido, CHECK XOR.
  - `V10__share_token_translations.sql` — `translations` JSONB + `primary_language` en `share_tokens` (multilingual shares).
- `POST /api/reports/{id}/share?language=&languages=` mintea token; `POST /api/examples/{id}/share` para examples.
- `GET /api/public/share/{token}` — sin auth, devuelve snapshot + traducciones cacheadas en el momento del mint. 404 silencioso si expirado o desconocido.
- Frontend: `features/publicShare/PublicSharePage.tsx` + `ShareView.tsx` (mismo body que `ReportPage`).
- Build dual de Vite: `vite.snapshot.config.ts` + `share-snapshot.html` + `src/share-snapshot.tsx` → single-file HTML auto-contenido vía `vite-plugin-singlefile` (el "Informe cliente digital" del landing).
- `lib/exportHtml.tsx` reusa el snapshot para exportar el informe offline.

### Examples (snapshots curados por el equipo)

- Nuevo paquete `example/`: `Example`, `ExampleController`, `ExampleService`, `ExampleRepository`, DTOs.
- Migración `V8__examples.sql` — tabla `examples` con `slug` único (upsert key), `title`, `description`, `primary_language`, `input_data`, `result_data`, `translations`.
- Endpoints (todos `/api/examples/*`):
  - `GET /api/examples`, `GET /api/examples/{id}` — open a todos los usuarios autenticados.
  - `POST /api/reports/{reportId}/promote-to-example` (DEV only) — upsert por slug.
  - `DELETE /api/examples/{id}` (DEV).
  - `POST /api/examples/{id}/translate` + `/translate/stream` + `DELETE /api/examples/{id}/translations/{language}` (DEV para los cache-cold; lecturas open).
  - `POST /api/examples/{id}/demote` (DEV) — convierte el example en un report privado del que llama.
  - `POST /api/examples/{id}/share` — cualquier usuario autenticado puede compartir.

### Traducciones de informes (server-side)

- Migración `V7__report_translations.sql` — añade `translations` JSONB (`{ "<lang>": {inputData, resultData, generatedAt} }`) y `primary_language` a `reports`.
- `POST /api/reports/{id}/translate?targetLanguage=&force=` (Callable) y `/translate/stream` (SSE) — Claude traduce el informe completo, cacheado en el row.
- `DELETE /api/reports/{id}/translations/{language}` — evicción puntual.
- Traducción paralelizable (commits "Parallelizing translation", "Allow for parallel translation of reports").
- Frontend: dashboard de traducciones por informe + toggle de idioma en `ReportPage`.
- Fix de detección del idioma primario (commit "Fixing primary language of reports").

### Export PDF profesional (AI-assisted)

- `lib/exportPdf.ts` — generación multi-página con jsPDF, temas light/dark, portada y contraportada.
- `lib/pdfFit.ts` — layout engine que mide overflow y pide a `POST /api/ai/tighten` que acorte los bloques que no caben.
- `POST /api/ai/tighten` (haiku) — devuelve una versión más corta de un bloque de prosa.
- Migración `V11__report_pdf_optimized.sql` — añade `pdf_optimized` JSONB a `reports` (`{ "<lang>": {version, generatedAt, fields: {"<dotted.path>": "..."}} }`).
- `PUT /api/reports/{id}/pdf-optimized/{language}` — escribe la cache de campos tightened.

### Export HTML / PPT

- `lib/exportPpt.ts` — slides editables con pptxgenjs, tema oscuro con acento dorado.
- `lib/exportHtml.tsx` — descarga el snapshot single-file con el payload del informe spliced.

### PostHog LLM observability

- Nuevo paquete `analytics/`: `LlmCapture`, `LlmCaptureContext`, `PostHogConfig`, `AnalyticsProperties`.
- `LlmCapture.capture()` invocado desde `AiService` tras cada llamada Anthropic — emite `$ai_generation` con el esquema canónico (model, tokens, latency, citations, stop_reason, error, tools, cache hit/miss).
- Distinct id = id del usuario en el provider de auth (originalmente `clerkUserId`, ahora `kindeUserId` tras la migración) para correlacionar con eventos del frontend (`posthog-js`).
- Default-off (`foresight.analytics.posthog.enabled=false`). Con flag a true pero key vacía, el backend **no arranca** (fail-fast deliberado). El frontend instala un stub no-op en su lugar.
- `frontend/src/lib/posthog.ts` + bootstrap en `main.tsx`.
- Commits: "Adding posthog instrumentation" (x2), "Fixing bug in instrumentation", "Disabling posthog by default".

### Privacy + cookie consent

- `features/privacy/PrivacyPage.tsx` — ruta pública `/privacy`.
- `features/cookies/CookieConsent.tsx` — overlay global montado en `App.tsx` (fuera de `<AppRoutes>` para cubrir todas las rutas incluidas las públicas). Gating de analytics hasta que el usuario acepta. Persistido en localStorage.

### App shell + UI

- `features/shell/` — `AppShell`, `TopBar`, `AppFooter`, `Stepper`, `StepperContext` (extrae la layout del shell del resto de pages).
- Step 4 nuevo en el wizard: `StepGlobal.tsx` (consumido por la pipeline global-steep).
- 8 tabs en `ReportPage`: `TabSummary`, `TabScenarios`, `TabScenarioPlanning`, `TabBackcasting`, `TabStrategicMap`, `TabSignals`, `TabSources`, `ImpactMatrix`.
- `features/translations/TranslationsContext.tsx` — capa de toggle de idioma por informe encima de i18next.
- Componentes nuevos: `ConfirmDialog`, `ExportModal`, `ShareModal`, `PromoteToExampleModal`, `OnboardingDialog`, `Modal`, `InfoTooltip`, `LineClamp`, `LoadingOverlay`, `LoadingPanel`, `SplitButton`, `IconSprite`, `LanguageToggle`.

### Producción

- `frontend/Dockerfile.prod` — multi-stage Node 20-alpine builder → Caddy 2-alpine server.
- `frontend/Caddyfile` — SPA fallback a `/index.html`, cache 1y para `/assets/*` (hashed), no-cache para `index.html` y `share-snapshot.html`.
- `frontend/docker-entrypoint.sh` para el modo dev/preview alternable vía env var (`FRONTEND_MODE`).
- `backend/Dockerfile` con debugger JDWP expuesto en `DEBUG_PORT`.
- Backend acepta `PORT` además de `SERVER_PORT` para encajar con Railway / Heroku / Fly que inyectan `PORT` directamente.
- Commit "Adding production server files".

### Trabajo de mantenimiento

- Hardening contra 500s + logging extra (commit "Hardening against 500 errors and adding extra logging").
- Tests añadidos: `AiResponseSanitizerTest`, `AiServiceTest`, `AiRateLimitFilterTest`, `SubscriptionServiceTest`.

---

## [Anteriormente — Unreleased — M2 in progress]

### 2026-05-03 (Clerk Backend API — `feature/clerk`)
- **Recuperar `name` desde Clerk en el primer login**, sin depender de configurar un JWT template ni de tener el webhook funcionando.
  - Nuevo `ClerkBackendClient` (Spring `RestClient`) que hace `GET https://api.clerk.com/v1/users/{id}` con `CLERK_SECRET_KEY`. Devuelve `Optional.empty()` y no propaga errores: si Clerk está caído o la key no está configurada, el lazy-create sigue funcionando con `name = null`.
  - `UserService.findOrCreateByClerkUserId` ahora usa una cadena de fallbacks: Clerk Backend API → claims del JWT (`name`, `first_name`) → null.
  - **Heal-on-read**: si un usuario existente tiene `name = null/blank` (p. ej. creado antes de cablear la secret), la siguiente petición lo rellena leyendo el perfil de Clerk. Una sola vez por usuario — el guard corta en cuanto `name` queda seteado.
  - Nueva env var `CLERK_SECRET_KEY` (opcional, vacía por defecto). Documentada en `.env.example`, `application.properties`, README y ARCHITECTURE.

### 2026-05-02 (Clerk hardening — `feature/clerk`)
- **Eliminado `email` del modelo local** — la fuente de verdad es Clerk.
  - Migración `V4__fix_user_constraints_for_clerk.sql`: `DROP COLUMN email`, `clerk_user_id` queda `NOT NULL` y único.
  - Renombrada V4 (faltaba el doble underscore que pide Flyway — Flyway estaba ignorando la migración silenciosamente, por eso no había llegado a aplicarse).
  - `User`, `UserResponse`, `ClerkEvent`, `AuthenticatedUser`, `DevPrincipal`, `DevUserSeeder` actualizados.
  - Frontend: `UserResponse` sin `email`; `AccountPage` lee el email directamente de `useUser().primaryEmailAddress`; `DashboardPage` muestra solo `name`.
- **Fix race condition en lazy-create** — al loguearse por primera vez, el dashboard disparaba `/users/me` y `/reports` en paralelo y ambas peticiones intentaban INSERT del mismo `clerk_user_id`, fallando con NOT NULL del email.
  - Añadido `ConcurrentMap<String, Object>` de locks por `clerk_user_id` en `UserService` para serializar el primer INSERT a nivel JVM.
  - `findOrCreateByClerkUserId` deja de ser `@Transactional`: la ausencia de transacción exterior permite que el `catch DataIntegrityViolationException` recupere con un nuevo SELECT sin chocar con un rollback-only (cubre la rare race entre instancias JVM distintas).
- **JWT template como prerequisito** — el session JWT por defecto de Clerk no trae `email` ni `name`. Documentado en `README.md` y `ARCHITECTURE.md` que hay que crear un template con el claim `name` y usarlo desde `getToken({ template: ... })`.

### 2026-05-02 (Clerk integration — commit `5875d45`)
- **Migración a Clerk como proveedor de auth.** Eliminado todo el endpoint `/api/auth/*` (login, register, change-password, forgot-password, reset-password, verify-email, resend-verification-email).
  - Backend: `JwtAuthFilter` valida session JWTs contra el JWKS de Clerk (`spring-security-oauth2-resource-server` + Nimbus). `ClerkJwtDecoderConfig` pin del issuer.
  - `UserService.findOrCreateByClerkUserId` añadido para crear lazily el row local en la primera petición autenticada (cubre la ventana de carrera con el webhook `user.created`).
  - Webhook receiver `POST /api/webhooks/clerk` con verificación Svix HMAC (`com.svix:svix`); maneja `user.created` / `user.updated` / `user.deleted`.
  - `application.properties`: `foresight.security.clerk.{issuer,jwks-uri,webhook-signing-secret}` + `auth-disabled` toggle (solo `local`).
  - Migración `V3__clerk_auth.sql`: añade `clerk_user_id` a `users`; quita `password`, `email_verified`, y las tablas `tokens`/`auth_tokens` de V2.
  - `DevUserSeeder` siembra el usuario de desarrollo cuando `auth-disabled=true`.
- **Frontend: integración con `@clerk/react`.**
  - `<ClerkProvider>` con `VITE_CLERK_PUBLISHABLE_KEY` en `main.tsx`.
  - `<AuthBridge>` conecta `useAuth().getToken()` al interceptor de Axios; el token se inyecta async-mente en cada request.
  - Rutas `/sign-in/*` y `/sign-up/*` montan los componentes `<SignIn />` / `<SignUp />` de Clerk; `<UserButton />` para gestionar email/contraseña/MFA.
  - `useCurrentUser` se gatea con `isLoaded && isSignedIn` para evitar el flash 401 inicial.
  - Eliminados hooks `useLogin`, `useRegister`, `useChangePassword`, `useForgotPassword`, `useResetPassword` (todo lo que ahora vive en Clerk).
- **Rate limiting movido a `/api/ai/**`.** `AiRateLimitFilter` (Bucket4j, en memoria) limita por usuario autenticado: 100 calls/hora. Default 30 → 100 (commit `58c8195`).
- **Exports PDF y PPT** — botones en la nav de ReportPage, activos solo cuando hay `resultData`
  - `src/lib/exportPdf.ts` — genera PDF programático con jspdf (portada, inputs, STEEP, horizon, resultados)
  - `src/lib/exportPpt.ts` — genera presentación con pptxgenjs (slides por sección, diseño oscuro con acento dorado)
  - Botones deshabilitados en informes DRAFT, tooltip i18n (ES/EN)
  - Exports 100% client-side — leen datos ya guardados en PostgreSQL

### 2026-04-22
- **i18n infrastructure** — i18next + react-i18next configured with ES (default) and EN catalogs
  - Catálogos en `frontend/src/i18n/locales/{es,en}.ts` (nav, dashboard, account)
  - `useLanguageSync` hook sincroniza el idioma de i18next con la preferencia guardada en el perfil del usuario
  - DashboardPage y AccountPage migradas a `useTranslation` — cambiar idioma en /account refleja en tiempo real
  - Arquitectura lista para extender al resto de pantallas pantalla a pantalla

### 2026-04-21
- **AccountPage** (`/account`) — nueva pantalla de gestión de cuenta
  - Sección Perfil: nombre editable, email y rol en readonly
  - Sección Preferencias: selector de idioma ES/EN con `PATCH /api/users/me`
  - Sección Seguridad: cambio de contraseña con validación client-side (contraseñas coinciden, mínimo 8 chars)
  - Feedback visual inline (ok/error) por sección
  - Hooks `useUpdateProfile` y `useChangePassword` en `src/hooks/useAccount.ts`
  - Enlace "Mi cuenta" añadido en la cabecera del dashboard
  - 11 tests nuevos → total 41 tests pasando
- **DashboardPage, NewReportPage, ReportPage** — pantallas M2 completadas
  - Dashboard: listado de informes con badges de estado, empty state, eliminar, logout
  - Wizard 3 pasos: Empresa → STEEP → Horizon Scan → `POST /api/reports`
  - ReportPage: tabs INPUTS (empresa, STEEP, horizonte) y RESULTADOS (escenarios 3P, incertidumbres, señales débiles, wildcards)
  - Fix crítico: `Page<T>` corregido a forma plana de Spring (no anidado bajo `page`)
  - JWT persistido en `localStorage` en modo dev para sobrevivir recargas
- **Documentación API** — `docs/API.md` creado con referencia completa de todos los endpoints REST

### 2026-04-21 (sesión anterior)
- **Scaffold React frontend** — M2 arranca desde cero con nueva estructura
  - Vite + React 18 + TypeScript + ESLint
  - React Router v6 con `ProtectedRoute`
  - Axios con inyección JWT y handler 401→logout (`src/lib/api.ts`)
  - TanStack Query v5 (`src/lib/queryClient.ts`)
  - Tipos TypeScript para todos los DTOs del backend (`src/types/api.ts`)
  - Sistema de diseño: tema oscuro + acento dorado, fuentes DM Sans / DM Mono / Playfair Display
  - Auth hooks: `useLogin`, `useRegister`, `useCurrentUser`, `useLogout`
  - LoginPage y RegisterPage con diseño completo
  - Vitest + React Testing Library configurados
  - 24 tests iniciales (auth hooks, rutas protegidas)
- **README** actualizado con instrucciones de arranque del frontend

---

## [M1 — Backend foundation] — completado

### Backend inicial (Spring Boot 3.5 + PostgreSQL 16)
- Estructura package-by-feature: `auth/`, `user/`, `report/`, `ai/`, `common/`
- Entidades UUID con auditoría (`createdAt`, `updatedAt`)
- Migraciones Flyway — esquema bajo control de versiones
- Autenticación JWT HS256 con filtro personalizado + `@CurrentUser`
- Manejo global de excepciones con respuesta `ApiError` normalizada
- Bean Validation en todos los DTOs
- CORS configurable por variable de entorno
- CRUD de informes (`/api/reports/**`) con ownership enforcement
- Endpoints proxy de Claude (`/api/ai/**`) — API key solo en servidor
- OpenAPI / Swagger UI en `/swagger-ui.html`
- Setup de tests con Testcontainers
- Docker Compose con PostgreSQL + backend

### Auth flows ampliados
- Reset de contraseña (`POST /api/auth/forgot-password` + `POST /api/auth/reset-password`)
- Verificación de email (`POST /api/auth/verify-email`)
- Cambio de contraseña autenticado (`POST /api/auth/change-password`)
- DTOs actualizados con anotaciones Swagger
- Esquema `tokens` en Flyway para tokens de reset/verificación

### Tests backend
- Tests unitarios: `UserServiceTest`, `AuthServiceTest`
- Tests de integración: `AuthFlowIntegrationTest`, `UserFlowIntegrationTest`, `ReportFlowIntegrationTest`
- Testcontainers para PostgreSQL real en tests

### Configuración y entorno
- Perfil `local` de Spring para desarrollo sin auth (inyección de usuario dev)
- `.env.dev` para desarrollo con auth real (sin perfil local)
- Scripts `scripts/up.sh` con soporte de perfiles Docker Compose
- `.gitignore` actualizado para no exponer secretos

---

## Decisiones técnicas relevantes

| Decisión | Motivo |
|---|---|
| Auth delegada a Clerk | No mantener login/register/MFA/social/password-reset propios; backend solo valida JWTs y proxy-ea AI |
| Email no se almacena localmente | Una sola fuente de verdad (Clerk); frontend lo lee de `useUser()` cuando lo necesita |
| `clerk_user_id` como identidad real | Estable, único, validado por unique constraint + lock JVM en lazy-create |
| `Page<T>` plano (no `data.page.totalElements`) | Spring Data devuelve `totalElements` en la raíz, no anidado |
| i18next con catálogos ES/EN en todas las pantallas | Mercado objetivo bilingüe |
| No worktrees | Acordado con el usuario — siempre trabajar en la rama directamente |
| PR por feature desde rama dedicada | Cada feature = una rama = un PR para revisión limpia |
