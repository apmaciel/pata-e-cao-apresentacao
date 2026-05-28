# Running SeaweedFS Locally

SeaweedFS is opt-in. The default stack uses local filesystem storage — no extra steps needed for basic development.

## Default (local storage)

```bash
docker compose up
```

Images are stored on the `backend_images` named volume at `/app/data/images` inside the backend container.

## With SeaweedFS

**1. Start the full stack including SeaweedFS:**

```bash
docker compose --profile seaweedfs up
```

This adds a `pata_cao_seaweedfs` container running master + volume + filer in one process.

| Port | Component |
|------|-----------|
| `8888` | Filer HTTP API (backend reads/writes here) |
| `9333` | Master (optional, for `weed shell` admin access) |

**2. Switch the backend to use SeaweedFS:**

Create `backend/.env` (copy from `backend/.env.example`) and set:

```env
IMAGE_STORAGE_TYPE=seaweedfs
```

The `SEAWEEDFS_URL` is already configured to `http://seaweedfs:8888` inside the compose network — no changes needed there.

**3. Restart the backend to pick up the new env var:**

```bash
docker compose --profile seaweedfs up --build backend
```

## How it works

- **Uploads** (`POST /api/images/upload`) — HTTP PUT to `http://seaweedfs:8888/<imageID>`
- **Reads** (`GET /api/images/*`) — checks in-memory LRU first, then HTTP GET from `http://seaweedfs:8888/<imageID>`
- **Cache invalidation** (`POST /api/admin/cache/invalidate`) — evicts entries from the LRU; next read re-fetches from SeaweedFS

## Verifying SeaweedFS is up

```bash
curl http://localhost:8888/
# should return an HTML directory listing (HTTP 200)
```

## Switching back to local storage

Remove or comment out `IMAGE_STORAGE_TYPE=seaweedfs` in `backend/.env` (or set it to `local`), then restart the backend without the profile:

```bash
docker compose up
```
