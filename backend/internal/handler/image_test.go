package handler

import "testing"

func TestCacheControlFor(t *testing.T) {
	cases := map[string]string{
		// Documentos de identidade: só admin lê, então nunca vão para cache compartilhado.
		"doc-6f1c.png":             "private, no-store",
		"partner-1/logo":           "public, max-age=2592000",
		"defaults/pet-placeholder": "public, max-age=2592000",
	}
	for id, want := range cases {
		if got := cacheControlFor(id); got != want {
			t.Errorf("cacheControlFor(%q) = %q, want %q", id, got, want)
		}
	}
}
