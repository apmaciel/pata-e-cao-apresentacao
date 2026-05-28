package postgres

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"

	"pata-cao/internal/models"
)

// PetRepository defines persistence operations for pets and health records.
type PetRepository interface {
	Create(ctx context.Context, pet *models.Pet) error
	GetByID(ctx context.Context, id string) (*models.Pet, error)
	ListByOwner(ctx context.Context, ownerID string) ([]models.Pet, error)
	Update(ctx context.Context, pet *models.Pet) error
	Delete(ctx context.Context, id string) error
	GetHealthRecord(ctx context.Context, petID string) (*models.PetHealthRecord, error)
	UpsertHealthRecord(ctx context.Context, record *models.PetHealthRecord) error
	LogHealthAccess(ctx context.Context, log *models.HealthAccessLog) error
	ListImages(ctx context.Context, petID string) ([]models.PetImage, error)
	AddImage(ctx context.Context, petID, imageID string) (*models.PetImage, error)
	DeleteImage(ctx context.Context, petID, imageID string) error
	SetPrimaryImage(ctx context.Context, petID, imageID string) error
}

type petRepo struct {
	db *sqlx.DB
}

// NewPetRepository returns a PetRepository backed by PostgreSQL.
func NewPetRepository(db *sqlx.DB) PetRepository {
	return &petRepo{db: db}
}

var nonAlphaRegex = regexp.MustCompile(`[^a-z0-9]+`)

func generateSlug(name string) string {
	base := strings.ToLower(name)
	base = nonAlphaRegex.ReplaceAllString(base, "-")
	base = strings.Trim(base, "-")
	if len(base) > 60 {
		base = base[:60]
	}
	b := make([]byte, 2)
	rand.Read(b)
	suffix := hex.EncodeToString(b)
	return base + "-" + suffix
}

func (r *petRepo) Create(ctx context.Context, pet *models.Pet) error {
	// Generate a unique slug, retrying on collision.
	query := `
		INSERT INTO pets (owner_id, slug, name, species, breed, birth_date, color, weight_kg, height_cm, size, age_years, photo_image_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id, slug, created_at, updated_at`

	for attempt := 0; attempt < 5; attempt++ {
		slug := generateSlug(pet.Name)
		err := r.db.QueryRowContext(ctx, query,
			pet.OwnerID, slug, pet.Name, pet.Species, pet.Breed,
			pet.BirthDate, pet.Color, pet.WeightKg, pet.HeightCm, pet.Size,
			pet.AgeYears, pet.PhotoImageID,
		).Scan(&pet.ID, &pet.Slug, &pet.CreatedAt, &pet.UpdatedAt)
		if err != nil {
			if strings.Contains(err.Error(), "duplicate") && strings.Contains(err.Error(), "slug") {
				continue
			}
			return err
		}
		return nil
	}
	return fmt.Errorf("INTERNAL_ERROR: failed to generate unique slug after 5 attempts")
}

const petSelectColumns = `id, owner_id, slug, name, species, breed, birth_date, color, weight_kg, height_cm, size, age_years, photo_image_id, created_at, updated_at`

func (r *petRepo) GetByID(ctx context.Context, id string) (*models.Pet, error) {
	var p models.Pet
	err := r.db.GetContext(ctx, &p,
		`SELECT `+petSelectColumns+` FROM pets WHERE id = $1`, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("pet not found")
		}
		return nil, err
	}
	return &p, nil
}

func (r *petRepo) ListByOwner(ctx context.Context, ownerID string) ([]models.Pet, error) {
	var pets []models.Pet
	err := r.db.SelectContext(ctx, &pets,
		`SELECT `+petSelectColumns+` FROM pets WHERE owner_id = $1 ORDER BY created_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	return pets, nil
}

func (r *petRepo) Update(ctx context.Context, pet *models.Pet) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE pets SET name=$1, species=$2, breed=$3, birth_date=$4, color=$5, weight_kg=$6, height_cm=$7, size=$8, age_years=$9, photo_image_id=$10, updated_at=NOW()
		 WHERE id=$11`,
		pet.Name, pet.Species, pet.Breed, pet.BirthDate, pet.Color, pet.WeightKg, pet.HeightCm, pet.Size, pet.AgeYears, pet.PhotoImageID, pet.ID)
	return err
}

