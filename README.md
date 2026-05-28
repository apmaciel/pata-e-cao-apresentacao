# PATA & CÃO

A unified pet services platform connecting pet owners with trusted providers (boarding, dog walkers, trainers) in one place.

## Problem

Pet owners face fragmentation: jumping between apps to find safe boarding, qualified walkers, and certified trainers. There's no single source of truth for provider verification, making it hard to trust who you're leaving your pet with.

## Solution

PATA & CÃO is an all-in-one marketplace with:
- **Verified providers** (background checks, certifications, references)
- **Centralized pet profiles** (health records, special needs, medical history)
- **Trust signals** (reviews, ratings, response times)
- **One-click booking** (calendar, confirmation, real-time updates)

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React + Astro | Astro for static generation, React for interactive UIs |
| **Backend** | Golang + Echo | Type-safe, high-performance, excellent concurrency |
| **Relational DB** | PostgreSQL | Transactional safety for bookings & verification |
| **Search** | Typesense | Full-text, faceted, typo-tolerant provider search; single binary, no JVM |
| **Internationalization** | react-i18next | Multi-language support (Spanish, Portuguese, Brazilian Portuguese) |
| **Image Storage** | SeaweedFS | Distributed object storage with multi-layer caching & S3-compatible API |

---

## Project Structure

```
pata-e-cao/
├── frontend/                     # React + Astro
│   ├── src/
│   │   ├── pages/               # Astro pages (routes)
│   │   ├── components/          # React components
│   │   │   ├── SearchProvider/
│   │   │   ├── PetProfile/
│   │   │   ├── BookingFlow/
│   │   │   ├── LanguageSelector/
│   │   │   └── ...
│   │   ├── locales/             # i18n translations
│   │   │   ├── es/
│   │   │   │   └── translation.json       # Spanish
│   │   │   ├── pt/
│   │   │   │   └── translation.json       # Portuguese (Portugal)
│   │   │   ├── pt-BR/
│   │   │   │   └── translation.json       # Brazilian Portuguese
│   │   │   └── en/
│   │   │       └── translation.json       # English (reference)
│   │   ├── services/            # API client
│   │   ├── i18n.config.ts       # i18n configuration
│   │   └── layouts/
│   ├── astro.config.mjs
│   ├── package.json
│   └── .env.example
│
├── backend/                      # Golang + Echo
│   ├── cmd/
│   │   └── server/
│   │       └── main.go          # Entry point
│   ├── internal/
│   │   ├── models/              # Data models
│   │   │   ├── user.go
│   │   │   ├── pet.go
│   │   │   ├── provider.go
│   │   │   ├── booking.go
│   │   │   └── review.go
│   │   ├── handler/             # HTTP handlers
│   │   │   ├── auth.go
│   │   │   ├── provider.go
│   │   │   ├── booking.go
│   │   │   └── ...
│   │   ├── service/             # Business logic
│   │   │   ├── provider_service.go
│   │   │   ├── booking_service.go
│   │   │   ├── search_service.go    # Typesense provider index
│   │   │   └── ...
│   │   ├── repository/          # Data access
│   │   │   └── postgres/
│   │   ├── middleware/          # Auth, validation
│   │   └── config/
│   ├── migrations/              # PostgreSQL migrations
│   ├── tests/
│   ├── go.mod
│   ├── go.sum
│   ├── Dockerfile
│   └── .env.example
│
├── docs/
│   ├── API.md                   # API endpoints
│   ├── ARCHITECTURE.md          # System design
│   ├── SEARCH.md                # Typesense search design
│   └── SECURITY.md              # Security guidelines
│
├── SKILL.md                      # Development workflow (team skill)
├── .github/
│   └── workflows/               # CI/CD pipelines
├── docker-compose.yml           # Local dev environment
├── .gitignore
└── README.md
```

---

## Getting Started

> **Docker Compose is the supported way to run PATA & CÃO locally.** It boots
> PostgreSQL (with schema auto-loaded), Typesense, the Go backend, and the
> Astro/React frontend in one command — matching how the services talk to
> each other in production. Use the local-toolchain path only when you're
> actively iterating on a single service.

### Prerequisites

- **Docker Desktop / Docker Engine** with Compose v2 (`docker compose ...`)
- (Optional, only for the local-toolchain path) Node.js 18+, Go 1.22+

