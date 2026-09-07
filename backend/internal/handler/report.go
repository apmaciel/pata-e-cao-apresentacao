package handler

import (
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"

	"pata-cao/internal/models"
	"pata-cao/internal/service"
)

// ReportHandler trata endpoints de denúncias de prestadores.
type ReportHandler struct {
	reports  *service.ReportService
	validate *validator.Validate
}

// NewReportHandler cria um novo ReportHandler.
func NewReportHandler(reports *service.ReportService) *ReportHandler {
	return &ReportHandler{reports: reports, validate: validator.New()}
}

type submitReportRequest struct {
	ReporterID string  `json:"reporterId" validate:"required"`
	Reason     string  `json:"reason" validate:"required"`
	Details    *string `json:"details"`
}

// SubmitReport trata POST /api/providers/:id/report (público — sem autenticação)
func (h *ReportHandler) SubmitReport(c echo.Context) error {
	providerID := c.Param("id")

	var req submitReportRequest
	if err := c.Bind(&req); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(req); err != nil {
		return validationError(c, err)
	}

	if err := h.reports.SubmitReport(c.Request().Context(), providerID, req.ReporterID, req.Reason, req.Details); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusCreated, map[string]string{"message": "report submitted"})
}

// ListReportedProviders trata GET /api/admin/reports (apenas admin).
// Query param opcional: status (open|reviewed).
func (h *ReportHandler) ListReportedProviders(c echo.Context) error {
	status := c.QueryParam("status")
	summaries, err := h.reports.ListReportedProviders(c.Request().Context(), status)
	if err != nil {
		return apiError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load reports")
	}
	if summaries == nil {
		summaries = []models.ProviderReportSummary{}
	}
	return c.JSON(http.StatusOK, summaries)
}

// GetProviderReportLog trata GET /api/admin/reports/:providerId (apenas admin)
func (h *ReportHandler) GetProviderReportLog(c echo.Context) error {
	providerID := c.Param("providerId")
	entries, err := h.reports.GetProviderReportLog(c.Request().Context(), providerID)
	if err != nil {
		return apiError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load report log")
	}
	if entries == nil {
		entries = []models.ProviderReport{}
	}
	return c.JSON(http.StatusOK, entries)
}

// MarkReviewed trata POST /api/admin/reports/:providerId/review (apenas admin)
func (h *ReportHandler) MarkReviewed(c echo.Context) error {
	providerID := c.Param("providerId")
	if err := h.reports.MarkProviderReviewed(c.Request().Context(), providerID); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "reports marked reviewed"})
}
