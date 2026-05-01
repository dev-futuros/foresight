# API Reference

Complete reference for the Foresight backend REST API. Base URL: `http://localhost:8080`.

All protected endpoints require `Authorization: Bearer <token>` header.

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
  "path": "/api/auth/register",
  "fieldErrors": [
    { "field": "email", "message": "must be a well-formed email address" },
    { "field": "password", "message": "size must be between 8 and 72" }
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
| 401 | Unauthorized | Missing / invalid JWT or wrong credentials |
| 403 | Forbidden | Authenticated but not allowed |
| 404 | Not Found | Resource doesn't exist (or doesn't belong to caller) |
| 409 | Conflict | Duplicate resource (e.g. email already registered) |
| 429 | Too Many Requests | Rate limit exceeded on auth endpoints |
| 500 | Internal Server Error | Unexpected server failure |

---

## Rate limiting

The following endpoints are rate-limited per client IP to prevent brute-force and spam:

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/verify-email`

When exceeded → `HTTP 429`:
```json
{ "status": 429, "error": "Too Many Requests", "message": "Slow down and try again in a minute." }
```

---

## Auth — `/api/auth`

### POST /api/auth/register

Creates a new user account and returns a JWT.

**Auth required:** No

**Request body:**
```json
{
  "email": "alice@example.com",       // required, valid email, max 255
  "password": "S3cret!LongEnough",    // required, 8–72 chars
  "name": "Alice Analyst",            // optional, max 255
  "language": "es"                    // optional, defaults to "es"
}
```

**Response `201`:**
```json
{
  "accessToken": "<jwt>",
  "expiresIn": 86400,
  "user": {
    "id": "uuid",
    "email": "alice@example.com",
    "name": "Alice Analyst",
    "role": "USER",
    "language": "es",
    "emailVerified": false
  }
}
```

**Errors:**
| Status | When |
|--------|------|
| 400 | Validation failure (missing field, invalid email, password too short) |
| 409 | Email already registered |

---

### POST /api/auth/login

Authenticates user and returns a JWT.

**Auth required:** No

**Request body:**
```json
{
  "email": "alice@example.com",   // required
  "password": "S3cret!LongEnough" // required
}
```

**Response `200`:** Same shape as `/register`.

**Errors:**
| Status | When |
|--------|------|
| 400 | Validation failure |
| 401 | Email not found or wrong password |

---

### POST /api/auth/change-password

Changes the authenticated user's password. Requires current password as proof.

**Auth required:** Yes

**Request body:**
```json
{
  "currentPassword": "S3cret!LongEnough",   // required
  "newPassword": "EvenL0nger!Secret"        // required, 8–72 chars
}
```

**Response `204`:** No body.

**Errors:**
| Status | When |
|--------|------|
| 400 | Validation failure or current password incorrect |
| 401 | Missing / invalid JWT |

---

### POST /api/auth/forgot-password

Initiates the password-reset flow. Sends a reset link to the email address if it exists.

**Auth required:** No

> Always returns `204` regardless of whether the email is registered (prevents account enumeration).

**Request body:**
```json
{
  "email": "alice@example.com"  // required, valid email
}
```

**Response `204`:** No body.

---

### POST /api/auth/reset-password

Completes the password-reset flow using the token from the email.

**Auth required:** No

**Request body:**
```json
{
  "token": "Q0RGS3Q3ZzU5...",          // required, opaque token from reset email
  "newPassword": "EvenL0nger!Secret"   // required, 8–72 chars
}
```

**Response `204`:** No body.

**Errors:**
| Status | When |
|--------|------|
| 400 | Token expired, already used, or not found |
| 400 | Validation failure |

---

### POST /api/auth/verify-email

Redeems the email verification token sent after registration.

**Auth required:** No

**Request body:**
```json
{
  "token": "Q0RGS3Q3ZzU5..."  // required, opaque token from verification email
}
```

**Response `204`:** No body.

**Errors:**
| Status | When |
|--------|------|
| 400 | Token expired, already used, or not found |

---

### POST /api/auth/resend-verification-email

Sends a fresh verification email to the authenticated user.

**Auth required:** Yes

**Request body:** None.

**Response `204`:** No body.

**Errors:**
| Status | When |
|--------|------|
| 400 | Email already verified |
| 401 | Missing / invalid JWT |

---

## Users — `/api/users`

### GET /api/users/me

Returns the authenticated user's profile.

**Auth required:** Yes

**Response `200`:**
```json
{
  "id": "00000000-0000-0000-0000-000000000001",
  "email": "alice@example.com",
  "name": "Alice Analyst",
  "role": "USER",
  "language": "es",
  "emailVerified": true
}
```

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
  "email": "string",
  "name": "string | null",
  "role": "USER | ADMIN",
  "language": "es | en",
  "emailVerified": true
}
```

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

### AuthResponse
```json
{
  "accessToken": "string",
  "expiresIn": 86400,
  "user": { ...UserResponse }
}
```
