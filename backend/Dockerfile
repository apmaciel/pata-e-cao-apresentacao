# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

WORKDIR /build

# Cache dependencies first.
COPY go.mod go.sum ./
RUN go mod download

# Copy only the directories needed for the build (explicit paths avoid
# Windows Docker Desktop silently filtering directories like "cmd/").
COPY cmd/         ./cmd/
COPY internal/    ./internal/
COPY migrations/  ./migrations/
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server ./cmd/server/

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM alpine:3.19

# Install CA certificates for HTTPS outbound calls (SeaweedFS, etc.).
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/server ./server
COPY migrations/ ./migrations/

EXPOSE 8080

CMD ["/app/server"]
