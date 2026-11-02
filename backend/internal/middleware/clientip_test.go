package middleware

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
)

func TestHeaderIPExtractor(t *testing.T) {
	extract := HeaderIPExtractor("CF-Connecting-IP")
	cases := []struct {
		name, header, want string
	}{
		{"usa o header", "203.0.113.7", "203.0.113.7"},
		{"aceita IPv6", "2001:db8::1", "2001:db8::1"},
		{"sem header usa a conexão", "", "172.18.0.5"},
		{"header que não é IP usa a conexão", "not-an-ip", "172.18.0.5"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/", nil)
			r.RemoteAddr = "172.18.0.5:4000"
			// Um X-Forwarded-For forjado nunca pode vencer.
			r.Header.Set("X-Forwarded-For", "198.51.100.99")
			if tc.header != "" {
				r.Header.Set("CF-Connecting-IP", tc.header)
			}
			if got := extract(r); got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestRateLimitIgnoresForgedForwardedFor(t *testing.T) {
	e := echo.New()
	e.IPExtractor = HeaderIPExtractor("CF-Connecting-IP")
	e.Use(NewRateLimiter(2, time.Minute).Middleware())
	e.GET("/", func(c echo.Context) error { return c.NoContent(http.StatusOK) })

	hit := func(clientIP, forwardedFor string) int {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = "172.18.0.5:4000"
		r.Header.Set("CF-Connecting-IP", clientIP)
		r.Header.Set("X-Forwarded-For", forwardedFor)
		w := httptest.NewRecorder()
		e.ServeHTTP(w, r)
		return w.Code
	}

	// Mesmo cliente trocando o X-Forwarded-For a cada requisição: o limite vale.
	for i, want := range []int{http.StatusOK, http.StatusOK, http.StatusTooManyRequests} {
		if got := hit("203.0.113.7", fmt.Sprintf("198.51.100.%d", i)); got != want {
			t.Fatalf("requisição %d: got %d, want %d", i+1, got, want)
		}
	}
	// Outro cliente tem o próprio balde.
	if got := hit("203.0.113.8", "198.51.100.1"); got != http.StatusOK {
		t.Fatalf("outro cliente: got %d, want %d", got, http.StatusOK)
	}
}
