package handler

import (
	"net/http"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"

	mw "pata-cao/internal/middleware"
	"pata-cao/internal/models"
	"pata-cao/internal/service"
)

// BookingHandler handles booking endpoints.
type BookingHandler struct {
	bookings *service.BookingService
	validate *validator.Validate
}

// NewBookingHandler creates a new BookingHandler.
func NewBookingHandler(bookings *service.BookingService) *BookingHandler {
	return &BookingHandler{bookings: bookings, validate: validator.New()}
}

type createBookingRequest struct {
	ProviderID  string    `json:"providerId" validate:"required"`
	ServiceType string    `json:"serviceType" validate:"required,min=1,max=50"`
	StartDate   time.Time `json:"startDate" validate:"required"`
	EndDate     time.Time `json:"endDate" validate:"required"`
	Notes       *string   `json:"notes"`
	PriceCents  *int      `json:"priceCents"`
}

// CreateBooking handles POST /api/bookings (auth required, owner role)
func (h *BookingHandler) CreateBooking(c echo.Context) error {
	var req createBookingRequest
	if err := c.Bind(&req); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(req); err != nil {
		return validationError(c, err)
	}

	b := &models.Booking{
		ProviderID:  req.ProviderID,
		ServiceType: req.ServiceType,
		StartDate:   req.StartDate,
		EndDate:     req.EndDate,
		Notes:       req.Notes,
		PriceCents:  req.PriceCents,
	}

	callerID := mw.GetUserID(c)
	if err := h.bookings.CreateBooking(c.Request().Context(), callerID, b); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusCreated, b)
}

// ListBookings handles GET /api/bookings (auth required)
func (h *BookingHandler) ListBookings(c echo.Context) error {
	callerID := mw.GetUserID(c)
	role := mw.GetUserRole(c)

	bookings, err := h.bookings.ListBookings(c.Request().Context(), callerID, role)
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	if bookings == nil {
		bookings = []models.Booking{}
	}
	return c.JSON(http.StatusOK, bookings)
}

// GetBooking handles GET /api/bookings/:id (auth required, owner or provider)
func (h *BookingHandler) GetBooking(c echo.Context) error {
	bookingID := c.Param("id")
	callerID := mw.GetUserID(c)

	booking, err := h.bookings.GetBooking(c.Request().Context(), callerID, bookingID)
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, booking)
}

// ConfirmBooking handles PUT /api/bookings/:id/confirm (auth required, provider role)
func (h *BookingHandler) ConfirmBooking(c echo.Context) error {
	bookingID := c.Param("id")
	callerID := mw.GetUserID(c)

	if err := h.bookings.ConfirmBooking(c.Request().Context(), callerID, bookingID); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "booking confirmed"})
}

// CancelBooking handles PUT /api/bookings/:id/cancel (auth required)
func (h *BookingHandler) CancelBooking(c echo.Context) error {
	bookingID := c.Param("id")
	callerID := mw.GetUserID(c)

	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.Bind(&body)

	if err := h.bookings.CancelBooking(c.Request().Context(), callerID, bookingID, body.Reason); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "booking cancelled"})
}
