# Architecture

PATA & CÃO is a pet services marketplace connecting owners with verified boarding, walking, and training providers. This document captures the architectural decisions and rationale behind the system.

---

## System Topology

```
Browser
  │
  ├─▶ Frontend (Astro + React)  :3000
  │     Static site, React islands via client:only="react"
  │     Built once at Docker build time (env vars baked in)
  │
  └─▶ Backend API (Go + Echo)   :8080
        │
        ├─▶ PostgreSQL 16        :5432   Primary relational store (source of truth)
        ├─▶ Typesense 27.1       :8108   Full-text provider search index (derived)
        └─▶ SeaweedFS Filer      :8888   Distributed image storage (opt-in profile)
```

---

## Technology Choices

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend framework | Astro 4 + React 18 | Astro generates static HTML (fast, SEO-friendly); React islands handle interactive UI (carousel, forms) |
| Styling | Tailwind CSS | Utility-first, no runtime overhead in static output |
| i18n | react-i18next + browser-languagedetector | 4 locales (en, es, pt, pt-BR); auto-detects browser language |
| Backend language | Go 1.22 | Static typing, low memory footprint, excellent concurrency for booking flows |
| HTTP framework | Echo v4 | Minimal, fast, idiomatic middleware chain; wildcard routing needed for slash-containing image IDs |
| Auth | golang-jwt/jwt v5 | Access token (15 min) + refresh token (30 days) stored in DB for revocation |
| Relational DB | PostgreSQL 16 | ACID guarantees for bookings, provider approval, health records |
| Search engine | Typesense 27.1 | Single-binary, no JVM; typo-tolerance, faceting, geo-search out of the box; replaces SQL ILIKE approach |
| Image storage | SeaweedFS (opt-in) / local FS (default) | SeaweedFS filer HTTP API is simple PUT/GET; local FS keeps the default dev stack zero-dependency |
| Container orchestration | Docker Compose | Single-machine local dev; no Kubernetes complexity at MVP stage |

---

## Frontend Architecture

### Static Generation + React Islands

Astro builds the entire site to static HTML/CSS/JS at image build time. Interactive components (carousel, search bar) are React islands loaded client-side with `client:only="react"`. This means:

- Pages are served as pre-rendered HTML — no JS required for initial paint.
- `PUBLIC_API_URL` is baked into the JS bundle during `astro build` via a Docker `ARG`. Runtime environment variables are **not** available to the frontend.

### Build-time Configuration

```dockerfile
ARG PUBLIC_API_URL=http://localhost:8080
ENV PUBLIC_API_URL=$PUBLIC_API_URL
RUN npm run build
```

The `docker-compose.yml` `build.args` block sets this per environment.

### i18n

Translations live in `frontend/src/locales/{lang}/translation.json`. All four locales (en, es, pt, pt-BR) must have identical key sets. The fallback chain is: detected locale → `pt-BR` → `en`. See `docs/I18N.md` for the full guide.

---

## Backend Architecture

### Layered Structure

```
cmd/server/main.go       Wires everything, registers routes, runs Echo
internal/
  config/                Reads env vars into a typed Config struct
  handler/               HTTP handlers — thin layer, delegates to service
  service/               Business logic — validation, orchestration
  repository/postgres/   All SQL via pgx/v5 + sqlx
  middleware/            JWT auth, rate limiting, admin role check
  models/                Shared data types
```

### Request Flow

```
Request → Echo router → Middleware (JWT, rate limit) → Handler → Service → Repository → PostgreSQL
```

Handlers never talk to the database directly. Services contain all business rules (booking conflict detection, provider status immutability, health record audit logging).

### Authentication