### 1. Clone & start the stack

```bash
git clone https://github.com/your-org/pata-e-cao.git
cd pata-e-cao

# Boot Postgres, Typesense, backend, frontend
docker compose up -d

# Watch logs (optional)
docker compose logs -f backend
```

Then visit:

- Frontend  → http://localhost:3000
- Backend   → http://localhost:8080/api
- Typesense → http://localhost:8108/health

The first boot pulls images. On startup the backend applies migrations from
`backend/migrations/` against Postgres (tracked in the `schema_migrations`
table, so re-runs are idempotent). Subsequent boots are seconds.

### 2. Configure overrides (optional)

All required env vars are baked into `docker-compose.yml` with safe dev
defaults. The one variable you should override for any non-throwaway use is
`JWT_SECRET` — drop a `backend/.env` next to `backend/.env.example`:

```env
JWT_SECRET=<32+ char secret — generate with: openssl rand -hex 32>
```

`backend/.env` is mounted into the backend container at build time; anything
you put there overrides the defaults in `docker-compose.yml`.

### 3. Common commands

```bash
docker compose up -d                # start in background
docker compose ps                   # see service status + health
docker compose logs -f <service>    # tail logs (backend|frontend|postgres|typesense)
docker compose restart backend      # restart a single service
docker compose down                 # stop everything (preserves volumes)
docker compose down -v              # stop + wipe data (Postgres, Typesense, images)
```

To rebuild the backend or frontend image after a code change:

```bash
docker compose up -d --build backend
```

### 4. Image storage (optional)

By default the backend stores uploaded images to a local volume
(`IMAGE_STORAGE_TYPE=local`). To exercise the SeaweedFS path locally, start
the `seaweedfs` profile:

```bash
docker compose --profile seaweedfs up -d
# then set IMAGE_STORAGE_TYPE=seaweedfs in backend/.env and restart backend
```

### Running without Docker (advanced)

If you need to attach a debugger to the backend or run the Astro dev server
with hot reload, you can run individual services on the host while keeping
Postgres and Typesense in Compose:

```bash
docker compose up -d postgres typesense       # infra only

cd backend && go run cmd/server/main.go       # terminal 1
cd frontend && npm install && npm run dev     # terminal 2
```

Make sure `backend/.env` points at the host-exposed ports
(`DATABASE_URL=postgres://postgres:dev@localhost:5432/pata_cao?sslmode=disable`,
`TYPESENSE_URL=http://localhost:8108`).

---

## Languages Supported

PATA & CÃO is fully internationalized (i18n) with support for:
- 🇪🇸 **Spanish** (`es`)
- 🇵🇹 **Portuguese** (`pt`)
- 🇧🇷 **Brazilian Portuguese** (`pt-BR`)
- 🇬🇧 **English** (`en`) — fallback/reference

Users can:
- Auto-detect language based on browser settings
- Manually select language via dropdown
- Language preference persisted to browser localStorage

### Translation Workflow

**For Developers:**
1. All user-facing text goes in `frontend/src/locales/{lang}/translation.json`
2. Use `useTranslation()` hook in React components
3. Wrap strings: `const { t } = useTranslation(); <h1>{t('pet.addPet')}</h1>`
4. Add translations for all 4 languages before submitting PR
5. Run i18n linter to detect untranslated strings

**For Translators:**
- Translation files are simple JSON key-value files
- Namespace: `translation.json` organized by feature (pet, provider, booking, common, errors)
- Each language file must have identical keys
- Date/currency formatting handled by locale-aware functions

See `SKILL.md` → Internationalization Guide for detailed setup instructions.

---

## Image Asset Storage

Partner images are **decoupled from the site** using **SeaweedFS** (distributed object storage) with intelligent multi-layer caching:

| Layer | Storage | Duration | Purpose |
|-------|---------|----------|---------|
| Browser | LocalStorage + ServiceWorker | 30 days | Client-side caching |
| Server | In-memory LRU/Redis cache | 7 days | Reduce SeaweedFS fetches |
| CDN | CloudFlare (future) | 90 days | Global distribution |

### How It Works

