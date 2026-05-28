# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (Go + Echo)

```bash
cd backend
go run ./cmd/server               # run locally (needs Postgres + Typesense)
go build ./...                    # compile check
go vet ./...                      # static analysis
go test ./...                     # run tests (none yet — test infra pending)
```

The backend requires `DATABASE_URL` and `JWT_SECRET` env vars. Copy `backend/.env.example` to `backend/.env` for local overrides. The Docker Compose stack provides defaults for everything.

### Frontend (Astro + React)

```bash
cd frontend
npm run dev                    # Astro dev server on :3000 with hot reload
npm run build                  # production build → dist/
npm run test                   # vitest (no tests yet)
./node_modules/.bin/tsc --noEmit -p tsconfig.json   # type-check only
./node_modules/.bin/astro check                      # Astro diagnostics
```

Astro extends `astro/tsconfigs/strict`. `PUBLIC_API_URL` must be set at build time — in Docker it comes from a build ARG; in dev the API client defaults to `http://localhost:8080`.

### Docker (full stack)

```bash
docker compose up -d                     # Postgres + Typesense + backend + frontend
docker compose up -d --build backend     # rebuild backend image after code change
docker compose up -d postgres typesense  # infra only (when running backend/frontend on host)
docker compose down                      # stop, keep volumes
docker compose down -v                   # stop + wipe all data
```

The backend applies migrations from `backend/migrations/` on startup against the `schema_migrations` tracking table. No init-scripts mount needed.

### Frontend ports

- Dev server (Astro): `http://localhost:4321`
- Docker (nginx): `http://localhost:3000`
- The npm `dev` script runs on 4321; Docker's `docker-compose.yml` and `CORS_ORIGINS` default still reference 3000.

## Architecture

### Layered backend

```
handler (HTTP, thin) → service (business logic) → repository (SQL via sqlx+pgx) → PostgreSQL
```

Handlers never touch the database. Services return errors as `"CODE: human message"` strings — `parseServiceError` in `internal/handler/helpers.go` maps codes to HTTP statuses. Add new error codes there.

### Auth

- Access tokens: JWT (HS256, 15 min). Refresh tokens: 48 random bytes, SHA-256 hashed in `refresh_tokens`, sent as `HttpOnly` `SameSite=Lax` cookie scoped to `/api/auth`.
- `JWTAuth` middleware validates the Bearer token and stores `userID` + `userRole` in Echo context. `RequireAdmin()` gates on `role == "admin"`.
- Admin promotion: `ADMIN_EMAILS` env (comma-separated, case-insensitive) — matching emails get `role=admin` on the JWT at `issueTokens` time. The DB `users.role` is NOT modified. Removing an email from the list takes effect on next login/refresh.
- Password policy: min 10 chars, 3 of 4 classes (upper, lower, digit, symbol). Enforced in `validateStrongPassword` (backend) and `evaluatePassword` (frontend `utils/password.ts`). Keep both in sync.

### Provider status lifecycle

```
pending → under_review → approved → suspended (reversible)
pending → under_review → rejected (one-way)
```

All transitions are audit-logged in `provider_verification_audit`. Suspended providers are removed from Typesense via `deleteFromSearch` and excluded from public `ListApproved` (`WHERE status = 'approved'`). The `providers_status_check` constraint enforces valid values at the DB level.

### Provider onboarding flow

