# Search — Typesense Design

## Why Typesense

Typesense is a purpose-built, single-binary search engine with typo-tolerance, faceting, and geo-search built in. It requires no JVM, no cluster management, and fits in ~150 MB RAM. The current `ListApproved` SQL query does `ILIKE` pattern matching on location and exact array membership on services — Typesense replaces that with ranked full-text search, instant facet counts, and eventual geo-radius filtering.

**FerretDB role after this change:** FerretDB was added specifically for provider full-text search. With Typesense handling that, FerretDB has no remaining purpose and should be removed from `docker-compose.yml` and `config.go` in the same PR as this feature.

---

## Service Topology Change

```
Before:
  GET /providers?service=&location=  →  PostgreSQL ILIKE query

After:
  GET /providers?q=&service=&sort=   →  Typesense index
                                         └── fallback: PostgreSQL ILIKE (if Typesense down)

Sync (write path):
  ApproveProvider   →  IndexProvider(provider)
  UpdateProfile     →  IndexProvider(provider)   [approved only]
  UpdateRating      →  IndexProvider(provider)   [rating/count fields]
  RejectProvider    →  (approved→rejected blocked by current rules; no delete needed)
  Admin reindex     →  Reindex(all approved)
```

PostgreSQL remains the **source of truth**. Typesense is a derived read index. If the index drifts, the admin reindex endpoint rebuilds it from PostgreSQL.

---

## Typesense Collection Schema

Collection name: `providers`

```json
{
  "name": "providers",
  "fields": [
    { "name": "id",            "type": "string" },
    { "name": "business_name", "type": "string" },
    { "name": "bio",           "type": "string",   "optional": true },
    { "name": "location",      "type": "string",   "optional": true },
    { "name": "services",      "type": "string[]", "facet": true },
    { "name": "avg_rating",    "type": "float" },
    { "name": "review_count",  "type": "int32" },
    { "name": "logo_image_id", "type": "string",   "optional": true, "index": false }
  ],
  "default_sorting_field": "avg_rating"
}
```

Only **approved** providers enter the index — status is not a field, it is an invariant of membership.

Search fields (ordered by relevance weight): `business_name`, `bio`, `location`.  
`services` and `logo_image_id` are not full-text searched; `services` is facet-only.

---

## API Changes

### GET /api/providers — updated query params

| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Full-text query across name, bio, location |
| `service` | string | Exact filter: `hospedagem`, `passeadores`, `adestradores` |
| `sort` | string | `rating` (default) or `reviews` |
| `page` | int | 1-based page number (default 1) |
| `per_page` | int | Results per page, max 50 (default 20) |

`limit`/`offset` params are **removed** — Typesense uses page-based pagination. The SQL fallback also switches to page-based to keep the contract consistent.

### Updated response shape

```json
{
  "providers": [ ...Provider objects... ],
  "total": 42,
  "page": 1,
  "perPage": 20,
  "facets": {
    "services": [
      { "value": "hospedagem",   "count": 15 },
      { "value": "passeadores",  "count": 12 },
      { "value": "adestradores", "count": 8  }
    ]
  }
}
```

`facets` is always returned and enables the frontend to render filter chips without a separate request.

### New admin endpoint

```
POST /api/admin/search/reindex
```

Triggers a full rebuild: fetches all approved providers from PostgreSQL and upserts them into Typesense. Returns `{ "indexed": N }`. Protected by the existing `jwtMw + RequireAdmin()` middleware chain.

---

## Go Design

### New files

```
internal/service/search_service.go       SearchService interface + Typesense implementation
internal/handler/search_handler.go       Admin reindex handler (one method)
```

### SearchService interface

```go
// SearchService manages the Typesense provider index.
type SearchService interface {
    SearchProviders(ctx context.Context, params SearchParams) (*SearchResult, error)
    IndexProvider(ctx context.Context, p *models.Provider) error
    DeleteProvider(ctx context.Context, id string) error
    Reindex(ctx context.Context, providers []models.Provider) error
}

type SearchParams struct {
    Query   string
    Service string
    SortBy  string // "rating" | "reviews"
    Page    int
    PerPage int
}

type SearchResult struct {
    Providers []models.Provider
    Total     int
    Page      int
    PerPage   int
    Facets    map[string][]FacetValue
}

type FacetValue struct {
    Value string `json:"value"`
    Count int    `json:"count"`
}
```