- `POST /api/auth/signup` and `POST /api/auth/login` issue a short-lived **access token** (JWT, 15 min) and a long-lived **refresh token** (30 days, configurable via `JWT_REFRESH_EXPIRY_DAYS`).
- The refresh token is set as an `HttpOnly`, `SameSite=Lax` cookie scoped to `/api/auth`. It is never exposed to JavaScript.
- Refresh tokens are SHA-256 hashed before storage in the `refresh_tokens` table so a leaked DB snapshot never contains usable tokens.
- `DELETE /api/auth/logout` clears the cookie and marks the token revoked in the DB.
- `POST /api/auth/refresh` reads the cookie (no body needed), validates it, rotates it (old token revoked, new token issued), and sets a fresh cookie.
- Protected routes use the `JWTAuth` middleware which validates the access token signature and expiry.
- Admin routes additionally require `RequireAdmin()` which checks the `role` claim in the token.
- **Admin allowlist**: The `ADMIN_EMAILS` env var (comma-separated, case-insensitive) promotes matching users to `role=admin` on the JWT at token-issuance time without modifying the database `users.role`. Removing an email revokes admin on the next login/refresh.

### Rate Limiting

Token-bucket rate limiter keyed by IP, configured via `RATE_LIMIT_REQUESTS` and `RATE_LIMIT_WINDOW_SECS`. Applied globally before route handlers.

---

## Data Architecture

### PostgreSQL (Primary)

Stores all structured data: users, pets, providers, bookings, reviews, refresh tokens, health records. Schema is version-controlled in `backend/migrations/` and applied automatically on startup via a lightweight migration runner that tracks applied versions in a `schema_migrations` table.

The `MIGRATIONS_DIR` env var (set to `/app/migrations` in Docker) takes precedence over the default runtime-relative path, so migrations work identically in Docker and local dev.

### Typesense (Provider Search)

Typesense holds a derived index of approved providers only. PostgreSQL is the source of truth — Typesense is populated by sync hooks in the service layer and can be fully rebuilt via `POST /api/admin/search/reindex`.

**Sync points:**

| Event | Action |
|-------|--------|
| Provider approved | `IndexProvider` — adds document to index |
| Provider profile updated (approved) | `IndexProvider` — upserts document |
| Review submitted | `IndexProvider` — updates `avg_rating` / `review_count` fields |
| Admin reindex | `Reindex` — full upsert from PostgreSQL |

**Fallback:** if Typesense is unreachable, `ListProviders` falls back transparently to a PostgreSQL `ILIKE` query so the API keeps working.

**Collection:** `providers` — fields: `id`, `business_name`, `bio`, `location`, `services` (facet), `avg_rating` (default sort), `review_count`, `logo_image_id`. See `docs/SEARCH.md` for the full schema and API contract.

**FerretDB** was the original plan for this layer. It is commented out in `docker-compose.yml` and will be removed in the same PR as the Typesense Go implementation.

---

## Image Architecture

### Storage Modes

`IMAGE_STORAGE_TYPE` controls where images are written on upload:

| Value | Behavior |
|-------|----------|
| `local` (default) | Written to local filesystem at `IMAGE_STORAGE_PATH` |
| `seaweedfs` | HTTP PUT to `SEAWEEDFS_URL/<imageID>` (SeaweedFS filer) |

Reads always try the local filesystem first, then fall back to an HTTP GET from SeaweedFS if `SEAWEEDFS_URL` is set. This means a mixed deployment (some images local, some remote) works without reconfiguration.

### Caching

```
Browser
  └── Cache-Control: public, max-age=2592000 (30 days)
      ETag: "<sha256-of-bytes>"
      → 304 Not Modified on If-None-Match match

Backend (in-process)
  └── LRU cache (size = LRU_CACHE_SIZE, default 512 entries)
      Key: imageID string
      Value: raw bytes + computed metadata
      → populated on first fetch, evicted on upload/invalidation

CDN (future)
  └── CloudFlare or similar in front of the backend API
      Origin: /api/images/*
      TTL: 90 days
```

The LRU cache is intentionally in-process (no Redis dependency) for simplicity at MVP scale. It is per-replica — adding replicas means more total cache capacity, not shared state.

### Image IDs with Slashes

Image IDs like `partner-1/logo` and `defaults/pet-placeholder` contain slashes. Echo's named parameter `:id` stops at `/`, so the image routes use a wildcard:

```
GET  /api/images/*         → imageH.Handle
POST /api/images/upload    → imageH.UploadImage
```