- **Registration**: `POST /api/providers/register` creates user + pending provider. For PJ, `business_name` = razão social. For PF, `business_name` = fullName. Both are stored in `company_name` (legal name) + `business_name` (initial trade name).
- **Admin approval**: `POST /api/admin/providers/:id/approve` transitions to `approved`, generates a 7-day onboarding token, returns it in the response.
- **Token regeneration**: `POST /api/admin/providers/:id/regenerate-token` creates a fresh token (admin-only). Button hidden once `onboarding_completed_at` is set.
- **Onboarding form**: `/providers/setup?token=xxx` — 5-step wizard. Step 1 (credentials, conditional), Step 2 (avatar + gallery 15 max + businessName editable, companyName read-only reference), Step 3 (service preferences), Step 4 (description + location), Step 5 (whatsapp + email).
- **Auto-redirect**: On login, if user is `provider` with `status=approved` and `onboarding_completed_at IS NULL`, the auth response includes `needsOnboarding=true` + a fresh `onboardingToken`. Frontend redirects to `/providers/setup?token=...`.
- **Image uploads for providers**: `POST /api/images/upload?type=provider&token=...` — onboarding token required for abuse protection. Public endpoint, gated by token validation, origin check, file constraints (2MB, JPEG/PNG, 100–4000px), and rate limiter.
- **Profile completion**: `POST /api/providers/onboarding/complete` consumes the token, updates provider fields (businessName, bio, location, accepts_*, whatsapp), inserts gallery images, sets `onboarding_completed_at`. Also syncs `logo_image_id` → `users.avatar_image_id` so the avatar shows in the header.
- **Provider detail page**: `/providers/detail?id=xxx` — public profile (trade name, avatar, gallery, services, preferences, WhatsApp). `GET /api/providers/me` for own profile. Share buttons (WhatsApp, Facebook, X, Telegram, copy link). When viewing own profile, an "Edit Profile" button switches to `ProviderProfileEdit`.
- **Business name vs company name**: `company_name` (legal/registration name) is immutable post-registration. `business_name` (trade name) is editable during onboarding and via profile edit (rate-limited: 1x/month).

### Provider profile editing (post-onboarding)

- **Edit endpoint**: `PUT /api/providers/me` — full edit with rate-limiting:
  - `businessName`, `logoImageId`: 1 change per calendar month (tracked via `last_business_name_change`, `last_logo_change`)
  - `accepts_*` flags: 1 change per calendar month (tracked via `last_service_change`)
  - `bio`, `location`, `whatsapp`, `socialLinks`: freely editable
- **Gallery management**: `POST /api/providers/me/gallery` (add, max 15), `DELETE /api/providers/me/gallery/:imageId` (remove)
- **Social links**: `providers.social_links` (JSONB) mirrors `users.social_links` pattern — LinkedIn, Instagram, Facebook, Twitter, Website
- **Avatar sync**: When provider updates `logoImageId`, it is synced to `users.avatar_image_id` so the header avatar stays in sync
- **Frontend**: `ProviderProfileEdit.tsx` — inline edit form with logo upload, gallery grid, service checkboxes, social links, rate-limit notices
- **Gallery cap**: 15 images (raised from 6). DB table `provider_gallery_images` has no hard cap; limit enforced in service layer and UI.

### Pet owner flow

- **Signup**: The `LoginModal` now has tabs — **Pet Owner** (simple signup: fullName + email + password, role=`owner`) and **Provider** (redirects to `/providers/apply`). After pet-owner signup, the user is redirected to `/pets/add`.
- **Pet registration**: Two-step wizard in `PetRegistrationForm.tsx` — Step 1 (name, species, breed, birthDate, color, weightKg, heightCm, size, optional profile photo) → Step 2 (allergies, medications, isNeutered, behaviorNotes, specialNeeds, optional vet info). On submit: creates pet via `POST /api/pets`, upserts health record via `PUT /api/pets/:id/health`, then uploads profile photo if selected. Age is computed automatically from birth date.
- **Pet dashboard**: `PetDashboard.tsx` at `/pets` lists all owner's pets as cards with profile photo (or species-colored initial avatar), breed/size/color badges, and birth date. Empty state with heart icon and CTA. **"+ Add Another Pet"** button.
- **Pet detail page**: `PetDetailPage.tsx` at `/pets/detail?petId=xxx` — read-only view with photo gallery (primary + up to 10 images), pet info card, health info card, vet info card. **"Edit Pet"** button opens `PetEditModal`. **"Delete Pet"** button opens `DeletePetModal` (requires typing pet name + birth date to confirm).
- **Pet edit modal**: `PetEditModal.tsx` — two tabs (Basic Info + Health). Editable fields: name, breed, color, size, weight, height, allergies, medications, neutered status, behavior notes, special needs. Species and birthDate are read-only (locked after creation).
- **Photo management**: Upload via `POST /api/images/upload?type=pet` (multipart). Images stored in `pet_images` table (max 10 per pet, one primary enforced by partial unique index). SeaweedFS or local filesystem backing with LRU cache. Gallery with click-to-enlarge lightbox. Set-as-primary and delete controls on thumbnails.
- **Pet deletion**: `DeletePetModal` requires typing exact pet name + birth date to confirm. Calls `DELETE /api/pets/:id`. Database cascades delete all child rows (images, health records, access logs). Image files are orphaned on storage but DB references are cleaned.
- **Profile**: `PUT /api/auth/profile` saves CPF + phone for the authenticated user.
- **Age computation**: `computeAge(birthDate)` runs client-side from the birth date. On registration, the computed value is sent as `ageYears`. On the backend, `birthDate` is stored as `DATE` (scanned into `*time.Time`, marshals to RFC3339). `species` and `birthDate` are locked after creation (not in `updatePetRequest`).
- **Session restore**: `apiFetch` has a 401 interceptor that calls `refreshToken()` (deduplicated) and retries once. `authReady()` promise lets components await initial session check before firing API calls.

