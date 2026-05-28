package handler

import (
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	mw "pata-cao/internal/middleware"
	"pata-cao/internal/repository/postgres"
	"pata-cao/internal/service"
)

// docPrefix is prepended to document-type image IDs so the serve path can
// distinguish provider identity documents from public images (pet photos,
// logos, facility photos) and gate them behind admin authentication.
const docPrefix = "doc-"

// ImageHandler serves images and manages the image cache.
type ImageHandler struct {
	images           *service.ImageService
	allowedOrigins   map[string]bool // set of allowed Origin header values
	jwtSecret        string
	onboardingTokens postgres.OnboardingTokenRepository
}

// NewImageHandler creates a new ImageHandler. allowedOriginsCSV is the
// comma-separated CORS_ORIGINS value; it is parsed into a set for O(1) lookup.
// jwtSecret is used to validate admin tokens when serving document images.
func NewImageHandler(images *service.ImageService, allowedOriginsCSV, jwtSecret string, onboardingTokens postgres.OnboardingTokenRepository) *ImageHandler {
	return &ImageHandler{
		images:           images,
		allowedOrigins:   parseOriginSet(allowedOriginsCSV),
		jwtSecret:        jwtSecret,
		onboardingTokens: onboardingTokens,
	}
}

// Handle is a single wildcard handler for GET /api/images/*.
// Paths ending in "/metadata" are routed to GetImageMetadata; all others serve
// the binary image. This allows imageIDs that contain slashes (e.g.
// "partner-1/logo", "defaults/pet-placeholder").
//
// Document images (IDs prefixed with "doc-") require admin authentication.
func (h *ImageHandler) Handle(c echo.Context) error {
	rawPath := c.Param("*")
	if strings.HasSuffix(rawPath, "/metadata") {
		imageID := strings.TrimSuffix(rawPath, "/metadata")
		if err := h.gateAdminForDocs(c, imageID); err != nil {
			return err
		}
		return h.serveMetadata(c, imageID)
	}
	if err := h.gateAdminForDocs(c, rawPath); err != nil {
		return err
	}
	return h.serveImage(c, rawPath)
}

// gateAdminForDocs returns an error if imageID is a document image and the
// caller is not an authenticated admin. Because GET /api/images/* has no JWT
// middleware, we manually extract and validate the token from the Authorization
// header here.
func (h *ImageHandler) gateAdminForDocs(c echo.Context, imageID string) error {
	if !strings.HasPrefix(imageID, docPrefix) {
		return nil
	}

	header := c.Request().Header.Get("Authorization")
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return apiError(c, http.StatusForbidden, "FORBIDDEN", "admin access required")
	}
	tokenStr := strings.TrimSpace(parts[1])

	claims := &mw.Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, echo.ErrUnauthorized
		}
		return []byte(h.jwtSecret), nil
	})
	if err != nil {
		return apiError(c, http.StatusForbidden, "FORBIDDEN", "admin access required")
	}

	if claims.Role != "admin" {
		return apiError(c, http.StatusForbidden, "FORBIDDEN", "admin access required")
	}
	return nil
}

// serveImage returns binary image data with full caching headers.
func (h *ImageHandler) serveImage(c echo.Context, imageID string) error {
	data, cacheHit, err := h.images.FetchImage(imageID)
	if err != nil {
		return apiError(c, http.StatusNotFound, "IMAGE_NOT_FOUND", "image not found")
	}

	meta, _ := h.images.GetMetadata(imageID)

	contentType := http.DetectContentType(data)
	cacheStatus := "MISS"
	if cacheHit {
		cacheStatus = "HIT"
	}

	c.Response().Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d", 30*24*60*60))
	c.Response().Header().Set("X-Cache", cacheStatus)
	if meta != nil && meta.Hash != "" {
		c.Response().Header().Set("ETag", fmt.Sprintf(`"%s"`, meta.Hash))
		c.Response().Header().Set("Last-Modified", meta.UploadedAt.UTC().Format(http.TimeFormat))
	}

	// Honour If-None-Match for 304 Not Modified
	if meta != nil && meta.Hash != "" {
		clientETag := c.Request().Header.Get("If-None-Match")
		if clientETag == fmt.Sprintf(`"%s"`, meta.Hash) {
			return c.NoContent(http.StatusNotModified)
		}
	}

	return c.Blob(http.StatusOK, contentType, data)
}

// serveMetadata returns JSON metadata for an image without the binary payload.
func (h *ImageHandler) serveMetadata(c echo.Context, imageID string) error {
	meta, err := h.images.GetMetadata(imageID)
	if err != nil {
		return apiError(c, http.StatusNotFound, "IMAGE_NOT_FOUND", "image not found")
	}
	return c.JSON(http.StatusOK, meta)
}