func (r *petRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM pets WHERE id=$1`, id)
	return err
}

func (r *petRepo) GetHealthRecord(ctx context.Context, petID string) (*models.PetHealthRecord, error) {
	var rec models.PetHealthRecord
	row := r.db.QueryRowContext(ctx,
		`SELECT id, pet_id, vaccinations, allergies, medications, special_needs, is_sensitive, is_neutered, behavior_notes, vet_name, vet_phone, vet_email, created_at, updated_at
		 FROM pet_health_records WHERE pet_id = $1`, petID)
	err := row.Scan(
		&rec.ID, &rec.PetID, &rec.Vaccinations,
		pq.Array(&rec.Allergies), pq.Array(&rec.Medications),
		&rec.SpecialNeeds, &rec.IsSensitive, &rec.IsNeutered, &rec.BehaviorNotes,
		&rec.VetName, &rec.VetPhone, &rec.VetEmail,
		&rec.CreatedAt, &rec.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("health record not found")
		}
		return nil, err
	}
	return &rec, nil
}

func (r *petRepo) UpsertHealthRecord(ctx context.Context, record *models.PetHealthRecord) error {
	query := `
		INSERT INTO pet_health_records
			(pet_id, vaccinations, allergies, medications, special_needs, is_sensitive, is_neutered, behavior_notes, vet_name, vet_phone, vet_email)
		VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (pet_id) DO UPDATE SET
			vaccinations   = EXCLUDED.vaccinations,
			allergies      = EXCLUDED.allergies,
			medications    = EXCLUDED.medications,
			special_needs  = EXCLUDED.special_needs,
			is_sensitive   = EXCLUDED.is_sensitive,
			is_neutered    = EXCLUDED.is_neutered,
			behavior_notes = EXCLUDED.behavior_notes,
			vet_name       = EXCLUDED.vet_name,
			vet_phone      = EXCLUDED.vet_phone,
			vet_email      = EXCLUDED.vet_email,
			updated_at     = NOW()
		RETURNING id, created_at, updated_at`
	return r.db.QueryRowContext(ctx, query,
		record.PetID, string(record.Vaccinations),
		pq.Array(record.Allergies), pq.Array(record.Medications),
		record.SpecialNeeds, record.IsSensitive, record.IsNeutered, record.BehaviorNotes,
		record.VetName, record.VetPhone, record.VetEmail,
	).Scan(&record.ID, &record.CreatedAt, &record.UpdatedAt)
}

// LogHealthAccess records every access to sensitive pet health data.
// This function must always be called before returning health records.
func (r *petRepo) LogHealthAccess(ctx context.Context, log *models.HealthAccessLog) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO pet_health_access_log (pet_id, accessed_by, context, booking_id, ip_address)
		 VALUES ($1, $2, $3, $4, $5)`,
		log.PetID, log.AccessedBy, log.Context, log.BookingID, log.IPAddress)
	return err
}

// ── Pet images ────────────────────────────────────────────────────────────────

func (r *petRepo) ListImages(ctx context.Context, petID string) ([]models.PetImage, error) {
	var images []models.PetImage
	err := r.db.SelectContext(ctx, &images,
		`SELECT id, pet_id, image_id, sort_order, is_primary, created_at
		 FROM pet_images WHERE pet_id = $1 ORDER BY sort_order ASC, created_at ASC`, petID)
	if err != nil {
		return nil, err
	}
	return images, nil
}

func (r *petRepo) AddImage(ctx context.Context, petID, imageID string) (*models.PetImage, error) {
	// Enforce max 10 images per pet.
	var count int
	if err := r.db.GetContext(ctx, &count,
		`SELECT COUNT(*) FROM pet_images WHERE pet_id = $1`, petID); err != nil {
		return nil, err
	}
	if count >= 10 {
		return nil, fmt.Errorf("VALIDATION_ERROR: maximum of 10 images per pet")
	}

	img := &models.PetImage{}
	// Set sort_order to the next available position.
	err := r.db.QueryRowContext(ctx,
		`INSERT INTO pet_images (pet_id, image_id, sort_order, is_primary)
		 VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM pet_images WHERE pet_id = $1), $3)
		 RETURNING id, pet_id, image_id, sort_order, is_primary, created_at`,
		petID, imageID, count == 0,
	).Scan(&img.ID, &img.PetID, &img.ImageID, &img.SortOrder, &img.IsPrimary, &img.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") {
			return nil, fmt.Errorf("ALREADY_EXISTS: image already linked")
		}
		return nil, err
	}
	return img, nil
}

func (r *petRepo) DeleteImage(ctx context.Context, petID, imageID string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM pet_images WHERE pet_id = $1 AND image_id = $2`, petID, imageID)
	return err
}

func (r *petRepo) SetPrimaryImage(ctx context.Context, petID, imageID string) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	// Clear existing primary.
	if _, err := tx.ExecContext(ctx,
		`UPDATE pet_images SET is_primary = FALSE WHERE pet_id = $1 AND is_primary = TRUE`, petID); err != nil {
		return err
	}
	// Set new primary.
	if _, err := tx.ExecContext(ctx,
		`UPDATE pet_images SET is_primary = TRUE WHERE pet_id = $1 AND image_id = $2`, petID, imageID); err != nil {
		return err
	}
	return tx.Commit()
}