### Pet health security

- `PetHealthRecord` access is always audit-logged via `pet_health_access_log`.
- Owners always have access. Providers with a confirmed booking also have access.
- Error responses are sanitized — never include health data.
- `Vaccinations` uses `json.RawMessage` to avoid base64 encoding over the wire.
- When no health record exists, the backend returns empty arrays (`[]`) for `allergies`/`medications` to prevent frontend null-reference crashes.

### Database

- PostgreSQL with pgx driver via sqlx. Migrations live in `backend/migrations/` and are applied in filename order on startup, tracked by `schema_migrations`.
- Provider read queries use `providerSelectColumns` — a const so all scan paths (scanOne, scanRows) stay in lockstep with the SELECT list.
- Admin list queries use `adminSelectColumns` (with `p.` prefix) for LEFT JOIN with `users` to expose email + phone. They use a separate `scanAdminRows` that scans the extra user columns.

### Search (Typesense)

- Typesense holds a derived index of approved providers. PostgreSQL is source of truth. On approval: `IndexProvider`. On profile update: `IndexProvider`. On suspension: `DeleteProvider`. On review: `IndexProvider` (updates rating fields).
- If Typesense is unreachable, `ListProviders` falls back to PostgreSQL ILIKE transparently.
- `POST /api/admin/search/reindex` rebuilds the entire index from Postgres.

### Frontend

- Static Astro site; interactive components are React islands with `client:only="react"`.
- **Styling**: Tailwind CSS with custom theme tokens defined in `tailwind.config.mjs`:
  - `primary` / `primary-dark` / `primary-light` — teal brand palette
  - `cream` / `cream-tan` — warm neutral backgrounds
  - `footer` — dark brown (`#3B2315`)
  - `accent` — warm amber (`#F59E0B`)
  - `tag-*` — provider tag colors (notCastrated, castrated, dogs, cats)
  - Font families: `font-display` (Montserrat) for headings/CTAs, `font-sans` (Inter) for body
  - CSS custom properties mirroring these tokens are defined in `global.css` `:root` for runtime use
