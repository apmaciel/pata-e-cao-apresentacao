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

// docPrefix é prefixado aos IDs de imagem de documentos para que o caminho
// de serviço possa distinguir documentos de identidade de imagens públicas
// (fotos de pets, logos, fotos de instalações) e protegê-los com autenticação admin.
const docPrefix = "doc-"

// ImageHandler serve imagens e gerencia o cache de imagens.
type ImageHandler struct {
	images           *service.ImageService
	allowedOrigins   map[string]bool // conjunto de valores permitidos do header Origin
	jwtSecret        string
	onboardingTokens postgres.OnboardingTokenRepository
}

// NewImageHandler cria um novo ImageHandler. allowedOriginsCSV é o valor
// separado por vírgulas de CORS_ORIGINS; é parseado em um set para busca O(1).
// jwtSecret é usado para validar tokens admin ao servir imagens de documentos.
func NewImageHandler(images *service.ImageService, allowedOriginsCSV, jwtSecret string, onboardingTokens postgres.OnboardingTokenRepository) *ImageHandler {
	return &ImageHandler{
		images:           images,
		allowedOrigins:   parseOriginSet(allowedOriginsCSV),
		jwtSecret:        jwtSecret,
		onboardingTokens: onboardingTokens,
	}
}

// Handle é um handler wildcard único para GET /api/images/*.
// Caminhos terminando em "/metadata" são roteados para GetImageMetadata; todos
// os outros servem a imagem binária. Isso permite imageIDs contendo barras
// (ex.: "partner-1/logo", "defaults/pet-placeholder").
//
// Imagens de documentos (IDs prefixados com "doc-") requerem autenticação admin.
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

// gateAdminForDocs retorna um erro se imageID for uma imagem de documento e
// o chamador não for um admin autenticado. Como GET /api/images/* não tem
// middleware JWT, extraímos e validamos o token do header Authorization manualmente.
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

// serveImage retorna dados binários da imagem com headers de cache completos.
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

// serveMetadata retorna metadados JSON da imagem sem o payload binário.
func (h *ImageHandler) serveMetadata(c echo.Context, imageID string) error {
	meta, err := h.images.GetMetadata(imageID)
	if err != nil {
		return apiError(c, http.StatusNotFound, "IMAGE_NOT_FOUND", "image not found")
	}
	return c.JSON(http.StatusOK, meta)
}

// UploadImage trata POST /api/images/upload?type=logo|facility|document|provider
func (h *ImageHandler) UploadImage(c echo.Context) error {
	imageType := service.ImageType(c.QueryParam("type"))
	if imageType == "" {
		return apiError(c, http.StatusBadRequest, "VALIDATION_ERROR", "query param 'type' is required (logo|facility|document|provider)")
	}

	// Uploads de documentos são usados pelo fluxo público de registro de prestadores;
	// uploads de provider são usados pelo formulário de onboarding com token —
	// devem conter um token de onboarding válido para evitar abuso anônimo.
	// Quando um token JWT Bearer está presente e o usuário é provider, isso
	// também autoriza uploads de provider (usado pela edição pós-onboarding).
	// Todos os outros tipos requerem autenticação JWT.
	if imageType != service.ImageTypeDocument {
		if imageType == service.ImageTypeProvider {
			// Tenta token JWT Bearer primeiro (edição de perfil pós-onboarding).
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
					// Provider autenticado por JWT — continua para upload.
				} else if err == nil {
					return apiError(c, http.StatusForbidden, "FORBIDDEN", "apenas prestadores podem enviar imagens de provider")
				} else {
					// JWT inválido — tenta verificar token de onboarding.
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
				// Sem header Authorization — requer token de onboarding.
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
			// Valida JWT manualmente — esta rota não tem middleware porque
			// uploads de documentos são públicos. Para todos os outros tipos
			// extraímos e validamos o token Bearer do header Authorization.
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

	// Valida header Origin contra origens permitidas para evitar abuso de
	// upload cross-origin. Pula quando o conjunto de origens está vazio (*).
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

// InvalidateCache trata POST /api/admin/cache/invalidate
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

// parseOriginSet divide uma string CSV de origens CORS em um set para
// busca O(1). Entradas são trimadas. Retorna nil quando o valor é "*".
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
