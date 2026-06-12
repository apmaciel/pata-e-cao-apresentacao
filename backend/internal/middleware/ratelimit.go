package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
)

type windowEntry struct {
	count     int
	windowEnd time.Time
}

// RateLimiter mantém contadores de janela deslizante por IP.
type RateLimiter struct {
	mu       sync.Mutex
	entries  map[string]*windowEntry
	maxReqs  int
	window   time.Duration
}

// NewRateLimiter cria um limitador que permite maxReqs requisições por janela.
func NewRateLimiter(maxReqs int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		entries: make(map[string]*windowEntry),
		maxReqs: maxReqs,
		window:  window,
	}
	// Limpeza em background para evitar crescimento ilimitado de memória.
	go rl.cleanup()
	return rl
}

// Middleware retorna um middleware Echo que aplica o rate limit por IP remoto.
func (rl *RateLimiter) Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			ip := c.RealIP()
			if !rl.allow(ip) {
				return c.JSON(http.StatusTooManyRequests, map[string]string{
					"error":   "RATE_LIMIT_EXCEEDED",
					"message": "too many requests, please slow down",
				})
			}
			return next(c)
		}
	}
}

func (rl *RateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	entry, ok := rl.entries[ip]
	if !ok || now.After(entry.windowEnd) {
		rl.entries[ip] = &windowEntry{count: 1, windowEnd: now.Add(rl.window)}
		return true
	}
	if entry.count >= rl.maxReqs {
		return false
	}
	entry.count++
	return true
}

// cleanup executa a cada minuto e remove entradas expiradas.
func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()
		for ip, e := range rl.entries {
			if now.After(e.windowEnd) {
				delete(rl.entries, ip)
			}
		}
		rl.mu.Unlock()
	}
}
