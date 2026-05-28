package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all application configuration loaded from environment variables.
type Config struct {
	// Server
	Port            string
	ShutdownTimeout time.Duration

	// Database
	DatabaseURL string

	// JWT
	JWTSecret        string
	JWTAccessExpiry  time.Duration
	JWTRefreshExpiry time.Duration

	// Cookie security (set true behind HTTPS; false for local dev)
	CookieSecure bool

	// Frontend origin used to build password-reset URLs sent in emails.
	// Defaults to the first allowed CORS origin so local dev works zero-config.
	FrontendURL string

	// Password reset token TTL (set via env, default 1h).
	PasswordResetTTL time.Duration

	// DevMode flips on dev-only conveniences (e.g. returning the recovery
	// link in the JSON response so engineers can test without a mail relay).
	// Mirrors the inverse of CookieSecure: production sets COOKIE_SECURE=true.
	DevMode bool

	// AdminEmails is the comma-separated allowlist that grants admin
	// privileges. Matching is case-insensitive; whitespace around entries is
	// trimmed. A user matching an entry has their role promoted to "admin"
	// at token-issuance time — the DB record is untouched.
	AdminEmails map[string]struct{}

	// Rate limiting
	RateLimitRequests int
	RateLimitWindow   time.Duration

	// Image storage
	ImageStorageType string // "local" or "seaweedfs"
	ImageStoragePath string
	SeaweedFSURL     string

	// Typesense (full-text provider search; empty URL disables search and
	// falls back to PostgreSQL ILIKE queries)
	TypesenseURL    string
	TypesenseAPIKey string

	// LRU cache
	LRUCacheSize int

	// CORS
	CORSOrigins string
}

// Load reads .env if present, then validates and returns the config.
func Load() (*Config, error) {
	// Best-effort .env load; ignore error if file doesn't exist.
	_ = godotenv.Load()

	cfg := &Config{}

	// Server
	cfg.Port = getEnv("PORT", "8080")
	shutdownSecs, err := strconv.Atoi(getEnv("SHUTDOWN_TIMEOUT_SECS", "30"))
	if err != nil {
		return nil, fmt.Errorf("invalid SHUTDOWN_TIMEOUT_SECS: %w", err)
	}
	cfg.ShutdownTimeout = time.Duration(shutdownSecs) * time.Second

	// Database
	cfg.DatabaseURL = os.Getenv("DATABASE_URL")
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("required env var DATABASE_URL is not set")
	}

	// JWT
	cfg.JWTSecret = os.Getenv("JWT_SECRET")
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("required env var JWT_SECRET is not set")
	}
	accessMins, err := strconv.Atoi(getEnv("JWT_ACCESS_EXPIRY_MINS", "15"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_ACCESS_EXPIRY_MINS: %w", err)
	}
	cfg.JWTAccessExpiry = time.Duration(accessMins) * time.Minute

	refreshDays, err := strconv.Atoi(getEnv("JWT_REFRESH_EXPIRY_DAYS", "30"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_REFRESH_EXPIRY_DAYS: %w", err)
	}
	cfg.JWTRefreshExpiry = time.Duration(refreshDays) * 24 * time.Hour

	cfg.CookieSecure = getEnv("COOKIE_SECURE", "false") == "true"

	resetMins, err := strconv.Atoi(getEnv("PASSWORD_RESET_EXPIRY_MINS", "60"))
	if err != nil {
		return nil, fmt.Errorf("invalid PASSWORD_RESET_EXPIRY_MINS: %w", err)
	}
	cfg.PasswordResetTTL = time.Duration(resetMins) * time.Minute

	cfg.FrontendURL = getEnv("FRONTEND_URL", "http://localhost:3000")
	cfg.DevMode = !cfg.CookieSecure

	cfg.AdminEmails = parseAdminEmails(getEnv("ADMIN_EMAILS", ""))

	// Rate limiting
	rlReqs, err := strconv.Atoi(getEnv("RATE_LIMIT_REQUESTS", "100"))
	if err != nil {
		return nil, fmt.Errorf("invalid RATE_LIMIT_REQUESTS: %w", err)
	}
	cfg.RateLimitRequests = rlReqs

	rlWindowSecs, err := strconv.Atoi(getEnv("RATE_LIMIT_WINDOW_SECS", "60"))
	if err != nil {
		return nil, fmt.Errorf("invalid RATE_LIMIT_WINDOW_SECS: %w", err)
	}
	cfg.RateLimitWindow = time.Duration(rlWindowSecs) * time.Second

	// Image storage
	cfg.ImageStorageType = getEnv("IMAGE_STORAGE_TYPE", "local")
	cfg.ImageStoragePath = getEnv("IMAGE_STORAGE_PATH", "/data/images")
	cfg.SeaweedFSURL = getEnv("SEAWEEDFS_URL", "")

	// Typesense
	cfg.TypesenseURL = getEnv("TYPESENSE_URL", "")
	cfg.TypesenseAPIKey = getEnv("TYPESENSE_API_KEY", "")

	// LRU cache
	lruSize, err := strconv.Atoi(getEnv("LRU_CACHE_SIZE", "512"))
	if err != nil {
		return nil, fmt.Errorf("invalid LRU_CACHE_SIZE: %w", err)
	}
	cfg.LRUCacheSize = lruSize

	// CORS
	cfg.CORSOrigins = getEnv("CORS_ORIGINS", "*")

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// parseAdminEmails splits the comma-separated ADMIN_EMAILS env value into a
// lowercased set for O(1) lookup. Blank entries are dropped. Returns a non-nil
// empty map when the input is empty so callers can lookup without nil checks.
func parseAdminEmails(raw string) map[string]struct{} {
	out := make(map[string]struct{})
	for _, e := range strings.Split(raw, ",") {
		e = strings.ToLower(strings.TrimSpace(e))
		if e != "" {
			out[e] = struct{}{}
		}
	}
	return out
}

// IsAdminEmail reports whether the given email is in the admin allowlist.
// Matching is case-insensitive and ignores surrounding whitespace.
func (c *Config) IsAdminEmail(email string) bool {
	if len(c.AdminEmails) == 0 {
		return false
	}
	_, ok := c.AdminEmails[strings.ToLower(strings.TrimSpace(email))]
	return ok
}