### ProviderService changes

`ProviderService` gains an optional `SearchService` field. Optional means: if `nil`, the service skips sync silently. This keeps tests and local runs without Typesense working.

```go
type ProviderService struct {
    providers postgres.ProviderRepository
    search    SearchService // nil = search disabled
}

func NewProviderService(providers postgres.ProviderRepository, search SearchService) *ProviderService {
    return &ProviderService{providers: providers, search: search}
}
```

`ListProviders` delegates to Typesense with a PostgreSQL fallback:

```go
func (s *ProviderService) ListProviders(ctx context.Context, params SearchParams) (*SearchResult, error) {
    if s.search != nil {
        result, err := s.search.SearchProviders(ctx, params)
        if err == nil {
            return result, nil
        }
        // log: "typesense unavailable, falling back to postgres"
    }
    // PostgreSQL fallback — returns SearchResult shape for API consistency
    providers, err := s.providers.ListApproved(ctx, toPostgresFilters(params))
    ...
}
```

`ApproveProvider` syncs after the DB write:

```go
func (s *ProviderService) ApproveProvider(ctx context.Context, id, adminID string) error {
    ...
    if err := s.providers.UpdateStatus(ctx, id, "approved", adminID, ""); err != nil {
        return err
    }
    if s.search != nil {
        provider, _ := s.providers.GetByID(ctx, id)
        _ = s.search.IndexProvider(ctx, provider) // best-effort; log on failure
    }
    return nil
}
```

`UpdateProfile` and `ReviewService.RecalculateRating` follow the same pattern: write to PostgreSQL first, then sync to Typesense as a best-effort call.

### ReviewService changes

`ReviewService` gains the same optional `SearchService` field. After `UpdateRating` succeeds, it fetches the updated provider and calls `IndexProvider` to keep `avg_rating` and `review_count` current in Typesense.

---

## Docker Compose Addition

Typesense is added to the **default** stack (not behind a profile) because it replaces the existing search path.

```yaml
typesense:
  image: typesense/typesense:27.1
  container_name: pata_cao_typesense
  restart: unless-stopped
  ports:
    - "8108:8108"
  command: >
    --data-dir /data
    --api-key  ${TYPESENSE_API_KEY:-dev-api-key}
    --enable-cors
  volumes:
    - typesense_data:/data
  healthcheck:
    test: ["CMD-SHELL", "curl -sf http://localhost:8108/health || exit 1"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 15s
```

Backend gains two new env vars:

```yaml
TYPESENSE_URL:     http://typesense:8108
TYPESENSE_API_KEY: dev-api-key
```

`docker-compose.yml` volumes block gets `typesense_data: { driver: local }`.

---

## Configuration

Two new fields in `config.go`:

```go
TypesenseURL    string   // TYPESENSE_URL,     default ""
TypesenseAPIKey string   // TYPESENSE_API_KEY, default ""
```

If `TypesenseURL` is empty, `main.go` passes `nil` as the `SearchService` argument — search falls back to PostgreSQL, no crash.

`.env.example` additions:

```env
# Typesense (required for full-text search; falls back to Postgres if unset)
TYPESENSE_URL=http://localhost:8108
TYPESENSE_API_KEY=dev-api-key
```

---

## Dependency

```bash
go get github.com/typesense/typesense-go@latest
```

---

## What Gets Removed

| What | Why |
|------|-----|
| `ferretdb` service in docker-compose | Replaced by Typesense |
| `FERRETDB_URI` in config + compose | No longer needed |
| `FerretDBURI` field in `Config` | Dead config |
| `ProviderFilters.Service/Location` string params on handler | Replaced by `SearchParams` |

FerretDB removal should happen in the same PR to avoid keeping dead infrastructure.

---

## Rollout Order

1. Add Typesense to `docker-compose.yml`, add config fields — verify `docker compose up` still works with `TYPESENSE_URL` unset (fallback to Postgres).
2. Implement `SearchService` (Typesense client, collection bootstrap on startup).
3. Wire sync into `ProviderService.ApproveProvider` and `UpdateProfile`.
4. Wire rating sync into `ReviewService`.
5. Update `ListProviders` to delegate to `SearchService` with fallback.
6. Add admin reindex endpoint.
7. Update `GET /providers` query params and response shape (breaking change — coordinate with frontend).
8. Remove FerretDB.