// UploadImage handles POST /api/images/upload?type=logo|facility|pet|document|provider|avatar
func (h *ImageHandler) UploadImage(c echo.Context) error {
	imageType := service.ImageType(c.QueryParam("type"))
	if imageType == "" {
		return apiError(c, http.StatusBadRequest, "VALIDATION_ERROR", "query param 'type' is required (logo|facility|pet|document|provider|avatar)")
	}

	// Document uploads are used by the public provider registration flow;
	// provider uploads are used by the token-gated onboarding form — they
	// must carry a valid onboarding token to prevent anonymous upload abuse.
	// When a JWT Bearer token is present and the user is a provider, that
	// also authorizes provider uploads (used by the post-onboarding profile edit).
	// All other types require JWT authentication.
	if imageType != service.ImageTypeDocument {
		if imageType == service.ImageTypeProvider {
			// Try JWT Bearer token first (post-onboarding profile edit).
			header := c.Request().Header.Get("Authorization")
			parts := strings.SplitN(header, " ", 2)
			if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
				tokenStr := strings.TrimSpace(parts[1])
				claims := &mw.Claims{}
				_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
					if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
						return nil, echo.ErrUnauthorized
					}
					return []byte(h.jwtSecret), nil
				})
				if err == nil && claims.Role == "provider" {
					// JWT-authenticated provider — fall through to upload.
				} else if err == nil {
					return apiError(c, http.StatusForbidden, "FORBIDDEN", "only providers can upload provider images")
				} else {
					// JWT invalid — fall through to onboarding token check.
					rawToken := c.QueryParam("token")
					if rawToken == "" {
						return apiError(c, http.StatusUnauthorized, "UNAUTHORIZED", "onboarding token or JWT is required for provider image uploads")
					}
					stored, tokenErr := h.onboardingTokens.GetByHash(c.Request().Context(), rawToken)
					if tokenErr != nil || stored.ConsumedAt != nil || time.Now().After(stored.ExpiresAt) {
						return apiError(c, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired onboarding token")
					}
				}
			} else {
				// No Authorization header — require onboarding token.
				rawToken := c.QueryParam("token")
				if rawToken == "" {
					return apiError(c, http.StatusUnauthorized, "UNAUTHORIZED", "onboarding token or JWT is required for provider image uploads")
				}
				stored, err := h.onboardingTokens.GetByHash(c.Request().Context(), rawToken)
				if err != nil || stored.ConsumedAt != nil || time.Now().After(stored.ExpiresAt) {
					return apiError(c, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired onboarding token")
				}
			}
		} else {
			// Manually validate JWT — this route has no middleware because
			// document uploads are public. For all other types we extract
			// and validate the Bearer token from the Authorization header.
			header := c.Request().Header.Get("Authorization")
			parts := strings.SplitN(header, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
				return apiError(c, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
			}
			tokenStr := strings.TrimSpace(parts[1])

			claims := &mw.Claims{}
			_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, echo.ErrUnauthorized
				}
				return []byte(h.jwtSecret), nil
			})
			if err != nil {
				return apiError(c, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired token")
			}
		}
	}

	// Validate Origin header against allowed origins to prevent cross-origin
	// upload abuse. Skip when the origin set is empty (configured as "*").
	if len(h.allowedOrigins) > 0 {
		origin := c.Request().Header.Get("Origin")
		if origin != "" && !h.allowedOrigins[origin] {
			return apiError(c, http.StatusForbidden, "FORBIDDEN", "origin not allowed")
		}
	}

	file, err := c.FormFile("image")
	if err != nil {
		return apiError(c, http.StatusBadRequest, "VALIDATION_ERROR", "multipart field 'image' is required")
	}

	src, err := file.Open()
	if err != nil {
		return apiError(c, http.StatusInternalServerError, "UPLOAD_ERROR", "failed to open uploaded file")
	}
	defer src.Close()

	data, err := io.ReadAll(src)
	if err != nil {
		return apiError(c, http.StatusInternalServerError, "UPLOAD_ERROR", "failed to read uploaded file")
	}

	if err := h.images.ValidateImage(data, imageType); err != nil {
		return apiError(c, http.StatusBadRequest, "VALIDATION_FAILED", err.Error())
	}

	ext := filepath.Ext(file.Filename)
	imageID := uuid.New().String() + ext
	if imageType == service.ImageTypeDocument {
		imageID = docPrefix + imageID
	}
	if err := h.images.StoreImage(imageID, data); err != nil {
		return apiError(c, http.StatusInternalServerError, "UPLOAD_ERROR", "failed to store image")
	}

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"status":       "uploaded",
		"imageId":      imageID,
		"url":          fmt.Sprintf("/api/images/%s", imageID),
		"originalName": file.Filename,
	})
}

// InvalidateCache handles POST /api/admin/cache/invalidate
// Body: {"imageIds": ["partner-1/logo", "defaults/pet-placeholder"]}
func (h *ImageHandler) InvalidateCache(c echo.Context) error {
	var body struct {
		ImageIDs []string `json:"imageIds"`
	}
	if err := c.Bind(&body); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if len(body.ImageIDs) == 0 {
		return apiError(c, http.StatusBadRequest, "VALIDATION_ERROR", "imageIds must be a non-empty array")
	}

	h.images.InvalidateCache(body.ImageIDs)
	return c.JSON(http.StatusOK, map[string]interface{}{
		"status":   "invalidated",
		"imageIds": body.ImageIDs,
		"count":    len(body.ImageIDs),
	})
}

// parseOriginSet splits a comma-separated CORS origins string into a set for
// O(1) lookup. Entries are trimmed. Returns nil when the value is "*".
func parseOriginSet(csv string) map[string]bool {
	csv = strings.TrimSpace(csv)
	if csv == "*" || csv == "" {
		return nil
	}
	set := make(map[string]bool)
	for _, o := range strings.Split(csv, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			set[o] = true
		}
	}
	return set
}
