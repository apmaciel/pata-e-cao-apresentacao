package handler

import (
	"net/http"
	"strings"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
)

// apiError writes the standard error JSON response.
func apiError(c echo.Context, status int, code, message string) error {
	return c.JSON(status, map[string]string{
		"error":   code,
		"message": message,
	})
}

// validationError formats go-playground/validator errors into the standard shape.
func validationError(c echo.Context, err error) error {
	var msgs []string
	if ve, ok := err.(validator.ValidationErrors); ok {
		for _, fe := range ve {
			msgs = append(msgs, fe.Field()+": "+fe.Tag())
		}
	}
	return c.JSON(http.StatusUnprocessableEntity, map[string]interface{}{
		"error":   "VALIDATION_ERROR",
		"message": "request validation failed",
		"fields":  msgs,
	})
}

// parseServiceError maps service-layer error strings to HTTP status codes.
// Service errors are prefixed with an error code followed by a colon.
func parseServiceError(err error) (int, string, string) {
	if err == nil {
		return http.StatusInternalServerError, "INTERNAL_ERROR", "unexpected error"
	}

	msg := err.Error()
	colonIdx := strings.Index(msg, ":")
	if colonIdx < 0 {
		return http.StatusInternalServerError, "INTERNAL_ERROR", msg
	}

	code := strings.TrimSpace(msg[:colonIdx])
	detail := strings.TrimSpace(msg[colonIdx+1:])

	switch code {
	case "INVALID_EMAIL", "VALIDATION_ERROR":
		return http.StatusBadRequest, code, detail
	case "EMAIL_TAKEN", "ALREADY_EXISTS", "REVIEW_EXISTS", "SLUG_CONFLICT":
		return http.StatusConflict, code, detail
	case "INVALID_CREDENTIALS":
		return http.StatusUnauthorized, code, detail
	case "UNAUTHORIZED":
		return http.StatusUnauthorized, code, detail
	case "INVALID_TOKEN", "TOKEN_EXPIRED":
		return http.StatusUnauthorized, code, detail
	case "FORBIDDEN", "ONBOARDING_REQUIRED":
		return http.StatusForbidden, code, detail
	case "NOT_FOUND", "PROVIDER_NOT_FOUND":
		return http.StatusNotFound, code, detail
	case "PROVIDER_NOT_APPROVED":
		return http.StatusForbidden, code, detail
	case "INVALID_STATUS", "INVALID_TRANSITION":
		return http.StatusUnprocessableEntity, code, detail
	case "SEARCH_DISABLED":
		return http.StatusServiceUnavailable, code, detail
	case "INTERNAL_ERROR":
		return http.StatusInternalServerError, code, detail
	default:
		return http.StatusInternalServerError, "INTERNAL_ERROR", msg
	}
}
