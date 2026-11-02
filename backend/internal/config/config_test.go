package config

import "testing"

func TestDevMode(t *testing.T) {
	cases := []struct {
		name                               string
		devMode, cookieSecure, frontendURL string
		wantDev, wantErr                   bool
	}{
		{"desligado por padrão", "", "", "", false, false},
		{"opt-in explícito com frontend local", "true", "", "http://localhost:3000", true, false},
		{"COOKIE_SECURE vence DEV_MODE", "true", "true", "https://pataecao.com.br", false, false},
		{"DEV_MODE com frontend remoto não sobe", "true", "", "https://pataecao.com.br", false, true},
		{"sem DEV_MODE e frontend remoto", "", "", "https://pataecao.com.br", false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("DATABASE_URL", "postgres://x")
			t.Setenv("JWT_SECRET", "x")
			t.Setenv("DEV_MODE", tc.devMode)
			t.Setenv("COOKIE_SECURE", tc.cookieSecure)
			t.Setenv("FRONTEND_URL", tc.frontendURL)

			cfg, err := Load()
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tc.wantErr)
			}
			if err == nil && cfg.DevMode != tc.wantDev {
				t.Fatalf("DevMode = %v, want %v", cfg.DevMode, tc.wantDev)
			}
		})
	}
}
