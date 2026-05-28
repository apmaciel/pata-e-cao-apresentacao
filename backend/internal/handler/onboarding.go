package handler

import (
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"

	"pata-cao/internal/service"
)

// OnboardingHandler handles the provider onboarding setup endpoints.
type OnboardingHandler struct {
	providers *service.ProviderService
	validate  *validator.Validate
}

// NewOnboardingHandler creates a new OnboardingHandler.
func NewOnboardingHandler(providers *service.ProviderService) *OnboardingHandler {
	return &OnboardingHandler{providers: providers, validate: validator.New()}
}

// ValidateToken handles POST /api/providers/onboarding/validate.
func (h *OnboardingHandler) ValidateToken(c echo.Context) error {
	var body struct {
		Token string `json:"token" validate:"required"`
	}
	if err := c.Bind(&body); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(body); err != nil {
		return validationError(c, err)
	}

	result, err := h.providers.ValidateOnboardingToken(c.Request().Context(), body.Token)
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, result)
}

// Complete handles POST /api/providers/onboarding/complete.
func (h *OnboardingHandler) Complete(c echo.Context) error {
	var body struct {
		Token string                  `json:"token" validate:"required"`
		Data  service.OnboardingData  `json:"data" validate:"required"`
	}
	if err := c.Bind(&body); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(body); err != nil {
		return validationError(c, err)
	}

	if err := h.providers.CompleteOnboarding(c.Request().Context(), body.Token, body.Data); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "profile setup complete"})
}
