package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"

	mw "pata-cao/internal/middleware"
	"pata-cao/internal/models"
	"pata-cao/internal/service"
)

// PetHandler handles pet CRUD and health record endpoints.
type PetHandler struct {
	pets     *service.PetService
	validate *validator.Validate
}

// NewPetHandler creates a new PetHandler.
func NewPetHandler(pets *service.PetService) *PetHandler {
	return &PetHandler{pets: pets, validate: validator.New()}
}

type createPetRequest struct {
	Name      string   `json:"name" validate:"required,min=1,max=100"`
	Species   string   `json:"species" validate:"required,min=1,max=50"`
	Breed     *string  `json:"breed"`
	BirthDate *string  `json:"birthDate"`
	Color     *string  `json:"color"`
	WeightKg  *float64 `json:"weightKg"`
	HeightCm  *float64 `json:"heightCm"`
	Size      string   `json:"size" validate:"omitempty,oneof=small medium large"`
	AgeYears  *int     `json:"ageYears"`
	PhotoImageID *string `json:"photoImageId"`
}

type updatePetRequest struct {
	Name      *string  `json:"name"`
	Breed     *string  `json:"breed"`
	Color     *string  `json:"color"`
	WeightKg  *float64 `json:"weightKg"`
	HeightCm  *float64 `json:"heightCm"`
	Size      *string  `json:"size" validate:"omitempty,oneof=small medium large"`
	AgeYears  *int     `json:"ageYears"`
	PhotoImageID *string `json:"photoImageId"`
}

// ListPets handles GET /api/pets
func (h *PetHandler) ListPets(c echo.Context) error {
	ownerID := mw.GetUserID(c)
	pets, err := h.pets.ListPets(c.Request().Context(), ownerID)
	if err != nil {
		return apiError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list pets")
	}
	if pets == nil {
		pets = []models.Pet{}
	}
	return c.JSON(http.StatusOK, pets)
}

// CreatePet handles POST /api/pets
func (h *PetHandler) CreatePet(c echo.Context) error {
	var req createPetRequest
	if err := c.Bind(&req); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(req); err != nil {
		return validationError(c, err)
	}

	size := req.Size
	if size == "" {
		size = "medium"
	}

	var birthDate *time.Time
	if req.BirthDate != nil && *req.BirthDate != "" {
		t, err := time.Parse("2006-01-02", *req.BirthDate)
		if err == nil {
			birthDate = &t
		}
	}

	pet := &models.Pet{
		Name:         req.Name,
		Species:      req.Species,
		Breed:        req.Breed,
		BirthDate:    birthDate,
		Color:        req.Color,
		WeightKg:     req.WeightKg,
		HeightCm:     req.HeightCm,
		Size:         size,
		AgeYears:     req.AgeYears,
		PhotoImageID: req.PhotoImageID,
	}

	if err := h.pets.CreatePet(c.Request().Context(), mw.GetUserID(c), pet); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusCreated, pet)
}

// GetPet handles GET /api/pets/:id
func (h *PetHandler) GetPet(c echo.Context) error {
	petID := c.Param("id")
	pet, err := h.pets.GetPet(c.Request().Context(), mw.GetUserID(c), petID)
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, pet)
}

// UpdatePet handles PUT /api/pets/:id
func (h *PetHandler) UpdatePet(c echo.Context) error {
	petID := c.Param("id")
	callerID := mw.GetUserID(c)

	var req updatePetRequest
	if err := c.Bind(&req); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(req); err != nil {
		return validationError(c, err)
	}

	// Merge: load existing pet and overlay only the fields the caller sent.
	existing, err := h.pets.GetPet(c.Request().Context(), callerID, petID)
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}

	if req.Name != nil {
		existing.Name = *req.Name
	}
	if req.Breed != nil {
		existing.Breed = req.Breed
	}
	if req.Color != nil {
		existing.Color = req.Color
	}
	if req.WeightKg != nil {
		existing.WeightKg = req.WeightKg
	}
	if req.HeightCm != nil {
		existing.HeightCm = req.HeightCm
	}
	if req.Size != nil {
		existing.Size = *req.Size
	}
	if req.AgeYears != nil {
		existing.AgeYears = req.AgeYears
	}
	if req.PhotoImageID != nil {
		existing.PhotoImageID = req.PhotoImageID
	}

	if err := h.pets.UpdatePet(c.Request().Context(), callerID, existing); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, existing)
}

// GetHealthRecord handles GET /api/pets/:id/health
// SECURITY: verifies ownership, audit-logs access, never includes health data in error responses.
func (h *PetHandler) GetHealthRecord(c echo.Context) error {
	petID := c.Param("id")
	callerID := mw.GetUserID(c)
	ip := c.RealIP()

	access := service.HealthAccessContext{
		CallerID:  callerID,
		IPAddress: &ip,
	}

	record, err := h.pets.GetHealthRecord(c.Request().Context(), petID, access)
	if err != nil {
		// NEVER return health data in error responses.
		code, errCode, _ := parseServiceError(err)
		return apiError(c, code, errCode, "access denied to health records")
	}
	return c.JSON(http.StatusOK, record)
}