`Handle` reads `c.Param("*")` and routes paths ending in `/metadata` to metadata-only response; all others serve binary data.

### ETags and Conditional Requests

On every image response the backend sets `ETag: "<sha256hex>"`. If the client sends `If-None-Match` matching the current hash, the handler returns `304 Not Modified` with no body, saving bandwidth on re-validation.

### Validation

Server-side validation runs on every upload before storage. Constraints per type:

| Type | Formats | Min size | Max size | Max bytes |
|------|---------|----------|----------|-----------|
| `logo` | JPEG, PNG | 100×50 | 400×200 | 500 KB |
| `facility` | JPEG | 600×400 | 2000×1500 | 5 MB |
| `pet` | JPEG, PNG | 200×200 | 4000×4000 | 2 MB |
| `avatar` | JPEG, PNG | 100×100 | 1000×1000 | 1 MB |
| `provider` | JPEG, PNG | 100×100 | 4000×4000 | 2 MB |
| `document` | PDF, JPEG, PNG | — | — | 10 MB |

Validation checks: magic bytes (via `http.DetectContentType`), MIME type against allowed list, decoded pixel dimensions via `image.DecodeConfig`. See `docs/IMAGE-VALIDATION.md` for detail.

---

## Local Development

### Default Stack

```bash
docker compose up
```

Starts: PostgreSQL, Typesense, backend (local image storage), frontend.

Backend reachable at `http://localhost:8080`, frontend at `http://localhost:4321`.

### With SeaweedFS

```bash
docker compose --profile seaweedfs up
```

Adds a `pata_cao_seaweedfs` container (master + volume + filer in one process). To use it for uploads, add `IMAGE_STORAGE_TYPE=seaweedfs` to `backend/.env`. See `INSTRUCTIONS.md` for the full walkthrough.

### Configuration

All backend config is environment variables read at startup. Required vars: `DATABASE_URL`, `JWT_SECRET`. All others have safe defaults. See `backend/.env.example` for the full list and `backend/internal/config/config.go` for defaults and validation.

---

## API Surface

Base URL: `http://localhost:8080/api`

| Group | Auth | Endpoints |
|-------|------|-----------|
| Auth | None | `POST /api/auth/signup`, `/login`, `/refresh`; `DELETE /logout` |
| Auth (JWT) | JWT | `GET/PUT/DELETE /api/auth/profile` — own profile CRUD |
| Password reset | None | `POST /api/auth/password-reset/request`, `/confirm` |
| Users | JWT | `GET /api/users/:id` — gated: self, admin, or provider with confirmed booking |
| Pets | JWT | CRUD on `/pets`, health record at `/pets/:id/health` |
| Providers | Mixed | `GET /providers?q=&service=&sort=&page=&per_page=` and `/:id` are public; `POST /providers/register` is public; `POST /providers/apply` requires JWT |
| Bookings | JWT | Create, list, get, confirm, cancel |
| Reviews | JWT | `POST /reviews` |
| Images | Mixed | `GET /api/images/*` is public; `POST /api/images/upload` requires JWT (types: `logo`, `facility`, `pet`, `avatar`, `document`, `provider`) |
| Admin | JWT + admin role | `GET /admin/providers` (all, paginated), `GET /admin/providers/pending`, `POST /admin/providers/:id/approve|reject|suspend|unsuspend`, cache invalidation, search reindex |

Full endpoint reference and curl examples: `ADMIN_INSTRUCTIONS.md` (admin endpoints) and `docs/API.md` (public endpoints).

---

## Security Posture

- Health records are never exposed in list endpoints; access is audit-logged.
- Provider `status` is immutable once set to `approved` (enforced in service layer and DB constraint).
- Double-booking is prevented by a `UNIQUE` constraint on `(provider_id, start_time, end_time)` in PostgreSQL, not just application logic.
- JWT secrets must be set via `JWT_SECRET` env var; the docker-compose default value is clearly labeled `change-me-in-production`.
- Images are served only through the backend API; SeaweedFS is never exposed directly to the internet.

See `docs/SECURITY.md` for the full security checklist.