- **Focus rings**: Always use `focus-visible:` not `focus:` — focus rings must only appear on keyboard navigation, never on mouse clicks. Pattern: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`.
- **Reduced motion**: `global.css` includes `@media (prefers-reduced-motion: reduce)` that kills all animations/transitions. Don't duplicate this in components.
- **Fixed header offset**: `AppLayout.astro` provides `pt-20` on `<main>` (matching the 80px header). Components inside `<main>` must **not** add their own top padding to clear the header.
- **Skip-to-content**: `AppLayout.astro` renders a `.skip-to-content` link before the header — keyboard users can Tab to skip navigation. Uses `focus-visible:` (never `focus:`) so it never appears on mouse click.
- **Icons**: `react-icons` (Feather icon set — `react-icons/fi`). Usage: `import { FiX, FiSearch, FiMapPin } from 'react-icons/fi'`. Prefer react-icons over inline SVGs. Check [react-icons.github.io](https://react-icons.github.io) for available icons.
- API client in `services/api.ts`: in-memory access token, `apiFetch` adds `Authorization` header + `credentials: 'include'` for the httpOnly refresh cookie. On page reload, `Header.tsx` calls `auth.refresh()` to restore the session.
- Shared config in `utils/config.ts`: `API_URL` resolved from `PUBLIC_API_URL` env var (or defaults to `http://localhost:8080`). Import this instead of duplicating the resolution logic.
- i18n: 4 locales (en, es, pt, pt-BR) in `src/locales/{lang}/translation.json`. All four must have identical key sets. AuthForm and LoginModal must use the same i18n key names (they were forked; harmonised May 2026).
- **API response shapes**: `GET /api/providers` returns a `SearchResult` wrapper `{ providers: [...], total, page, perPage }` — NOT a bare array. Always extract `.providers` in the frontend. `GET /api/providers/:id` and `GET /api/providers/me` now include `galleryImages` array.
- **Provider logo images**: Use direct `<img src={API_URL}/api/images/{logoImageId}>` — do NOT use OptimizedImage for provider logos (its metadata roundtrip is fragile).
- **`Header.isActive()`**: stores `pathname + search` (not just pathname). Trailing slashes are normalised before comparison.

### Admin dashboard

- **Layout**: `AdminShell` wraps an `AdminSidebar` + content area. Hash-based routing (`#dashboard`, `#applications`, `#providers`) avoids page reloads. The sidebar collapses to 64px icons-only.
- **Panels**: `DashboardPanel` (stats + charts), `ApplicationsPanel` (pending queue), `ProvidersPanel` (searchable table). Each panel manages its own state and shares `AdminActionModal` + `ProviderDetailPopover`.
- **Charts**: `LineChart` renders SVG time-series with auto-scaled axes, grid lines, and legends. Used for provider growth charts (total + by service) with a range toggle (30d, 60d, 90d, ytd, all).
- **API**: `GET /api/admin/stats` returns aggregate counts; `GET /api/admin/stats/providers?range=...` returns cumulative time-series grouped by service.
- **Shared helpers**: `adminHelpers.ts` exports `statusClass`, `serviceLabel`, and `STATUS_TABS` — used by all admin panels.

### Service catalog

`frontend/src/utils/serviceCatalog.ts` is the single source of truth for the platform's 3 service types: `walking`, `training`, `boarding`. The search filter dropdown, provider registration form, Header nav links, and admin dashboard all consume this catalog. Adding a new service means adding it there and translating `services.catalog.<key>` in all four locales.

### User profile (owner)

- **Model**: `users` table extended with `bio`, `avatar_image_id`, `social_links` (JSONB) via migration `012_user_profile_fields.sql`.
- **Profile page**: `UserProfile.tsx` at `/account` — view/edit modes. Editable fields: phone, CPF, bio, avatar (upload via `type=avatar`), and 5 social platforms (LinkedIn, Instagram, Facebook, Twitter, Website).
- **Avatar images**: `type=avatar` added to the image upload endpoint — constraints: 100–1000px, 1 MB, JPEG/PNG.
- **Access control**:
  - **READ**: `GET /api/auth/profile` — self only (JWT). `GET /api/users/:id` — gated: self, admin, or provider with confirmed booking (`HasConfirmedBooking` check in `booking_repo.go`).
  - **WRITE**: `PUT /api/auth/profile` — self only (JWT). Dynamic field update via `UpdateProfile` repo method (only `phone`, `cpf`, `bio`, `avatar_image_id`, `social_links` allowed).
  - **DELETE**: `DELETE /api/auth/profile` — self only (JWT). Migration `013_user_delete_cascade.sql` fixes FK constraints so deletion cascades through pets, providers, bookings, reviews, refresh_tokens, pet_health_access_log. `provider_verification_audit.admin_id` and `providers.status_changed_by` are set to NULL on admin delete.
  - **CREATE**: via `POST /api/auth/signup` only — profile starts empty, owner fills it in later.
