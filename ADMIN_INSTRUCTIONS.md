# Administrative Guide — PATA & CÃO

How to manage provider applications, moderate statuses, and use the admin dashboard.

---

## 1. Granting Admin Privileges

Admin access is controlled by the `ADMIN_EMAILS` environment variable in `backend/.env` — no database role change is needed.

```
ADMIN_EMAILS=you@example.com,another@admin.org
```

- **Case-insensitive.** Whitespace around entries is trimmed.
- The email list is loaded at startup. Add or remove entries, then restart the backend.
- When a user whose email is in the list logs in (or refreshes their token), the JWT carries `role=admin` regardless of the database `users.role` value.
- Removing an email revokes admin on the user's **next** token issuance (login or refresh). Sessions already active remain valid until their access token expires (15 min), so demotion is effective within 15 minutes.
- The database column `users.role` is **never** modified by the allowlist — the promotion is purely on the JWT.

### Dev vs production

In production set `COOKIE_SECURE=true` and `ADMIN_EMAILS` to real admin addresses. In dev, leave `COOKIE_SECURE=false` and you can set `ADMIN_EMAILS` to your local test email.

---

## 2. Admin Dashboard (UI)

Visit `/admin` while logged in as an admin user. The dashboard has two sections:

### Pending Queue

Shows every provider with status `pending` or `under_review`. Each row has:
- **Business name**, **service(s)**, **status pill**
- **Approve** (green) — transitions the provider to `approved`, making them visible in search.
- **Reject** (red) — opens a reason modal. On confirm, the provider becomes `rejected` and is hidden from search entirely.

### All Providers Table

A paginated view of every provider, filterable by status tab:

| Tab | Shows |
|-----|-------|
| Todos | Every provider regardless of status |
| Pendentes | `pending` + `under_review` |
| Aprovados | `approved` only |
| Suspensos | `suspended` only |
| Rejeitados | `rejected` only |

Contextual actions per row:
- **Pending / under_review**: Approve, Reject
- **Approved**: Suspend — opens a reason modal. Suspended providers disappear from search and can't receive new bookings.
- **Suspended**: Reinstate — returns the provider to `approved`. No reason needed.
- **Rejected**: no actions available.

Pagination controls appear at the bottom when there are more than 20 results.

---

## 3. Provider Status Lifecycle

```
                    ┌──────────┐
        applicant   │ pending  │   admin clicks "Aprovar"
        submits ──▶ │          │ ──────────────────────▶ ┌──────────┐
                    └──────────┘                         │ approved │
                         │                               └─────┬────┘
                         │ admin clicks "Rejeitar"             │
                         ▼                                     │
                    ┌──────────┐     admin clicks "Suspender"  │
                    │ rejected │ ◀─────────────────────────────┘
                    └──────────┘
                                                               │
                                           admin clicks        │
                                           "Reativar"          │
                                                               ▼
                                                         ┌───────────┐
                                                         │ suspended │
                                                         └───────────┘
```

- **pending** → the provider application was submitted; not yet reviewed.
- **under_review** → an admin has started reviewing (not currently set by the UI; available for future use).
- **approved** → visible in search, can receive bookings.
- **rejected** → hidden from search permanently. Cannot be transitioned to any other status (one-way).
- **suspended** → temporarily hidden from search. Reversible via `unsuspend` back to `approved`.

All status transitions (approve, reject, suspend, unsuspend) are audit-logged in the `provider_verification_audit` table with the acting admin's ID, timestamp, previous status, new status, and reason when applicable.

---

## 4. Admin API Reference

All admin endpoints require:
- A valid `Authorization: Bearer <accessToken>` header (obtained via `POST /api/auth/login`).
- The JWT must carry `role=admin` (see section 1).

Base URL: `http://localhost:8080/api/admin`

### 4.1 List all providers

```bash
GET /api/admin/providers?status=&page=1&per_page=20
```

| Param | Default | Description |
|-------|---------|-------------|
| `status` | (empty = all) | Filter by status: `pending`, `approved`, `suspended`, `rejected` |
| `page` | 1 | Page number (1-based) |
| `per_page` | 50 | Results per page (max 100) |

Response (200):
```json
{
  "providers": [
    {
      "id": "uuid",
      "businessName": "Pet Hotel SP",
      "services": ["boarding"],
      "status": "pending",
      "accountType": "pessoa_fisica",
      "avgRating": 0,
      "reviewCount": 0,
      "createdAt": "2026-05-17T12:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "perPage": 20
}
```

### 4.1.1 Export providers as CSV

```bash
GET /api/admin/providers/export?status=approved,pending
```

| Param | Default | Description |
|-------|---------|-------------|
| `status` | (empty = all) | Optional comma-separated filter: `approved`, `pending`, `under_review`, `suspended`, `rejected` |

