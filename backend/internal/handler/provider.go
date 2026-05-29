package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"

	mw "pata-cao/internal/middleware"
	"pata-cao/internal/models"
	"pata-cao/internal/service"
)

// ProviderHandler handles provider endpoints.
type ProviderHandler struct {
	providers *service.ProviderService
	reviews   *service.ReviewService
	validate  *validator.Validate
}

// NewProviderHandler creates a new ProviderHandler.
func NewProviderHandler(providers *service.ProviderService, reviews *service.ReviewService) *ProviderHandler {
	return &ProviderHandler{providers: providers, reviews: reviews, validate: validator.New()}
}

// ListProviders handles GET /api/providers (public, approved only).
// Query params: q, service, sort=rating|reviews, page, per_page.
// Response shape: { providers, total, page, perPage, facets }.
func (h *ProviderHandler) ListProviders(c echo.Context) error {
	page, _ := strconv.Atoi(c.QueryParam("page"))
	perPage, _ := strconv.Atoi(c.QueryParam("per_page"))

	params := service.SearchParams{
		Query:   c.QueryParam("q"),
		Service: c.QueryParam("service"),
		SortBy:  c.QueryParam("sort"),
		Page:    page,
		PerPage: perPage,
	}

	result, err := h.providers.ListProviders(c.Request().Context(), params)
	if err != nil {
		return apiError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list providers")
	}
	return c.JSON(http.StatusOK, result)
}

// GetProvider handles GET /api/providers/:id (public, approved only for unauthenticated)
func (h *ProviderHandler) GetProvider(c echo.Context) error {
	id := c.Param("id")
	callerID := mw.GetUserID(c)
	callerRole := mw.GetUserRole(c)

	provider, err := h.providers.GetProvider(c.Request().Context(), id, callerID, callerRole)
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, provider)
}

type applyRequest struct {
	BusinessName string   `json:"businessName" validate:"required,min=2,max=100"`
	Bio          *string  `json:"bio"`
	Location     *string  `json:"location"`
	Services     []string `json:"services" validate:"required,min=1"`
}

// Apply handles POST /api/providers/apply (auth required)
func (h *ProviderHandler) Apply(c echo.Context) error {
	var req applyRequest
	if err := c.Bind(&req); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(req); err != nil {
		return validationError(c, err)
	}

	p := &models.Provider{
		BusinessName: req.BusinessName,
		Bio:          req.Bio,
		Location:     req.Location,
		Services:     req.Services,
	}

	if err := h.providers.Apply(c.Request().Context(), mw.GetUserID(c), p); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusCreated, p)
}

// GetProviderReviews handles GET /api/providers/:id/reviews (public)
func (h *ProviderHandler) GetProviderReviews(c echo.Context) error {
	providerID := c.Param("id")
	reviews, err := h.reviews.GetProviderReviews(c.Request().Context(), providerID)
	if err != nil {
		return apiError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load reviews")
	}
	if reviews == nil {
		reviews = []models.Review{}
	}
	return c.JSON(http.StatusOK, reviews)
}

// GetMyProvider handles GET /api/providers/me (auth required).
// Returns the authenticated user's own provider profile.
func (h *ProviderHandler) GetMyProvider(c echo.Context) error {
	userID := mw.GetUserID(c)
	provider, err := h.providers.GetMyProvider(c.Request().Context(), userID)
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, provider)
}

type updateMyProviderRequest struct {
	BusinessName    string          `json:"businessName" validate:"required,min=2,max=100"`
	Bio             *string         `json:"bio"`
	Location        *string         `json:"location"`
	LogoImageID     *string         `json:"logoImageId"`
	Whatsapp        *string         `json:"whatsapp"`
	AcceptsDogs     bool            `json:"acceptsDogs"`
	AcceptsCats     bool            `json:"acceptsCats"`
	AcceptsNeutered bool            `json:"acceptsNeutered"`
	AcceptsIntact   bool            `json:"acceptsIntact"`
	SocialLinks     json.RawMessage `json:"socialLinks"`
}

// UpdateMyProvider handles PUT /api/providers/me (auth required).
// Allows providers to edit their profile with rate-limiting on restricted fields.
func (h *ProviderHandler) UpdateMyProvider(c echo.Context) error {
	var req updateMyProviderRequest
	if err := c.Bind(&req); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(req); err != nil {
		return validationError(c, err)
	}

	p := &models.Provider{
		BusinessName:    req.BusinessName,
		Bio:             req.Bio,
		Location:        req.Location,
		LogoImageID:     req.LogoImageID,
		Whatsapp:        req.Whatsapp,
		AcceptsDogs:     req.AcceptsDogs,
		AcceptsCats:     req.AcceptsCats,
		AcceptsNeutered: req.AcceptsNeutered,
		AcceptsIntact:   req.AcceptsIntact,
		SocialLinks:     req.SocialLinks,
	}

	if err := h.providers.UpdateProfile(c.Request().Context(), mw.GetUserID(c), p); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}

	// Return the updated provider.
	updated, err := h.providers.GetMyProvider(c.Request().Context(), mw.GetUserID(c))
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, updated)
}

type addGalleryImageRequest struct {
	ImageID string `json:"imageId" validate:"required"`
}

type deleteMyProviderRequest struct {
	Password string `json:"password" validate:"required"`
}

// DeleteMyProvider handles DELETE /api/providers/me (auth required).
// Allows an approved provider to permanently delete their own account,
// with password confirmation as a safety guard.
func (h *ProviderHandler) DeleteMyProvider(c echo.Context) error {
	var req deleteMyProviderRequest
	if err := c.Bind(&req); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(req); err != nil {
		return validationError(c, err)
	}

	if err := h.providers.DeleteOwnProvider(c.Request().Context(), mw.GetUserID(c), req.Password); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "account deleted successfully"})
}

// AddGalleryImage handles POST /api/providers/me/gallery (auth required).
// Adds an image to the provider's gallery, capping at 15.
func (h *ProviderHandler) AddGalleryImage(c echo.Context) error {
	var req addGalleryImageRequest
	if err := c.Bind(&req); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(req); err != nil {
		return validationError(c, err)
	}

	userID := mw.GetUserID(c)
	provider, err := h.providers.GetMyProvider(c.Request().Context(), userID)
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}

	if err := h.providers.AddGalleryImage(c.Request().Context(), provider.ID, req.ImageID); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}

	// Return updated gallery.
	images, err := h.providers.GetGalleryImages(c.Request().Context(), provider.ID)
	if err != nil {
		return apiError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load gallery")
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"galleryImages": images})
}

// RemoveGalleryImage handles DELETE /api/providers/me/gallery/:imageId (auth required).
func (h *ProviderHandler) RemoveGalleryImage(c echo.Context) error {
	imageID := c.Param("imageId")

	userID := mw.GetUserID(c)
	provider, err := h.providers.GetMyProvider(c.Request().Context(), userID)
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}

	if err := h.providers.RemoveGalleryImage(c.Request().Context(), provider.ID, imageID); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "gallery image removed"})
}
