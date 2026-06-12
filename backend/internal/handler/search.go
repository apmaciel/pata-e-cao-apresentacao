package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"pata-cao/internal/service"
)

// SearchHandler expõe operações restritas a admin no índice de prestadores do Typesense.
type SearchHandler struct {
	providers *service.ProviderService
}

// NewSearchHandler cria um novo SearchHandler. ProviderService contém a
// lógica de reindexação porque já conhece o repositório fonte de verdade.
func NewSearchHandler(providers *service.ProviderService) *SearchHandler {
	return &SearchHandler{providers: providers}
}

// Reindex trata POST /api/admin/search/reindex (apenas admin).
// Retorna o número de prestadores aprovados enviados ao índice.
func (h *SearchHandler) Reindex(c echo.Context) error {
	n, err := h.providers.ReindexAll(c.Request().Context())
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, map[string]int{"indexed": n})
}

// Autocomplete trata GET /api/search/autocomplete?q=... (público).
// Retorna até 5 sugestões leves de prestadores para busca enquanto digita.
func (h *SearchHandler) Autocomplete(c echo.Context) error {
	q := c.QueryParam("q")
	suggestions, err := h.providers.AutocompleteProviders(c.Request().Context(), q)
	if err != nil {
		return apiError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "autocomplete failed")
	}
	return c.JSON(http.StatusOK, map[string]interface{}{
		"suggestions": suggestions,
	})
}
