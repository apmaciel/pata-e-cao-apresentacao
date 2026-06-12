package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config contém todas as configurações da aplicação carregadas de variáveis de ambiente.
type Config struct {
	// Servidor
	Port            string
	ShutdownTimeout time.Duration

	// Banco de dados
	DatabaseURL string

	// JWT
	JWTSecret        string
	JWTAccessExpiry  time.Duration
	JWTRefreshExpiry time.Duration

	// Segurança de cookie (true atrás de HTTPS; false para dev local)
	CookieSecure bool

	// Origem do frontend usada para construir URLs de redefinição de senha nos emails.
	// Padrão é a primeira origem CORS permitida para dev local sem configuração.
	FrontendURL string

	// TTL do token de redefinição de senha (via env, padrão 1h).
	PasswordResetTTL time.Duration

	// DevMode ativa conveniências de desenvolvimento (ex.: retornar o link
	// de recuperação na resposta JSON para testes sem relay de email).
	// Espelha o inverso de CookieSecure: produção define COOKIE_SECURE=true.
	DevMode bool

	// AdminEmails é a lista de permissão separada por vírgulas que concede
	// privilégios de admin. A comparação é case-insensitive; espaços ao redor
	// são removidos. Um usuário correspondente tem seu papel promovido para
	// "admin" no momento da emissão do token — o registro no BD não é alterado.
	AdminEmails map[string]struct{}

	// Rate limiting
	RateLimitRequests int
	RateLimitWindow   time.Duration

	// Armazenamento de imagens
	ImageStorageType string // "local" ou "seaweedfs"
	ImageStoragePath string
	SeaweedFSURL     string

	// Typesense (busca full-text de prestadores; URL vazia desabilita busca e
	// usa queries ILIKE do PostgreSQL como fallback)
	TypesenseURL    string
	TypesenseAPIKey string

	// Cache LRU
	LRUCacheSize int

	// CORS
	CORSOrigins string
}

// Load lê o .env se presente, depois valida e retorna a config.
func Load() (*Config, error) {
	// Carrega .env no melhor esforço; ignora erro se arquivo não existir.
	_ = godotenv.Load()

	cfg := &Config{}

	// Servidor
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

// parseAdminEmails divide o valor separado por vírgulas de ADMIN_EMAILS em um
// conjunto em minúsculas para busca O(1). Blank entries are dropped. Returns a non-nil
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

// IsAdminEmail verifica se o email dado está na lista de permissão admin.
// A comparação é case-insensitive e ignora espaços ao redor.
func (c *Config) IsAdminEmail(email string) bool {
	if len(c.AdminEmails) == 0 {
		return false
	}
	_, ok := c.AdminEmails[strings.ToLower(strings.TrimSpace(email))]
	return ok
}
