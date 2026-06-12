package handler

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"

	mw "pata-cao/internal/middleware"
	"pata-cao/internal/models"
	"pata-cao/internal/service"
)

// AdminHandler trata endpoints de gerenciamento de prestadores restritos a admin.
type AdminHandler struct {
	providers *service.ProviderService
	admin     *service.AdminService
	validate  *validator.Validate
}

// NewAdminHandler cria um novo AdminHandler.
func NewAdminHandler(providers *service.ProviderService, admin *service.AdminService) *AdminHandler {
	return &AdminHandler{providers: providers, admin: admin, validate: validator.New()}
}

// ListAllProviders trata GET /api/admin/providers (apenas admin).
// Params de query: status (filtro opcional), search (nome/email/id/serviços), page, per_page.
func (h *AdminHandler) ListAllProviders(c echo.Context) error {
	status := c.QueryParam("status")
	search := c.QueryParam("search")
	page, _ := strconv.Atoi(c.QueryParam("page"))
	perPage, _ := strconv.Atoi(c.QueryParam("per_page"))

	result, err := h.providers.ListAllProviders(c.Request().Context(), status, search, page, perPage)
	if err != nil {
		return apiError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load providers")
	}
	return c.JSON(http.StatusOK, result)
}

// GetPendingProviders trata GET /api/admin/providers/pending (apenas admin)
func (h *AdminHandler) GetPendingProviders(c echo.Context) error {
	providers, err := h.providers.GetPendingProviders(c.Request().Context())
	if err != nil {
		return apiError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load pending providers")
	}
	if providers == nil {
		providers = []models.Provider{}
	}
	return c.JSON(http.StatusOK, providers)
}

// ApproveProvider trata POST /api/admin/providers/:id/approve (apenas admin)
func (h *AdminHandler) ApproveProvider(c echo.Context) error {
	providerID := c.Param("id")
	adminID := mw.GetUserID(c)

	var body struct {
		Reason string `json:"reason" validate:"required"`
	}
	if err := c.Bind(&body); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(body); err != nil {
		return validationError(c, err)
	}

	rawToken, err := h.providers.ApproveProvider(c.Request().Context(), providerID, adminID, body.Reason)
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "provider approved", "onboardingToken": rawToken})
}

// RejectProvider trata POST /api/admin/providers/:id/reject (apenas admin)
func (h *AdminHandler) RejectProvider(c echo.Context) error {
	providerID := c.Param("id")
	adminID := mw.GetUserID(c)

	var body struct {
		Reason string `json:"reason" validate:"required"`
	}
	if err := c.Bind(&body); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(body); err != nil {
		return validationError(c, err)
	}

	if err := h.providers.RejectProvider(c.Request().Context(), providerID, adminID, body.Reason); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "provider rejected"})
}

// SuspendProvider trata POST /api/admin/providers/:id/suspend (apenas admin)
func (h *AdminHandler) SuspendProvider(c echo.Context) error {
	providerID := c.Param("id")
	adminID := mw.GetUserID(c)

	var body struct {
		Reason string `json:"reason" validate:"required"`
	}
	if err := c.Bind(&body); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(body); err != nil {
		return validationError(c, err)
	}

	if err := h.providers.SuspendProvider(c.Request().Context(), providerID, adminID, body.Reason); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "provider suspended"})
}

// DeleteProvider trata DELETE /api/admin/providers/:id (apenas admin).
// Apenas prestadores rejeitados podem ser excluídos permanentemente.
func (h *AdminHandler) DeleteProvider(c echo.Context) error {
	providerID := c.Param("id")
	if err := h.providers.DeleteProvider(c.Request().Context(), providerID); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.NoContent(http.StatusNoContent)
}

// GetAuditLog trata GET /api/admin/providers/:id/audit (apenas admin)
func (h *AdminHandler) GetAuditLog(c echo.Context) error {
	providerID := c.Param("id")
	entries, err := h.providers.GetAuditLog(c.Request().Context(), providerID)
	if err != nil {
		return apiError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load audit log")
	}
	return c.JSON(http.StatusOK, entries)
}

