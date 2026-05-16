# API Reference

Complete reference for the Foresight backend REST API. Base URL: `http://localhost:8080`.

All protected endpoints require `Authorization: Bearer <kinde-access-token>`. The token comes from Kinde — the backend does **not** issue tokens, register users, or run a sign-in/sign-up flow itself. Sign-in, sign-up, password reset, email verification, MFA, social login, and active-session management are all handled by Kinde's hosted UI (the frontend redirects to Kinde for these flows; the in-app Account modal deep-links to Kinde's hosted account portal for ongoing management).

---

## Error format

Every error response uses this shape:

```json
{
  "timestamp": "2026-04-21T10:00:00Z",
  "status": 404,
  "error": "Not Found",
  "message": "Report not found",
  "path": "/api/reports/...",
  "fieldErrors": null
}
```

For validation errors (HTTP 400), `fieldErrors` is an array:

```json
{
  "timestamp": "...",
  "status": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "path": "/api/users/me",
  "fieldErrors": [
    { "field": "language", "message": "must be one of: es, en" }
  ]
}
```

### HTTP status codes used

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Successful GET / PATCH |
| 201 | Created | Successful POST that creates a resource |
| 204 | No Content | Successful action with no response body |
| 400 | Bad Request | Validation failure or invalid domain state |
| 401 | Unauthorized | Missing / invalid Kinde JWT |
| 402 | Payment Required | User has no active subscription, or the current billing period has ended |
| 403 | Forbidden | Authenticated but not allowed (e.g. DEV-only endpoint hit by a regular user) |
| 404 | Not Found | Resource doesn't exist (or doesn't belong to caller) |
| 409 | Conflict | Duplicate resource |
| 429 | Too Many Requests | Per-user AI rate limit exceeded **or** subscription report quota exhausted |
| 500 | Internal Server Error | Unexpected server failure |

---

## Authentication

The backend has no `/api/auth/*` endpoints. Sign-in, sign-up, password reset, email verification, MFA, social providers, and account management UI are all hosted by Kinde:

- The frontend mounts `<KindeProvider>` and triggers auth flows via `<LoginLink>` / `<RegisterLink>` (from `@kinde-oss/kinde-auth-react/components`) that redirect to Kinde's hosted pages. After auth, Kinde redirects back to the configured callback URI, where the SDK processes the OAuth params and exposes the access token via `useKindeAuth().getToken()`.
- Every API request goes out with `Authorization: Bearer <kinde-access-token>`.
- The backend's `JwtAuthFilter` validates the JWT against Kinde's JWKS, then resolves the local `users` row by `external_user_id` (lazy-creating it if the `user.created` webhook hasn't arrived yet — typical in dev where the team's single shared webhook endpoint can't reach localhost).

The backend never sees the user's password or email. Email is managed entirely in Kinde and accessed by the user through Kinde's hosted account portal (deep-linked from the in-app Account modal via `<PortalLink>`).

> **Where does `name` come from?** Kinde's default session JWT doesn't include the user's name. The backend's `KindeBackendClient` calls `GET ${KINDE_MANAGEMENT_API_BASE_URL}/user?id={sub}` via the M2M `client_credentials` flow on lazy-create to fetch it. Editing the name from the in-app Account modal triggers a `PATCH /api/users/me` which pushes back to Kinde via the same Management API.

---

## Rate limiting

Two independent caps apply to different surfaces:

### AI endpoints — per-user token bucket

`/api/ai/**` is rate-limited per authenticated user (Bucket4j, in-memory): **100 calls / hour / user** by default. Tunable via `foresight.security.rate-limit.ai.*` properties.

When exceeded → `HTTP 429`:
```json
{ "status": 429, "error": "Too Many Requests", "message": "Slow down and try again in a minute." }
```

### Report creation — subscription quota

`POST /api/reports` checks the current subscription period before persisting:

| Condition | Status | Body |
|---|---|---|
| User has no plan, or `now() > subscription_current_period_end` | `402 Payment Required` | `{ "status": 402, "error": "Payment Required", "message": "Subscription required" }` |
| Period quota exhausted (10 reports per period on `FUTUROS_PLATAFORMA`) | `429 Too Many Requests` | `{ "status": 429, "error": "Too Many Requests", "message": "Report limit exceeded", "limit": 10, "used": 10, "periodEnd": "ISO-8601" }` |

Users with `UserRole.DEV` bypass both checks. The role is assigned by direct SQL only — there is no endpoint to promote it.

Auth-endpoint rate limiting (login, register, forgot-password, etc.) is handled by Kinde on the auth flows it owns. The backend does not duplicate it.

---

## Streaming endpoints (Server-Sent Events)

Several AI endpoints stream their output as `text/event-stream`. They are flagged in the AI section below. The wire shape is a sequence of JSON events:

```
data: {"type":"progress","chars":1234,"sources":3}

data: {"type":"progress","chars":2456,"sources":5}

data: {"type":"done","text":"...","citations":[...]}
```

| `type` | Fields | When |
|---|---|---|
| `progress` | `chars` (running output length), `sources` (web_search citations accumulated) | ~5×/sec while generating |
| `delta` | `text` (token chunk) | chat streaming only |
| `done` | `text` / parsed JSON, `citations` | terminal frame; signals completion |

Client disconnects propagate up to the Anthropic call so token generation stops. Non-streaming AI endpoints return `Callable<T>` and rely on Spring MVC's async dispatcher with a 480s timeout (aligned with the Anthropic read timeout).

---

## Users — `/api/users`

### GET /api/users/me

Returns the authenticated user's profile.

**Auth required:** Yes

**Response `200`:**
```json
{
  "id": "00000000-0000-0000-0000-000000000001",
  "name": "Alice Analyst",
  "role": "USER",
  "language": "es"
}
```

> Email is intentionally not in this response — it lives in Kinde. The user accesses / updates it via Kinde's hosted account portal (deep-linked from the in-app Account modal's "Gestionar cuenta" section).

---

### PATCH /api/users/me

Updates the authenticated user's name and/or language. All fields optional — omit to leave unchanged.

**Auth required:** Yes

**Request body:**
```json
{
  "name": "Alice A.",   // optional, max 255
  "language": "en"      // optional, "es" or "en"
}
```

**Response `200`:** Updated `UserResponse` (same shape as GET /api/users/me).

**Errors:**
| Status | When |
|--------|------|
| 400 | `language` is not "es" or "en" |
| 401 | Missing / invalid JWT |

---

### DELETE /api/users/me

Permanently deletes the authenticated user's account and all owned resources (GDPR erasure).

**Auth required:** Yes

> This action is irreversible. All reports belonging to the user are deleted via CASCADE.

**Response `204`:** No body.

---

## Reports — `/api/reports`

### POST /api/reports

Creates a new foresight report.

**Auth required:** Yes

**Request body:**
```json
{
  "title": "Q3 2026 strategic foresight — European mobility market",  // required, max 500
  "inputData": {                                                       // required, free-form JSON
    "companyProfile": { "name": "Acme Mobility", "industry": "Urban transport" },
    "steep": { "social": [], "technological": [], "economic": [], "environmental": [], "political": [] },
    "horizon": { "H1": [], "H2": [], "H3": [] }
  }
}
```

**Response `201`:**
```json
{
  "id": "uuid",
  "title": "Q3 2026 strategic foresight — European mobility market",
  "status": "DRAFT",
  "inputData": { ... },
  "resultData": null,
  "createdAt": "2026-04-21T10:00:00Z",
  "updatedAt": "2026-04-21T10:00:00Z"
}
```

**Errors:**
| Status | When |
|--------|------|
| 400 | Missing title or inputData |
| 401 | Missing / invalid JWT |

---

### GET /api/reports