1. **Partner Images Stored in SeaweedFS**: Distributed object storage, S3-compatible API
2. **Backend API**: `/api/images/{imageId}` returns image + cache headers
3. **Frontend Component**: `<OptimizedImage>` handles lazy loading & fallbacks
4. **Service Worker**: Pre-caches critical images (logos, placeholders)
5. **Direct S3 Access**: Optional direct browser uploads to SeaweedFS (with signed URLs)

### SeaweedFS Architecture

```
SeaweedFS Master (cluster coordinator)
  ├── Volume Servers (data storage, replication)
  ├── Filer (directory structure & metadata)
  └── S3 API Gateway (S3-compatible endpoint)

Access patterns:
1. Through Backend API: Browser → Backend → SeaweedFS
2. Direct Upload: Browser → SeaweedFS (signed URL)
3. Direct Download: Browser → SeaweedFS CDN Cache
```

### Usage in Components

```typescript
import { OptimizedImage } from '@/components/OptimizedImage';

export function ProviderCard({ providerId }) {
  return (
    <OptimizedImage
      imageId={`provider-${providerId}/logo`}
      alt="Provider Logo"
      width={200}
      height={100}
    />
  );
}
```

**Full documentation:** See `docs/IMAGES.md` for SeaweedFS setup, caching strategy, and API integration.

---

## Key Features

### Phase 1: MVP (Provider Verification + Pet Profiles)
- [x] User authentication (signup, login, password reset)
- [x] Pet profile creation with health records, photo gallery, vaccination tracking
- [x] Provider registration & verification workflow
- [x] Admin dashboard for provider approval (stats, charts, audit trail)
- [x] Provider onboarding wizard (5-step post-approval profile setup)
- [x] Provider public profiles with share buttons
- [x] Full-text search with Typesense (facets, typo-tolerance, Postgres fallback)

### Phase 2: Booking & Trust (Booking System + Reviews)
- [ ] Real-time availability & booking flow
- [ ] Review system post-booking
- [ ] Provider badges (verified, trusted, responsive)
- [ ] Payment integration
- [ ] Proximity/location search (PostGIS)

### Phase 3: Scale (Recommendations + Notifications)
- [ ] Event-driven notification engine (transactional outbox)
- [ ] Vaccine expiration alerts
- [ ] Recommendation engine based on pet needs
- [ ] Advanced filtering (location, price, availability)

---

## API Overview

Base URL: `http://localhost:8080/api`

### Authentication
- `POST /auth/signup` - Register user
- `POST /auth/login` - Login
- `POST /auth/refresh` - Refresh JWT token

### Pet Management
- `GET /pets` - List user's pets
- `POST /pets` - Create pet profile
- `GET /pets/:id` - Get pet details (with health records)
- `PUT /pets/:id` - Update pet info

### Provider Management
- `GET /providers?q=&service=&sort=&page=&per_page=` - Search providers (Typesense-powered)
- `GET /providers/:id` - Get provider details (public)
- `GET /providers/me` - Get authenticated provider's own profile
- `POST /providers/register` - Register as provider (public, combined signup + apply)
- `POST /providers/apply` - Apply as provider (existing user)
- `POST /providers/onboarding/validate` - Validate onboarding token
- `POST /providers/onboarding/complete` - Complete onboarding profile setup

### Admin
- `GET /admin/stats` - Dashboard aggregate counts
- `GET /admin/stats/providers?range=` - Provider growth time-series
- `GET /admin/stats/pets/species` - Pet species distribution
- `GET /admin/stats/pets/ages` - Pet age distribution
- `GET /admin/providers?status=&search=` - List all providers (paginated)
- `GET /admin/providers/pending` - Pending review queue
- `POST /admin/providers/:id/approve` - Approve provider (returns onboarding token)
- `POST /admin/providers/:id/reject` - Reject provider
- `POST /admin/providers/:id/suspend` - Suspend provider
- `POST /admin/providers/:id/unsuspend` - Unsuspend provider
- `POST /admin/providers/:id/regenerate-token` - Regenerate onboarding token
- `DELETE /admin/providers/:id` - Delete rejected provider
- `POST /admin/search/reindex` - Rebuild Typesense index

### Images
- `GET /images/*` - Serve images (public, with LRU cache)
- `POST /images/upload?type=pet|document|provider` - Upload image

