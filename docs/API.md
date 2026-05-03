# API Reference

Complete reference for the Foresight backend REST API. Base URL: `http://localhost:8080`.

All protected endpoints require `Authorization: Bearer <clerk-session-jwt>`. The token comes from Clerk — the backend does **not** issue tokens, register users, or run a sign-in/sign-up flow itself. Sign-in, sign-up, password reset, email verification, MFA, and social login are all handled by Clerk's hosted UI on the frontend (`<SignIn />` / `<SignUp />` / `<UserButton />`).

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
| 401 | Unauthorized | Missing / invalid Clerk JWT |
| 403 | Forbidden | Authenticated but not allowed |
| 404 | Not Found | Resource doesn't exist (or doesn't belong to caller) |
| 409 | Conflict | Duplicate resource |
| 429 | Too Many Requests | Per-user AI rate limit exceeded |
| 500 | Internal Server Error | Unexpected server failure |

---

## Authentication

The backend has no `/api/auth/*` endpoints. Sign-in, sign-up, password reset, email verification, MFA, social providers, and account management UI are all hosted by Clerk:

- The frontend mounts Clerk's `<SignIn />` / `<SignUp />` components and obtains a session JWT via `useAuth().getToken()`.
- Every API request goes out with `Authorization: Bearer <clerk-session-jwt>`.
- The backend's `JwtAuthFilter` validates the JWT against Clerk's JWKS, then resolves the local `users` row by `clerk_user_id` (lazy-creating it if the `user.created` webhook hasn't arrived yet).

The backend never sees the user's password or email. Email is read directly from Clerk on the frontend (`useUser().primaryEmailAddress`).

> **JWT template.** To populate `name` on lazy-create, configure a Clerk JWT template with a `name` claim (e.g. `"name": "{{user.first_name}} {{user.last_name}}"`) and pass `template: "<name>"` to `getToken()`.

---

## Rate limiting

`/api/ai/**` is rate-limited per authenticated user (Bucket4j, in-memory): **100 calls / hour / user** by default. Tunable via `foresight.security.rate-limit.ai.*` properties.

When exceeded → `HTTP 429`:
```json
{ "status": 429, "error": "Too Many Requests", "message": "Slow down and try again in a minute." }
```

Auth-endpoint rate limiting (login, register, forgot-password, etc.) is handled by Clerk on the auth flows it owns. The backend does not duplicate it.

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

> Email is intentionally not in this response — it lives in Clerk. The frontend reads it from `useUser().primaryEmailAddress.emailAddress`.

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

## AI — `/api/ai`

> AI endpoints proxy calls to Anthropic Claude server-side. The API key never reaches the browser.
> In the `local` profile, these endpoints are accessible without JWT.

### POST /api/ai/suggest-steep

Asks Claude to suggest high-impact STEEP factors for a given dimension and company context.

**Auth required:** Yes

**Request body:**
```json
{
  "dimension": "technological",                            // required: social | technological | economic | environmental | political
  "companyProfile": "Acme Mobility — mid-size European operator of shared electric scooters, 15 cities, 4M rides/year.",  // required
  "language": "es"                                         // optional: "es" (default) or "en"
}
```

**Response `200`:** Raw JSON from Claude (shape depends on Claude's response).

---

### POST /api/ai/suggest-horizon

Asks Claude to suggest horizon-scanning signals for a given time horizon.

**Auth required:** Yes

**Request body:**
```json
{
  "horizon": "H2",                                         // required: H1 (0–2y) | H2 (2–5y) | H3 (5y+)
  "companyProfile": "Acme Mobility — ...",                  // required
  "language": "es"                                         // optional: "es" (default) or "en"
}
```

**Response `200`:** Raw JSON from Claude.

---

### POST /api/ai/analyze

Generates a full strategic foresight analysis from company profile, STEEP factors, and horizon signals.

**Auth required:** Yes

**Request body:**
```json
{
  "companyProfile": { "name": "Acme Mobility", "industry": "Urban transport", "geography": "EU" },  // required
  "steep": {                                                                                          // required
    "social": [...],
    "technological": [...],
    "economic": [...],
    "environmental": [...],
    "political": [...]
  },
  "horizon": { "H1": [...], "H2": [...], "H3": [...] },   // required
  "language": "es"                                         // optional: "es" (default) or "en"
}
```

**Response `200`:** Raw JSON from Claude containing the full foresight report (scenarios, backcasting, weak signals, etc.).

---

## Webhooks — `/api/webhooks`

### POST /api/webhooks/clerk

Receives `user.created`, `user.updated`, and `user.deleted` events from Clerk and reconciles the local `users` table.

**Auth required:** No (authenticated via Svix HMAC signature instead).

Every delivery is verified with the Svix signing secret (`CLERK_WEBHOOK_SIGNING_SECRET`). Deliveries with a missing or invalid signature are rejected with `400` before any side effect. Outside the 5-minute timestamp window also fails verification (replay protection).

**Handled events:**
| Event | Action |
|---|---|
| `user.created`, `user.updated` | Upsert local row by `clerk_user_id`; refresh `name` |
| `user.deleted` | Delete local row (cascades to owned reports) |
| anything else | Ignored, returns `204` |

**Response `204`:** No body, on successful processing or ignored event type.

**Errors:**
| Status | When |
|--------|------|
| 400 | Missing or invalid Svix signature, or malformed payload (missing `type` / `data.id`) |

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
  "role": "USER | ADMIN",
  "language": "es | en"
}
```

Email, password, MFA, and email-verification status all live in Clerk, not in this response.

### ReportResponse
```json
{
  "id": "uuid",
  "title": "string",
  "status": "DRAFT | PROCESSING | COMPLETED | FAILED",
  "inputData": { ... },
  "resultData": { ... } | null,
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
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

