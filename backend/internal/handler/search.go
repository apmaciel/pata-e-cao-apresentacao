package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"pata-cao/internal/service"
)

// SearchHandler exposes admin-only operations on the Typesense provider index.
type SearchHandler struct {
	providers *service.ProviderService
}

// NewSearchHandler creates a new SearchHandler. ProviderService owns the
// reindex logic because it already knows about the source-of-truth repo.
func NewSearchHandler(providers *service.ProviderService) *SearchHandler {
	return &SearchHandler{providers: providers}
}

// Reindex handles POST /api/admin/search/reindex (admin only).
// Returns the number of approved providers pushed to the index.
func (h *SearchHandler) Reindex(c echo.Context) error {
	n, err := h.providers.ReindexAll(c.Request().Context())
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, map[string]int{"indexed": n})
}