### Bookings
- `POST /bookings` - Create booking
- `GET /bookings` - List user's bookings
- `PUT /bookings/:id/confirm` - Confirm booking
- `PUT /bookings/:id/cancel` - Cancel booking

### Reviews
- `POST /reviews` - Submit review post-booking
- `GET /providers/:id/reviews` - Get provider reviews

**Full API docs:** See `docs/API.md`

---

## Testing

```bash
# Backend unit tests
cd backend
go test ./...

# Backend integration tests (requires running databases)
go test -tags=integration ./...

# Frontend unit tests
cd frontend
npm run test

# Frontend E2E tests
npm run test:e2e

# Run all tests
npm run test:all
```

---

## Security

Security is critical for a pet services platform. Key safeguards:

- **Pet health data**: Never logged, audit-trailed access
- **Provider verification**: Immutable after approval, background check integration
- **Payment**: PCI compliance (payment processor handles)
- **Auth**: JWT tokens, rate-limited endpoints

See `docs/SECURITY.md` for full security guidelines.

---

## Deployment — Amazon EKS

> **PATA & CÃO targets Amazon EKS for staging and production.** The Compose
> stack you run locally maps cleanly onto Kubernetes: the same backend and
> frontend container images run unchanged, PostgreSQL and image storage move
> to AWS managed services, and Typesense runs in-cluster as a stateful
> workload. Kubernetes manifests live under `deploy/k8s/` (added incrementally
> — see `docs/ARCHITECTURE.md` for the rollout plan).

### Target architecture

```
                    ┌─────────────────────────────┐
                    │      Route 53 + ACM TLS     │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  AWS ALB (Ingress, AWS LB   │
                    │  Controller)                │
                    └───────┬──────────────┬──────┘
                            │              │
                  ┌─────────▼────┐  ┌──────▼──────────┐
                  │ frontend     │  │ backend         │
                  │ (Astro/nginx)│  │ (Go/Echo)       │
                  │ Deployment   │  │ Deployment      │
                  └──────────────┘  └─┬─────────┬─────┘
                                      │         │
                          ┌───────────┘         └────────────────┐
                          │                                      │
                ┌─────────▼─────────┐               ┌────────────▼──────────┐
                │ typesense         │               │ Amazon RDS PostgreSQL │
                │ StatefulSet + EBS │               │ (Multi-AZ in prod)    │
                │ PVC               │               └───────────────────────┘
                └───────────────────┘
                                      │
                              ┌───────▼────────┐
                              │ Amazon S3      │
                              │ (provider/pet  │
                              │  image bucket) │
                              └────────────────┘
```

### Component mapping

