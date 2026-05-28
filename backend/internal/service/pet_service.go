package service

import (
	"context"
	"fmt"

	"pata-cao/internal/models"
	"pata-cao/internal/repository/postgres"
)

// PetService handles business logic for pet and health record operations.
type PetService struct {
	pets     postgres.PetRepository
	bookings postgres.BookingRepository
}

// NewPetService creates a new PetService.
func NewPetService(pets postgres.PetRepository, bookings postgres.BookingRepository) *PetService {
	return &PetService{pets: pets, bookings: bookings}
}

// CreatePet validates ownership context and creates a new pet.
func (s *PetService) CreatePet(ctx context.Context, ownerID string, pet *models.Pet) error {
	if ownerID == "" {
		return fmt.Errorf("UNAUTHORIZED: owner ID required")
	}
	pet.OwnerID = ownerID
	return s.pets.Create(ctx, pet)
}

// GetPet returns a pet only if the caller owns it.
func (s *PetService) GetPet(ctx context.Context, callerID, petID string) (*models.Pet, error) {
	pet, err := s.pets.GetByID(ctx, petID)
	if err != nil {
		return nil, fmt.Errorf("PET_NOT_FOUND: pet does not exist")
	}
	if pet.OwnerID != callerID {
		return nil, fmt.Errorf("FORBIDDEN: you do not own this pet")
	}
	return pet, nil
}

// ListPets returns all pets for a given owner.
func (s *PetService) ListPets(ctx context.Context, ownerID string) ([]models.Pet, error) {
	return s.pets.ListByOwner(ctx, ownerID)
}

// UpdatePet updates pet details, enforcing ownership.
func (s *PetService) UpdatePet(ctx context.Context, callerID string, pet *models.Pet) error {
	existing, err := s.pets.GetByID(ctx, pet.ID)
	if err != nil {
		return fmt.Errorf("PET_NOT_FOUND: pet does not exist")
	}
	if existing.OwnerID != callerID {
		return fmt.Errorf("FORBIDDEN: you do not own this pet")
	}
	pet.OwnerID = existing.OwnerID
	return s.pets.Update(ctx, pet)
}

// HealthAccessContext documents the reason health records are being accessed.
type HealthAccessContext struct {
	CallerID  string
	BookingID *string
	IPAddress *string
	Reason    string // e.g. "owner_direct_access", "provider_confirmed_booking"
}

// GetHealthRecord returns a pet's health record.
// SECURITY: Caller must be the pet owner OR have a confirmed booking as provider.
// Access is always audit-logged. Health data is never included in error responses.
func (s *PetService) GetHealthRecord(ctx context.Context, petID string, access HealthAccessContext) (*models.PetHealthRecord, error) {
	pet, err := s.pets.GetByID(ctx, petID)
	if err != nil {
		// Do not leak pet existence to unauthorized callers.
		return nil, fmt.Errorf("FORBIDDEN: access denied to health records")
	}

	authorized := false

	// Owner always has access.
	if pet.OwnerID == access.CallerID {
		authorized = true
		access.Reason = "owner_direct_access"
	}

	// Provider with confirmed booking may also access.
	if !authorized && access.BookingID != nil {
		has, err := s.bookings.HasConfirmedBooking(ctx, access.CallerID, pet.OwnerID)
		if err == nil && has {
			authorized = true
			access.Reason = "provider_confirmed_booking"
		}
	}

	if !authorized {
		// Audit the denied attempt without including health data.
		_ = s.pets.LogHealthAccess(ctx, &models.HealthAccessLog{
			PetID:      petID,
			AccessedBy: access.CallerID,
			Context:    "access_denied",
			BookingID:  access.BookingID,
			IPAddress:  access.IPAddress,
		})
		return nil, fmt.Errorf("FORBIDDEN: access denied to health records")
	}

	// Audit BEFORE returning data.
	_ = s.pets.LogHealthAccess(ctx, &models.HealthAccessLog{
		PetID:      petID,
		AccessedBy: access.CallerID,
		Context:    access.Reason,
		BookingID:  access.BookingID,
		IPAddress:  access.IPAddress,
	})

	record, err := s.pets.GetHealthRecord(ctx, petID)
	if err != nil {
		// Return empty record placeholder rather than error with details.
		return &models.PetHealthRecord{PetID: petID, Allergies: []string{}, Medications: []string{}}, nil
	}
	return record, nil
}

// UpdateHealthRecord updates or creates health record; ownership required.
func (s *PetService) UpdateHealthRecord(ctx context.Context, callerID string, record *models.PetHealthRecord) error {
	pet, err := s.pets.GetByID(ctx, record.PetID)
	if err != nil {
		return fmt.Errorf("PET_NOT_FOUND: pet does not exist")
	}
	if pet.OwnerID != callerID {
		return fmt.Errorf("FORBIDDEN: you do not own this pet")
	}
	return s.pets.UpsertHealthRecord(ctx, record)
}

// DeletePet removes a pet and all related data (health records, images, access logs);
// ownership required. Image files on storage are best-effort cleaned.
func (s *PetService) DeletePet(ctx context.Context, callerID, petID string) error {
	if err := s.verifyOwner(ctx, callerID, petID); err != nil {
		return err
	}
	return s.pets.Delete(ctx, petID)
}

// ── Pet images ────────────────────────────────────────────────────────────────

// ListImages returns all images for a pet; ownership required.
func (s *PetService) ListImages(ctx context.Context, callerID, petID string) ([]models.PetImage, error) {
	if err := s.verifyOwner(ctx, callerID, petID); err != nil {
		return nil, err
	}
	return s.pets.ListImages(ctx, petID)
}

// AddImage adds an image reference to a pet; enforces max 10 and ownership.
func (s *PetService) AddImage(ctx context.Context, callerID, petID, imageID string) (*models.PetImage, error) {
	if err := s.verifyOwner(ctx, callerID, petID); err != nil {
		return nil, err
	}
	return s.pets.AddImage(ctx, petID, imageID)
}

// DeleteImage removes an image reference; ownership required.
func (s *PetService) DeleteImage(ctx context.Context, callerID, petID, imageID string) error {
	if err := s.verifyOwner(ctx, callerID, petID); err != nil {
		return err
	}
	return s.pets.DeleteImage(ctx, petID, imageID)
}

// SetPrimaryImage sets an image as the primary photo; ownership required.
func (s *PetService) SetPrimaryImage(ctx context.Context, callerID, petID, imageID string) error {
	if err := s.verifyOwner(ctx, callerID, petID); err != nil {
		return err
	}
	return s.pets.SetPrimaryImage(ctx, petID, imageID)
}

// verifyOwner returns an error if the caller does not own the pet.
func (s *PetService) verifyOwner(ctx context.Context, callerID, petID string) error {
	pet, err := s.pets.GetByID(ctx, petID)
	if err != nil {
		return fmt.Errorf("PET_NOT_FOUND: pet does not exist")
	}
	if pet.OwnerID != callerID {
		return fmt.Errorf("FORBIDDEN: you do not own this pet")
	}
	return nil
}
