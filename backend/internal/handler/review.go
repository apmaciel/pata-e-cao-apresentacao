package handler

import (
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"

	mw "pata-cao/internal/middleware"
	"pata-cao/internal/models"
	"pata-cao/internal/service"
)

// ReviewHandler handles review endpoints.
type ReviewHandler struct {
	reviews  *service.ReviewService
	validate *validator.Validate
}

// NewReviewHandler creates a new ReviewHandler.
func NewReviewHandler(reviews *service.ReviewService) *ReviewHandler {
	return &ReviewHandler{reviews: reviews, validate: validator.New()}
}

type createReviewRequest struct {
	BookingID string  `json:"bookingId" validate:"required"`
	Rating    int     `json:"rating" validate:"required,min=1,max=5"`
	Text      *string `json:"text"`
}

// CreateReview handles POST /api/reviews (auth required, owner role)
func (h *ReviewHandler) CreateReview(c echo.Context) error {
	var req createReviewRequest
	if err := c.Bind(&req); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(req); err != nil {
		return validationError(c, err)
	}

	r := &models.Review{
		BookingID: req.BookingID,
		Rating:    req.Rating,
		Text:      req.Text,
	}

	if err := h.reviews.CreateReview(c.Request().Context(), mw.GetUserID(c), r); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusCreated, r)
}