type updateHealthRequest struct {
	Vaccinations  json.RawMessage `json:"vaccinations"`
	Allergies     []string `json:"allergies"`
	Medications   []string `json:"medications"`
	SpecialNeeds  *string  `json:"specialNeeds"`
	IsSensitive   *bool    `json:"isSensitive"`
	IsNeutered    *bool    `json:"isNeutered"`
	BehaviorNotes *string  `json:"behaviorNotes"`
	VetName       *string  `json:"vetName"`
	VetPhone      *string  `json:"vetPhone"`
	VetEmail      *string  `json:"vetEmail"`
}

// UpdateHealthRecord handles PUT /api/pets/:id/health
func (h *PetHandler) UpdateHealthRecord(c echo.Context) error {
	petID := c.Param("id")
	callerID := mw.GetUserID(c)

	var req updateHealthRequest
	if err := c.Bind(&req); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}

	// Default NOT NULL columns when not provided — pgx sends NULL for nil
	// slices, which violates the column constraints.
	if len(req.Vaccinations) == 0 {
		req.Vaccinations = json.RawMessage("[]")
	}
	if req.Allergies == nil {
		req.Allergies = []string{}
	}
	if req.Medications == nil {
		req.Medications = []string{}
	}
	if req.IsSensitive == nil {
		t := true
		req.IsSensitive = &t
	}

	record := &models.PetHealthRecord{
		PetID:         petID,
		Vaccinations:  req.Vaccinations,
		Allergies:     req.Allergies,
		Medications:   req.Medications,
		SpecialNeeds:  req.SpecialNeeds,
		IsSensitive:   req.IsSensitive,
		IsNeutered:    req.IsNeutered,
		BehaviorNotes: req.BehaviorNotes,
		VetName:       req.VetName,
		VetPhone:      req.VetPhone,
		VetEmail:      req.VetEmail,
	}

	if err := h.pets.UpdateHealthRecord(c.Request().Context(), callerID, record); err != nil {
		code, errCode, _ := parseServiceError(err)
		return apiError(c, code, errCode, "access denied")
	}
	return c.JSON(http.StatusOK, record)
}

	// ── Pet image handlers ─────────────────────────────────────────────────────

	// ListImages handles GET /api/pets/:id/images
	func (h *PetHandler) ListImages(c echo.Context) error {
		petID := c.Param("id")
		callerID := mw.GetUserID(c)
		images, err := h.pets.ListImages(c.Request().Context(), callerID, petID)
		if err != nil {
			code, errCode, msg := parseServiceError(err)
			return apiError(c, code, errCode, msg)
		}
		if images == nil {
			images = []models.PetImage{}
		}
		return c.JSON(http.StatusOK, images)
	}

	// AddImage handles POST /api/pets/:id/images
	func (h *PetHandler) AddImage(c echo.Context) error {
		petID := c.Param("id")
		callerID := mw.GetUserID(c)

		var req models.AddImageRequest
		if err := c.Bind(&req); err != nil {
			return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
		}
		if err := h.validate.Struct(req); err != nil {
			return validationError(c, err)
		}

		img, err := h.pets.AddImage(c.Request().Context(), callerID, petID, req.ImageID)
		if err != nil {
			code, errCode, msg := parseServiceError(err)
			return apiError(c, code, errCode, msg)
		}
		return c.JSON(http.StatusCreated, img)
	}

	// DeleteImage handles DELETE /api/pets/:id/images/:imageId
	func (h *PetHandler) DeleteImage(c echo.Context) error {
		petID := c.Param("id")
		imageID := c.Param("imageId")
		callerID := mw.GetUserID(c)

		if err := h.pets.DeleteImage(c.Request().Context(), callerID, petID, imageID); err != nil {
			code, errCode, msg := parseServiceError(err)
			return apiError(c, code, errCode, msg)
		}
		return c.NoContent(http.StatusNoContent)
	}

	// SetPrimaryImage handles PUT /api/pets/:id/images/:imageId/primary
	func (h *PetHandler) SetPrimaryImage(c echo.Context) error {
		petID := c.Param("id")
		imageID := c.Param("imageId")
		callerID := mw.GetUserID(c)

		if err := h.pets.SetPrimaryImage(c.Request().Context(), callerID, petID, imageID); err != nil {
			code, errCode, msg := parseServiceError(err)
			return apiError(c, code, errCode, msg)
		}
		return c.NoContent(http.StatusNoContent)
	}

	// DeletePet handles DELETE /api/pets/:id
	func (h *PetHandler) DeletePet(c echo.Context) error {
		petID := c.Param("id")
		callerID := mw.GetUserID(c)

		if err := h.pets.DeletePet(c.Request().Context(), callerID, petID); err != nil {
			code, errCode, msg := parseServiceError(err)
			return apiError(c, code, errCode, msg)
		}
		return c.NoContent(http.StatusNoContent)
	}