// GetStats trata GET /api/admin/stats (apenas admin).
func (h *AdminHandler) GetStats(c echo.Context) error {
	stats, err := h.admin.GetStats(c.Request().Context())
	if err != nil {
		return apiError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load stats")
	}
	return c.JSON(http.StatusOK, stats)
}

// GetProviderGrowth trata GET /api/admin/stats/providers (apenas admin).
// Params de query: range (30d, 60d, 90d, ytd, all — padrão 30d).
func (h *AdminHandler) GetProviderGrowth(c echo.Context) error {
	rangeParam := c.QueryParam("range")
	if rangeParam == "" {
		rangeParam = "30d"
	}
	resp, err := h.admin.GetProviderGrowth(c.Request().Context(), rangeParam)
	if err != nil {
		return apiError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load provider growth data")
	}
	return c.JSON(http.StatusOK, resp)
}

// UnsuspendProvider trata POST /api/admin/providers/:id/unsuspend (apenas admin)
func (h *AdminHandler) UnsuspendProvider(c echo.Context) error {
	providerID := c.Param("id")
	adminID := mw.GetUserID(c)

	var body struct {
		Reason string `json:"reason" validate:"required"`
	}
	if err := c.Bind(&body); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(body); err != nil {
		return validationError(c, err)
	}

	if err := h.providers.UnsuspendProvider(c.Request().Context(), providerID, adminID, body.Reason); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "provider unsuspended"})
}

// RegenerateOnboardingToken trata POST /api/admin/providers/:id/regenerate-token (apenas admin).
func (h *AdminHandler) RegenerateOnboardingToken(c echo.Context) error {
	providerID := c.Param("id")

	rawToken, err := h.providers.RegenerateOnboardingToken(c.Request().Context(), providerID)
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, map[string]string{"onboardingToken": rawToken})
}

// ExportProvidersCSV faz streaming de um arquivo CSV com todos os prestadores.
// Filtro opcional ?status=approved,pending (separado por vírgulas).
// GET /api/admin/providers/export
func (h *AdminHandler) ExportProvidersCSV(c echo.Context) error {
	statusFilter := c.QueryParam("status")
	var statuses []string
	if statusFilter != "" {
		for _, s := range strings.Split(statusFilter, ",") {
			if trimmed := strings.TrimSpace(s); trimmed != "" {
				statuses = append(statuses, trimmed)
			}
		}
	}

	providers, err := h.providers.ExportProviders(c.Request().Context(), statuses)
	if err != nil {
		return apiError(c, http.StatusInternalServerError, "EXPORT_FAILED", "failed to fetch providers")
	}

	filename := fmt.Sprintf("providers_%s.csv", time.Now().Format("2006-01-02"))
	c.Response().Header().Set("Content-Type", "text/csv")
	c.Response().Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

	w := csv.NewWriter(c.Response())

	if err := w.Write([]string{
		"ID",
		"Business Name",
		"Company Name",
		"Email",
		"Phone",
		"Status",
		"Services",
		"Location",
		"Rating",
		"Created At",
		"Updated At",
	}); err != nil {
		return apiError(c, http.StatusInternalServerError, "CSV_HEADER_FAILED", "failed to write CSV header")
	}

	for _, p := range providers {
		created := p.CreatedAt.Format(time.RFC3339)
		updated := p.UpdatedAt.Format(time.RFC3339)
		location := ""
		if p.Location != nil {
			location = *p.Location
		}
		companyName := ""
		if p.CompanyName != nil {
			companyName = *p.CompanyName
		}

		if err := w.Write([]string{
			p.ID,
			p.BusinessName,
			companyName,
			p.Email,
			p.Phone,
			p.Status,
			strings.Join(p.Services, ", "),
			location,
			fmt.Sprintf("%.2f", p.AvgRating),
			created,
			updated,
		}); err != nil {
			return apiError(c, http.StatusInternalServerError, "CSV_ROW_FAILED", "failed to write CSV row")
		}
	}

	w.Flush()
	if err := w.Error(); err != nil {
		return apiError(c, http.StatusInternalServerError, "CSV_FLUSH_FAILED", "failed to flush CSV")
	}
	return nil
}
