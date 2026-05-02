# Changelog

All notable changes to this project are documented here.  
Format: `[version/milestone] — date — description`.

---

## [Unreleased — M2 in progress]

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