Lists the authenticated user's reports (paginated, lightweight summaries without inputData/resultData).

**Auth required:** Yes

**Query parameters:**
| Param | Default | Description |
|-------|---------|-------------|
| `page` | `0` | Zero-based page number |
| `size` | `20` | Page size |
| `sort` | `createdAt,desc` | Sort field + direction. Fields: `createdAt`, `updatedAt`, `title`, `status` |

**Example:** `GET /api/reports?page=0&size=10&sort=createdAt,desc`

**Response `200`:**
```json
{
  "content": [
    {
      "id": "uuid",
      "title": "Q3 2026 ...",
      "status": "COMPLETED",
      "createdAt": "2026-04-21T10:00:00Z",
      "updatedAt": "2026-04-21T10:05:00Z"
    }
  ],
  "page": { "size": 20, "number": 0, "totalElements": 1, "totalPages": 1 }
}
```

---

### GET /api/reports/{id}

Returns full detail of a single report including inputData and resultData.

**Auth required:** Yes

**Path param:** `id` — UUID of the report.

**Response `200`:** Full `ReportResponse` (same shape as POST /api/reports response).

**Errors:**
| Status | When |
|--------|------|
| 404 | Report not found or belongs to another user |
| 401 | Missing / invalid JWT |

---

### PATCH /api/reports/{id}

Partially updates a report. All fields optional — omit to leave unchanged.

**Auth required:** Yes

**Request body:**
```json
{
  "title": "Q3 2026 — v2 (post workshop)",  // optional, max 500
  "inputData": { ... },                      // optional, replaces inputData entirely
  "resultData": { ... }                      // optional, replaces resultData entirely
}
```

**Response `200`:** Updated `ReportResponse`.

**Errors:**
| Status | When |
|--------|------|
| 404 | Report not found or belongs to another user |
| 401 | Missing / invalid JWT |

---

### DELETE /api/reports/{id}

Deletes a report owned by the authenticated user.

**Auth required:** Yes

**Response `204`:** No body.

**Errors:**
| Status | When |
|--------|------|
| 404 | Report not found or belongs to another user |
| 401 | Missing / invalid JWT |

---

### POST /api/reports/{id}/translate

On-demand Claude translation of a full report (input + result) into another language. Cached on success.

**Auth required:** Yes

**Query parameters:**
| Param | Default | Description |
|---|---|---|
| `targetLanguage` | — (required) | ISO-639-1: `"es"` or `"en"` |
| `force` | `false` | When `true`, regenerates even if a cached translation exists |

**Response `200`:**
```json
{
  "inputData": { ... },
  "resultData": { ... },
  "generatedAt": "2026-05-14T10:00:00Z"
}
```

The translation is also written to `reports.translations[targetLanguage]` so subsequent fetches in that language are free.

**Errors:** 404 (not found / not owner), 401, 429 (AI rate limit), 402 (no active subscription — translation also counts against subscription gating? — see source).

---

### POST /api/reports/{id}/translate/stream

