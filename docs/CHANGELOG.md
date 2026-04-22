# Changelog

All notable changes to this project are documented here.  
Format: `[version/milestone] — date — description`.

---

## [Unreleased — M2 in progress]

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
| JWT en memoria (prod) / localStorage (dev) | Seguridad en prod, DX en dev sin perder el token al recargar |
| `Page<T>` plano (no `data.page.totalElements`) | Spring Data devuelve `totalElements` en la raíz, no anidado |
| i18next solo en dashboard + account por ahora | MVP: infraestructura validada, resto se extiende iterativamente |
| No worktrees | Acordado con el usuario — siempre trabajar en la rama directamente |
| PR por feature desde rama dedicada | Cada feature = una rama = un PR para revisión limpia |