Response (200): `Content-Type: text/csv` with `Content-Disposition: attachment; filename="providers_YYYY-MM-DD.csv"`.

Columns: ID, Business Name, Company Name, Email, Phone, Status, Services, Location, Rating, Created At, Updated At.

> **Note:** This is a streaming CSV download — do not pipe through `jq`.

### 4.2 Get pending providers (unpaginated)

```bash
GET /api/admin/providers/pending
```

Returns the full list of providers with status `pending` or `under_review`, ordered by `created_at ASC`.

### 4.3 Approve a provider

```bash
POST /api/admin/providers/:id/approve
```

No request body. Transitions `pending` / `under_review` → `approved`. Indexes the provider in Typesense (if configured).

Response (200):
```json
{ "message": "provider approved" }
```

Errors: `404` (not found), `422` (invalid transition — e.g. approving an already-approved provider).

### 4.4 Reject a provider

```bash
POST /api/admin/providers/:id/reject
Content-Type: application/json

{ "reason": "Documentação incompleta" }
```

`reason` is required. Transitions `pending` / `under_review` → `rejected`.

Response (200):
```json
{ "message": "provider rejected" }
```

### 4.5 Suspend a provider

```bash
POST /api/admin/providers/:id/suspend
Content-Type: application/json

{ "reason": "Múltiplas reclamações de clientes" }
```

`reason` is required. Only `approved` providers can be suspended. The provider is removed from search immediately.

Response (200):
```json
{ "message": "provider suspended" }
```

### 4.6 Unsuspend a provider

```bash
POST /api/admin/providers/:id/unsuspend
```

No request body. Transitions `suspended` → `approved`. Re-indexes the provider in Typesense.

Response (200):
```json
{ "message": "provider unsuspended" }
```

### 4.7 Reindex search

```bash
POST /api/admin/search/reindex
```

Rebuilds the entire Typesense index from all approved providers in PostgreSQL. No request body.

### 4.8 Invalidate image cache

```bash
POST /api/admin/cache/invalidate
```

Clears the in-process image LRU cache. Admin-only.

---

## 5. Curl Examples (Complete Workflow)

### Login + list pending + approve

```bash
API="http://localhost:8080/api"

# 1. Login
TOKEN=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!pass"}' \
  | jq -r '.accessToken')

# 2. List pending
curl -s "$API/admin/providers/pending" \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | {id, businessName, status}'

# 2.1 Export approved providers as CSV
curl -s "$API/admin/providers/export?status=approved" \
  -H "Authorization: Bearer $TOKEN" -o providers.csv

# 3. Approve one
curl -s -X POST "$API/admin/providers/550e8400-e29b-41d4-a716-446655440000/approve" \
  -H "Authorization: Bearer $TOKEN"
```

### Suspend an approved provider

```bash
curl -s -X POST "$API/admin/providers/550e8400-e29b-41d4-a716-446655440000/suspend" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Descumprimento dos termos de uso"}'
```

### List all suspended providers

```bash
curl -s "$API/admin/providers?status=suspended" \
  -H "Authorization: Bearer $TOKEN" | jq '.providers'
```

---

## 6. Audit Trail

Every admin action writes a row to `provider_verification_audit`:

| Column | Description |
|--------|-------------|
| `provider_id` | The provider being acted upon |
| `admin_id` | The admin who performed the action |
| `action` | `approved`, `rejected`, `suspended`, `unsuspended` |
| `previous_status` | Status before the action |
| `new_status` | Status after the action |
| `notes` | Reason text (rejection reason, suspension reason) |
| `created_at` | Timestamp of the action |

Query the audit trail directly in PostgreSQL:

```sql
SELECT p.business_name, va.action, va.previous_status, va.new_status,
       u.email AS admin_email, va.notes, va.created_at
FROM provider_verification_audit va
JOIN providers p ON p.id = va.provider_id
JOIN users u ON u.id = va.admin_id
ORDER BY va.created_at DESC
LIMIT 50;
```

---

## 7. Troubleshooting

**"admin access required" (403)**
Your JWT does not carry `role=admin`. Check that your email is in `ADMIN_EMAILS` and that you logged in (or refreshed) *after* the env change. Restart the backend if you just updated the allowlist.

**"invalid transition" (422)**
You're trying an action that isn't valid for the current status. Examples: suspending a pending provider, approving an already-approved provider, rejecting a rejected provider.

**Provider doesn't appear in search after approval**
Approval syncs to Typesense. If Typesense is down, the backend falls back to PostgreSQL. Check the backend logs for "typesense unavailable" warnings. A `POST /api/admin/search/reindex` can rebuild the index.

**Suspended provider still visible**
Suspended providers are excluded from public `GET /api/providers` (which filters `WHERE status='approved'`). They still appear in the admin dashboard under the "Suspensos" tab, which is correct — admins need to see them to potentially reinstate.