Streaming variant of the above. Returns `text/event-stream` with `progress` / `done` frames (see [Streaming endpoints](#streaming-endpoints-server-sent-events)).

---

### DELETE /api/reports/{id}/translations/{language}

Evicts a single cached translation.

**Auth required:** Yes

**Response `204`:** No body.

---

### PUT /api/reports/{id}/pdf-optimized/{language}

Pushes the "tightened" PDF cache for a given language. Used by the export pipeline when long prose would overflow the layout — values are typically pre-computed via `POST /api/ai/tighten` field by field.

**Auth required:** Yes

**Path params:** `id` — UUID; `language` — ISO-639-1.

**Request body:**
```json
{
  "fields": {
    "executiveSummary": "shortened text",
    "steep.global.S": "...",
    "scenarios.0.description": "..."
  }
}
```

Field paths are dotted accessors into the report's `resultData`. The full payload is stored under `reports.pdf_optimized[language]` along with `version` (incremented by the layout engine when the budget changes) and `generatedAt`.

**Response `200`:** Updated `ReportResponse`.

---

## AI — `/api/ai`

> AI endpoints proxy calls to Anthropic Claude server-side. The API key never reaches the browser.
> In the `local` profile, these endpoints are accessible without JWT.
> Per-tier model selection lives in `application.properties` under `foresight.ai.anthropic.models.{haiku,sonnet,opus}`. The "Model" column below names which tier each endpoint uses.

### Suggestion endpoints (non-streaming)

#### POST /api/ai/suggest-steep

Suggest high-impact STEEP factors for a given dimension and company context. **Model: haiku.**

**Request body:**
```json
{
  "dimension": "technological",      // required: social | technological | economic | environmental | political
  "companyProfile": "Acme Mobility — mid-size European operator of shared electric scooters, 15 cities, 4M rides/year.",  // required
  "language": "es"                   // optional: "es" (default) or "en"
}
```

**Response `200`:** Raw JSON from Claude (shape depends on Claude's response).

---

#### POST /api/ai/suggest-horizon

Suggest horizon-scanning signals for a given time horizon. **Model: haiku.**

**Request body:**
```json
{
  "horizon": "H2",                   // required: H1 (0–2y) | H2 (2–5y) | H3 (5y+)
  "companyProfile": "Acme Mobility — ...",  // required
  "language": "es"
}
```

**Response `200`:** Raw JSON from Claude.

---

### Global STEEP scan (Step 2 of the wizard)

#### POST /api/ai/global-steep

Synchronous single call that produces a global STEEP briefing from web search. **Model: sonnet (web_search enabled).**

**Request body:** `GlobalSteepRequest` — company profile + language.

**Response `200`:** JSON with per-dimension prose and citations.

---

#### POST /api/ai/global-steep-scan (streaming)

Phase 1 of the global STEEP flow. Streams as the model browses and writes. **Model: sonnet (web_search).**

**Returns:** `text/event-stream` with `progress` / `done` frames.

---

#### POST /api/ai/global-steep-dim (streaming)

Phase 2 — per-dimension reformulation from the Phase 1 raw output. Called once per dimension. **Model: haiku.**

**Request body:** `GlobalSteepDimRequest` — dimension key + Phase 1 output + language.

**Returns:** SSE stream.

---

### Full analysis pipeline (Step 3 of the wizard)

The legacy one-shot endpoint still exists for compatibility, but the wizard uses the phased pipeline below.

#### POST /api/ai/analyze (legacy, non-streaming)

Generates the full foresight analysis in a single call. **Model: opus.** Kept for backwards compatibility — the wizard calls the phased endpoints instead.

**Request body:**
```json
{
  "companyProfile": { "name": "Acme Mobility", "industry": "Urban transport", "geography": "EU" },
  "steep": {
    "social": [...], "technological": [...], "economic": [...], "environmental": [...], "political": [...]
  },
  "horizon": { "H1": [...], "H2": [...], "H3": [...] },
  "language": "es"
}
```

**Response `200`:** Full foresight JSON (scenarios, backcasting, weak signals, etc.).

---

#### POST /api/ai/analyze/scan (streaming)

Phase 0 of the phased pipeline — research pass that gathers context with web_search. Output feeds the section calls. **Model: opus (web_search).**

**Request body:** `AnalyzeContextRequest` — company profile, STEEP, horizon, language.

**Returns:** SSE stream.

---

#### POST /api/ai/analyze/summary (streaming)

Generates the executive summary, key uncertainties, weak signals, and wildcards. **Model: opus.**

**Request body:** `AnalyzeContextRequest` with the scan output threaded in.

**Returns:** SSE stream.

---

#### POST /api/ai/analyze/scenarios (streaming)

Produces the 3P scenario narratives (Probable / Plausible / Possible). **Model: opus.**

**Returns:** SSE stream.

---

#### POST /api/ai/analyze/scenario-planning (streaming)

Builds the 2×2 scenario matrix: driving forces, critical uncertainties, axis mapping. **Model: opus.**

**Returns:** SSE stream.

---

#### POST /api/ai/analyze/strategic-map (streaming)

Strategic priorities organised by horizon (H1 / H2 / H3). **Model: opus.**

**Returns:** SSE stream.

---

#### POST /api/ai/analyze/backcasting (streaming)

Backcasting trajectories — milestones and decisions linking each scenario back to today. **Model: opus.**

**Returns:** SSE stream.

---

#### POST /api/ai/analyze/sources

Fifth pass — gathers and structures the web sources that ground the analysis. **Model: opus (web_search).** Returns a `Mono` (not streamed; the payload is small).

**Response `200`:** JSON array of citations.

---

### Chat assistant

#### POST /api/ai/chat

Stateless conversational agent: caller sends the full message history each turn. The model has access to 15 frontend tools (navigation, wizard control, report management, generation, locale) — tool calls flow back in the response and are executed by the browser. **Model: sonnet.**

**Request body:**
```json
{
  "messages": [                                  // required, oldest-first (mirrors Anthropic wire shape)
    { "role": "user",      "content": [{ "type": "text", "text": "..." }] },
    { "role": "assistant", "content": [{ "type": "text", "text": "..." }] }
  ],
  "context": "=== USER STATE ===\n...",          // optional; built client-side by buildAssistantSnapshot()
  "language": "es"                                // optional: "es" or "en"
}
```

**Response `200`:** JSON containing the model's reply (text) and any tool calls the browser should execute.

Two tools are confirm-required (`runAnalysis`, `generateGlobalSteep`) — the frontend surfaces a modal before firing them.

---

#### POST /api/ai/chat/stream

Streaming variant. Returns `text/event-stream` with `delta` frames (token chunks) and a terminal `done` frame.

---

### PDF tightening

#### POST /api/ai/tighten

Shortens a prose block to fit a target length budget without losing meaning. Used by the PDF export pipeline when a section would overflow its layout slot. **Model: haiku.**

**Request body:** `TightenRequest` — text + target character budget + language.

**Response `200`:** `{ "tightened": "..." }`.

The result is typically batched into `PUT /api/reports/{id}/pdf-optimized/{language}` to cache per-field tightened versions.

---

## Shares — `/api/reports/{id}/share` + `/api/examples/{id}/share` + `/api/public/share/{token}`

Share tokens make a report or example publicly viewable via a URL-safe random token (no auth). Snapshots are frozen at mint time and expire after 7 days. See [ARCHITECTURE.md → Share tokens](ARCHITECTURE.md#share-tokens-public-snapshots) for the model.

### POST /api/reports/{reportId}/share

Mints a public share token for one of the caller's reports.

**Auth required:** Yes (caller must own the report)

**Query parameters (all optional):**
| Param | Description |
|---|---|
| `language` | Primary language to surface on the public page (defaults to the report's primary). |
| `languages` | Comma-separated list of additional languages to bake in (defaults to all currently cached on the report). |

**Response `201`:**
```json
{
  "token": "<url-safe random>",
  "url": "https://app.foresight.io/share/<token>",
  "expiresAt": "2026-05-23T10:00:00Z"
}
```

Returns `Callable<T>` server-side — async-dispatched so on-the-fly translations triggered by this call don't time out at 30s.

---

### POST /api/examples/{id}/share

Same shape as the report-share endpoint, but for an example. Available to any authenticated user (examples are global content).

---

### GET /api/public/share/{token}

Public read of a frozen snapshot. **No authentication.**

**Response `200`:**
```json
{
  "title": "Q3 2026 — Acme Mobility",
  "primaryLanguage": "es",
  "inputData": { ... },
  "resultData": { ... },
  "translations": { "en": { "inputData": {...}, "resultData": {...} } },
  "expiresAt": "2026-05-23T10:00:00Z"
}
```

**Errors:**
| Status | When |
|--------|------|
| 404 | Token unknown, or `now() > expiresAt`. The endpoint does not distinguish between the two (anti-enumeration). |

---

## Examples — `/api/examples`

Examples are read-only **report snapshots** promoted by the team. See [ARCHITECTURE.md → Examples](ARCHITECTURE.md#examples-curated-snapshots).

### GET /api/examples

List all examples (lightweight summary).

**Auth required:** Yes (any authenticated user)

**Response `200`:** `ExampleSummary[]` — array of `{ id, slug, title, primaryLanguage, createdAt }`.

---

### GET /api/examples/{id}

Full example detail including `inputData`, `resultData`, and `translations`.

**Auth required:** Yes

**Response `200`:** `ExampleResponse`.

---

### POST /api/reports/{reportId}/promote-to-example

Promotes a report to an example. Upsert by slug — if an example with the same slug already exists, it is replaced in place.

**Auth required:** Yes — **`UserRole.DEV` only.**

**Request body:**
```json
{
  "slug": "european-mobility-q3-2026",   // required, stable kebab-case identifier
  "title": "...",                         // required
  "description": "..."                    // optional
}
```

**Response `200` or `201`:** `ExampleResponse`.

**Errors:** 403 (non-DEV), 404 (report not found / not owner).

---

### DELETE /api/examples/{id}

Deletes an example.

**Auth required:** Yes — **DEV only.** `204` on success.

---

### POST /api/examples/{id}/translate

Translates an example into a target language. Cached on the example row. Returns `Callable<T>` for async dispatch.

**Auth required:** Yes. Cache-cold translations require **DEV**; cache-warm reads are open to any authenticated user.

**Query params:** `targetLanguage` (required), `force` (default `false`).

---

### POST /api/examples/{id}/translate/stream

Streaming variant. **DEV only.**

---

### DELETE /api/examples/{id}/translations/{language}

Drops one cached translation. **DEV only.** `204` on success.

---

### POST /api/examples/{id}/demote

Reverses promotion: creates a fresh private report owned by the caller from the example's snapshot, then deletes the example row.

**Auth required:** Yes — **DEV only.**

**Response `200`:**
```json
{ "reportId": "<uuid of the newly created report>" }
```

---

## Subscriptions

There is no dedicated subscription controller today. The current subscription status is exposed implicitly:

- Frontend reads it via the `useSubscription` hook, which surfaces `SubscriptionService.statusOf()` data bundled into other user-scoped responses.
- The same data is what gates `POST /api/reports` (see [Rate limiting → Report creation](#report-creation--subscription-quota) above).

**SubscriptionStatus shape (frontend-facing):**
```json
{
  "plan": "FUTUROS_PLATAFORMA",
  "active": true,
  "developerMode": false,
  "periodStart": "2026-05-01T00:00:00Z",
  "periodEnd": "2026-06-01T00:00:00Z",
  "reportsUsed": 3,
  "reportsLimit": 10
}
```

Plan, period bounds, and DEV flag will be mirrored from **Stripe** webhook events (`customer.subscription.*`, `invoice.*`) once the dedicated Stripe integration (`/api/billing/*` endpoints + Stripe webhook receiver) lands. Today that wiring lives on the `feature/stripe` branch and is not on `develop` yet — see `docs/MIGRATION_CLERK_TO_KINDE.md` for the auth/billing decision narrative.

---

## Webhooks — `/api/webhooks`

### POST /api/webhooks/kinde

Receives Kinde events and reconciles the local `users` table for identity changes (`user.*`).

**Auth required:** No (authenticated via the JWT in the request body — Kinde signs the entire webhook payload as a JWT).

**Body**: the raw request body **IS** the JWT — there is no JSON envelope. The backend decodes it using the same `JwtDecoder` bean that validates session tokens (both signed against the same JWKS). Deliveries with an invalid signature, expired `exp`, or wrong issuer are rejected with `400` before any side effect.

**Handled events:**
| Event | Action |
|---|---|
| `user.created`, `user.updated` | Upsert local row by `external_user_id`; refresh `name` from `data.{firstName,lastName}` (or `data.{first_name,last_name}` — accepted via defensive parsing) |
| `user.deleted` | Delete local row (cascades to owned reports) |
| anything else | Ignored, returns `204` |

**Response `204`:** No body, on successful processing or ignored event type.

**Errors:**
| Status | When |
|--------|------|
| 400 | Empty body, invalid JWT (bad signature / expired / wrong issuer), or missing required claims (`type` / `data.userId`) |

> **No `KINDE_WEBHOOK_SIGNING_SECRET`** exists — Kinde signs with the JWT private key matching its JWKS, not an HMAC shared secret. This means one fewer env var to manage, no risk of secret rotation desync, and one less surface for credential leakage.

> **Subscription events** (`subscription.*`) will be wired with the billing integration on `feature/stripe`. They'll come from **Stripe**, not Kinde — Kinde's role is auth-only in our setup.

---

## Health — `/api`

### GET /api/health

Liveness probe for load balancers and uptime monitors.

**Auth required:** No

**Response `200`:**
```json
{ "status": "ok" }
```

---

## Report lifecycle

```
POST /api/reports  →  DRAFT
                          │
                          ▼ (trigger /api/ai/analyze)
                      PROCESSING
                          │
               ┌──────────┴──────────┐
               ▼                     ▼
           COMPLETED              FAILED
    (resultData populated)   (may be retried)
```

---

## Data models summary

### UserResponse
```json
{
  "id": "uuid",
  "name": "string | null",
  "role": "USER | DEV | ADMIN",
  "language": "es | en"
}
```

Email, password, MFA, and email-verification status all live in Kinde, not in this response. Subscription state is surfaced separately via the `useSubscription` hook (see Subscriptions section).

### ReportResponse
```json
{
  "id": "uuid",
  "title": "string",
  "status": "DRAFT | PROCESSING | COMPLETED | FAILED",
  "primaryLanguage": "es | en",
  "inputData": { ... },
  "resultData": { ... } | null,
  "translations": {
    "<lang>": { "inputData": {...}, "resultData": {...}, "generatedAt": "ISO 8601" }
  } | null,
  "pdfOptimized": {
    "<lang>": { "version": 1, "generatedAt": "ISO 8601", "fields": { "<dotted.path>": "..." } }
  } | null,
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

### ReportSummary (used in list)
```json
{
  "id": "uuid",
  "title": "string",
  "status": "DRAFT | PROCESSING | COMPLETED | FAILED",
  "primaryLanguage": "es | en",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

### ExampleResponse
```json
{
  "id": "uuid",
  "slug": "kebab-case-id",
  "title": "string",
  "description": "string | null",
  "primaryLanguage": "es | en",
  "inputData": { ... },
  "resultData": { ... },
  "translations": { "<lang>": { ... } } | null,
  "createdAt": "ISO 8601"
}
```

### PublicShareResponse (returned by `/api/public/share/{token}`)
```json
{
  "title": "string",
  "primaryLanguage": "es | en",
  "inputData": { ... },
  "resultData": { ... },
  "translations": { "<lang>": { "inputData": {...}, "resultData": {...} } } | null,
  "expiresAt": "ISO 8601"
}
```

### CreateShareResponse
```json
{
  "token": "url-safe-random",
  "url": "https://app.foresight.io/share/<token>",
  "expiresAt": "ISO 8601"
}
```

### SubscriptionStatus (surfaced to the frontend)
```json
{
  "plan": "FUTUROS_PLATAFORMA",
  "active": true,
  "developerMode": false,
  "periodStart": "ISO 8601",
  "periodEnd": "ISO 8601",
  "reportsUsed": 3,
  "reportsLimit": 10
}
```