| Local (Compose) | EKS / AWS |
|-----------------|-----------|
| `postgres` container | **Amazon RDS for PostgreSQL** (Multi-AZ in prod, single-AZ in staging). Connection string injected via External Secrets. |
| `typesense` container | **In-cluster `StatefulSet`** with an EBS-backed `PersistentVolumeClaim`. One replica per environment; rebuildable from Postgres via `POST /api/admin/search/reindex`. |
| `seaweedfs` profile / local image dir | **Amazon S3** bucket. The image service runs in `IMAGE_STORAGE_TYPE=s3` mode (adapter sits alongside the existing `local` / `seaweedfs` modes). IRSA grants the backend pod scoped `s3:GetObject` / `s3:PutObject`. |
| `backend` container | **`Deployment`** behind a `ClusterIP` Service. HPA on CPU + request rate. Image pulled from **Amazon ECR**. |
| `frontend` container | **`Deployment`** serving the static Astro bundle through nginx. Stateless — scale horizontally. |
| `docker-compose.yml` env block | **Kubernetes `Secret`s materialized by [External Secrets Operator](https://external-secrets.io/)** from **AWS Secrets Manager** (`JWT_SECRET`, `TYPESENSE_API_KEY`, RDS password, S3 access keys if not using IRSA). |
| n/a | **AWS Load Balancer Controller** terminates TLS at the ALB using an **ACM** certificate; `Ingress` resources annotate the target groups. |

### Build & release flow

```
PR merged to main
    │
    ▼
GitHub Actions  ─►  build & test  ─►  docker build (backend, frontend)
    │                                       │
    ▼                                       ▼
                            push to Amazon ECR (immutable tags = git SHA)
    │
    ▼
ArgoCD watches deploy/k8s/  ─►  syncs updated image tags to EKS
    │
    ▼
Rolling update of backend / frontend Deployments
    │
    ▼
Post-deploy hook: POST /api/admin/search/reindex   (Typesense rebuild)
```

### Operational notes

- **Search index is rebuildable.** Typesense is treated as a derived index;
  PostgreSQL is the source of truth. After a cluster rebuild, full DR, or
  index corruption, the admin reindex endpoint repopulates it from Postgres
  — no separate backup pipeline needed for the search collection itself.
- **No secrets in the cluster, ever.** Every value the backend reads from env
  comes from AWS Secrets Manager via External Secrets. Manifests in
  `deploy/k8s/` reference `ExternalSecret` resources, never raw `Secret`s.
- **Pod identity.** Backend pods assume an IAM role via **IRSA** for S3 and
  Secrets Manager access — no static AWS credentials in env or files.
- **Observability.** Container logs ship to CloudWatch Logs; metrics scraped
  by Prometheus / Amazon Managed Prometheus and visualized in Grafana.
  Alerts on: provider verification queue depth, Typesense unavailability
  (forces Postgres fallback), failed image uploads, p95 latency on
  `/api/providers`.
- **Cost guardrails.** Typesense `StatefulSet` is sized at 1 vCPU / 1 GiB in
  staging; production runs 2 vCPU / 2 GiB. RDS uses graviton instances
  (`db.t4g.*` in staging, `db.r6g.*` in prod).

### Bootstrapping a new environment (high-level)

1. **Network & cluster.** Terraform creates the VPC, EKS cluster, node group,
   ECR repositories, RDS instance, and S3 bucket.
2. **Cluster add-ons.** Install AWS Load Balancer Controller, External
   Secrets Operator, cert-manager (if not using ACM end-to-end), and the
   EBS CSI driver.
3. **Secrets.** Seed `JWT_SECRET`, `TYPESENSE_API_KEY`, and the RDS
   credentials in AWS Secrets Manager.
4. **Argo CD.** Point Argo at `deploy/k8s/overlays/<env>/`; it applies the
   manifests, which trigger image pulls and pod startup.
5. **Smoke test.** `GET /health` on the backend, `GET /` on the frontend,
   and `POST /api/admin/search/reindex` to populate Typesense.

> Full step-by-step runbook (Terraform modules, eksctl alternatives, secret
> rotation procedures, blue/green deploy strategy) lives in
> `docs/DEPLOYMENT.md` — not yet written; track in the deploy epic.

---

## Contributing

1. Create feature branch: `git checkout -b feat/provider-verification`
2. Follow the PATA & CÃO Development Skill workflow
3. Run tests locally before pushing
4. Submit PR with test results & security checklist
5. Request review from team

### Commit Conventions

All commits must follow the format `<type>: <subject>`, e.g. `feat: add provider search endpoint`.

Conventions based on [padroes-de-commits](https://github.com/iuricode/padroes-de-commits):

| Type | Emoji | When to use |
|------|-------|-------------|
| `feat` | ✨ | A new feature |
| `fix` | 🐛 | A bug fix |
| `docs` | 📚 | Documentation changes only |
| `test` | 🧪 | Adding or updating tests |
| `build` | 📦 | Changes to build files or dependencies |
| `perf` | ⚡ | Performance improvements |
| `style` | 👌 | Code formatting, no logic change |
| `refactor` | ♻️ | Code restructuring without changing behavior |
| `chore` | 🔧 | Maintenance tasks, tooling, config |
| `ci` | 🧱 | CI/CD pipeline changes |
| `raw` | 🗃️ | Changes to configuration files or data |
| `cleanup` | 🧹 | Removing commented-out code or dead snippets |
| `remove` | 🗑️ | Deleting obsolete files or dependencies |

**Examples:**
```
feat: add typesense provider search with facets
fix: prevent double-booking on concurrent requests
docs: update search architecture in SEARCH.md
refactor: extract image validation into separate service
chore: bump typesense-go to v2
```

---

## Support

- **Questions?** Check `docs/` folder
- **Bug report?** GitHub Issues
- **Security issue?** Email security@pata-cao.local (don't open public issue)

---

## Team

Built by the PATA & CÃO team.

---

**Last Updated:** 2026-05-20