- **Frontend API**: `auth.getProfile()`, `auth.updateProfile(data)`, `auth.getUserProfile(userId)`, `auth.deleteProfile()`.

## Key files

| File | Purpose |
|------|---------|
| `backend/cmd/server/main.go` | Route registration, wiring |
| `backend/internal/handler/helpers.go` | `apiError`, `validationError`, `parseServiceError` |
| `backend/internal/service/auth_service.go` | Signup, login, refresh, logout, password reset, register-provider, update-profile |
| `backend/internal/service/pet_service.go` | Pet CRUD + health + images + delete with ownership enforcement; `verifyOwner` helper |
| `backend/internal/service/provider_service.go` | Apply, approve, reject, suspend, unsuspend, search sync |
| `backend/internal/service/admin_service.go` | Dashboard stats + provider growth time-series |
| `backend/internal/repository/postgres/pet_repo.go` | All pet + health queries; `petSelectColumns`, slug generation |
| `backend/internal/repository/postgres/provider_repo.go` | All provider queries; `providerSelectColumns`, `adminSelectColumns` |
| `backend/internal/repository/postgres/stats_repo.go` | Aggregate stats queries + provider growth time-series |
| `backend/internal/handler/pet.go` | Pet CRUD + health + image + delete handlers; `createPetRequest`, `updatePetRequest`, `updateHealthRequest` |
| `backend/internal/models/pet.go` | `Pet`, `PetHealthRecord`, `HealthAccessLog` structs |
| `backend/internal/models/pet_image.go` | `PetImage`, `AddImageRequest` structs |
| `backend/internal/middleware/auth.go` | JWT validation, role checks |
| `backend/migrations/006_pet_owner_fields.sql` | Extends pets, health_records, users for pet owner flow |
| `backend/migrations/007_pet_images.sql` | `pet_images` table with primary-photo enforcement |
| `backend/migrations/008_pet_health_access_log_cascade.sql` | ON DELETE CASCADE fix for health access log |
| `frontend/src/services/api.ts` | API client — types, `apiFetch`, auth, admin, providers, pets, bookings, images |
| `frontend/src/utils/config.ts` | Shared `API_URL` resolution from env var |
| `frontend/src/utils/serviceCatalog.ts` | Canonical service list + i18n keys |
| `frontend/src/utils/password.ts` | `evaluatePassword`, `generateStrongPassword` |
| `frontend/src/utils/adminHelpers.ts` | `statusClass`, `serviceLabel`, `STATUS_TABS` for admin panels |
| `frontend/tailwind.config.mjs` | Theme tokens (colors, fonts) + content paths |
| `frontend/src/styles/global.css` | CSS custom properties, `prefers-reduced-motion`, `.btn-primary`/`.btn-secondary`/`.card`/`.skip-to-content` utilities |
| `frontend/src/layouts/AppLayout.astro` | Skip-to-content link, header, `<main>` with `pt-20` offset, footer |
| `frontend/src/components/Header.tsx` | Nav bar with active-link detection, login modal trigger, account menu, session restore |
| `frontend/src/components/AdminShell.tsx` | Admin SPA shell — session restore, sidebar, hash routing |
| `frontend/src/components/AdminSidebar.tsx` | Collapsible sidebar with nav links |
| `frontend/src/components/DashboardPanel.tsx` | Stats cards, breakdown bars, provider growth line charts |
| `frontend/src/components/ApplicationsPanel.tsx` | Pending provider review queue |
| `frontend/src/components/ProvidersPanel.tsx` | Searchable/filterable all-providers table |
| `frontend/src/components/LineChart.tsx` | Reusable SVG line chart with axes + legend |
| `frontend/src/components/LoginModal.tsx` | Auth modal with Pet Owner / Provider signup tabs |
| `frontend/src/components/PetRegistrationForm.tsx` | Two-step pet registration wizard (pet info → health) |
| `frontend/src/components/PetDashboard.tsx` | Owner's pet list with photo cards, empty state, "+ Add Another Pet" |
| `frontend/src/components/PetRegistrationForm.tsx` | Two-step pet registration wizard (info → health + photo) |
| `frontend/src/components/PetDetailPage.tsx` | Read-only detail view with photo gallery, health, vet info, edit/delete buttons |
| `frontend/src/components/PetEditModal.tsx` | Two-tab edit modal (Basic Info + Health); species/birthDate locked |
| `frontend/src/components/DeletePetModal.tsx` | Deletion confirmation requiring pet name + birth date match |
| `frontend/src/pages/pets/index.astro` | Pet dashboard page at `/pets` |
| `frontend/src/pages/pets/add.astro` | Pet registration page at `/pets/add` |
| `frontend/src/pages/pets/detail.astro` | Pet detail page at `/pets/detail?petId=xxx` |
| `ADMIN_INSTRUCTIONS.md` | Full admin API reference + workflow docs |
| `backend/migrations/009_provider_document_image_id.sql` | Adds `document_image_id` for SeaweedFS doc uploads |
| `backend/migrations/010_provider_onboarding.sql` | Adds `provider_onboarding_tokens`, `provider_gallery_images`, service-preference columns |
| `backend/migrations/011_provider_company_name.sql` | Adds `company_name` to providers (legal vs trade name) |
| `backend/internal/handler/onboarding.go` | Onboarding token validate + complete endpoints |
| `backend/internal/handler/image.go` | Image upload/serve; `provider` uploads require onboarding token for abuse protection |
| `backend/internal/repository/postgres/onboarding_repo.go` | Onboarding token persistence (Save, GetByHash, Consume) |
| `frontend/src/components/ProviderOnboardingForm.tsx` | 5-step post-approval wizard (credentials → visual → prefs → about → contact); gallery max 15 |
| `frontend/src/components/ProviderPublicProfile.tsx` | Provider detail view at `/providers/detail?id=xxx` with share buttons; edit mode for own profile |
| `frontend/src/components/ProviderProfileEdit.tsx` | Inline edit form: logo, bio, location, services, social links, gallery management (max 15) |
| `backend/migrations/015_provider_social_links_and_rate_limits.sql` | Adds `social_links` JSONB, rate-limit tracking columns to providers |
| `frontend/src/components/ProviderDetailPopover.tsx` | Admin modal showing full provider application data, trade vs legal name |
| `frontend/src/pages/providers/setup.astro` | Onboarding form page at `/providers/setup?token=xxx` |
| `frontend/src/pages/providers/detail.astro` | Provider profile page at `/providers/detail?id=xxx` |
| `frontend/src/components/ProviderCarousel.tsx` | Auto-rolling infinite-scroll carousel, fetches 15 random providers, CSS keyframe animation |
| `frontend/src/components/ServicesSection.tsx` | 6-service grid (2×3) with i18n'd cards, links use canonical service codes |
| `backend/internal/service/search_service.go` | Typesense collection schema, providerToDoc/docToProvider with acceptance fields |
| `backend/internal/handler/auth.go` | Auth handlers: signup, login, refresh, logout, password reset, profile CRUD, user lookup (access-gated) |
| `backend/internal/service/auth_service.go` | Auth business logic: token issuance, password policy, profile update (dynamic), profile read/delete, user lookup |
| `backend/internal/repository/postgres/user_repo.go` | User persistence: CRUD, `UpdateProfile` (dynamic safe-column update), `Delete` with cascade |
| `backend/internal/handler/image.go` | Image upload/serve; accepts `type=avatar` (100–1000px, 1 MB) |
| `backend/migrations/012_user_profile_fields.sql` | Adds `bio`, `avatar_image_id`, `social_links` (JSONB) to users |
| `backend/migrations/013_user_delete_cascade.sql` | Fixes FK constraints so user deletion cascades/ SET NULL properly |
| `frontend/src/components/UserProfile.tsx` | Owner profile page with view/edit modes, avatar upload, social links management |
| `frontend/src/pages/account.astro` | User profile page at `/account` |
| `frontend/src/services/api.ts` | API client: `auth.getProfile`, `auth.updateProfile`, `auth.getUserProfile`, `auth.deleteProfile`, `SocialLinks` type |
