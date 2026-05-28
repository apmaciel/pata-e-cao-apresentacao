package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/jmoiron/sqlx"

	"pata-cao/internal/models"
)

// BookingRepository defines persistence operations for bookings.
type BookingRepository interface {
	Create(ctx context.Context, b *models.Booking) error
	GetByID(ctx context.Context, id string) (*models.Booking, error)
	ListByOwner(ctx context.Context, ownerID string) ([]models.Booking, error)
	ListByProvider(ctx context.Context, providerID string) ([]models.Booking, error)
	UpdateStatus(ctx context.Context, id string, status string, reason *string) error
	HasConfirmedBooking(ctx context.Context, providerID, ownerID string) (bool, error)
}

type bookingRepo struct {
	db *sqlx.DB
}

// NewBookingRepository returns a BookingRepository backed by PostgreSQL.
func NewBookingRepository(db *sqlx.DB) BookingRepository {
	return &bookingRepo{db: db}
}

func (r *bookingRepo) Create(ctx context.Context, b *models.Booking) error {
	query := `
		INSERT INTO bookings (owner_id, provider_id, pet_id, service_type, start_date, end_date, notes, price_cents)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, status, created_at, updated_at`
	err := r.db.QueryRowContext(ctx, query,
		b.OwnerID, b.ProviderID, b.PetID, b.ServiceType,
		b.StartDate, b.EndDate, b.Notes, b.PriceCents,
	).Scan(&b.ID, &b.Status, &b.CreatedAt, &b.UpdatedAt)
	if err != nil {
		// Detect unique constraint violation for double-booking.
		if isUniqueViolation(err) {
			return &BookingConflictError{Message: "provider already has a booking for this time slot"}
		}
		return err
	}
	return nil
}

func (r *bookingRepo) GetByID(ctx context.Context, id string) (*models.Booking, error) {
	var b models.Booking
	err := r.db.GetContext(ctx, &b,
		`SELECT id, owner_id, provider_id, pet_id, service_type, start_date, end_date, status, notes,
		        price_cents, cancelled_reason, created_at, updated_at
		 FROM bookings WHERE id = $1`, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("booking not found")
		}
		return nil, err
	}
	return &b, nil
}

func (r *bookingRepo) ListByOwner(ctx context.Context, ownerID string) ([]models.Booking, error) {
	var bookings []models.Booking
	err := r.db.SelectContext(ctx, &bookings,
		`SELECT id, owner_id, provider_id, pet_id, service_type, start_date, end_date, status, notes,
		        price_cents, cancelled_reason, created_at, updated_at
		 FROM bookings WHERE owner_id = $1 ORDER BY start_date DESC`, ownerID)
	return bookings, err
}

func (r *bookingRepo) ListByProvider(ctx context.Context, providerID string) ([]models.Booking, error) {
	var bookings []models.Booking
	err := r.db.SelectContext(ctx, &bookings,
		`SELECT id, owner_id, provider_id, pet_id, service_type, start_date, end_date, status, notes,
		        price_cents, cancelled_reason, created_at, updated_at
		 FROM bookings WHERE provider_id = $1 ORDER BY start_date DESC`, providerID)
	return bookings, err
}

func (r *bookingRepo) UpdateStatus(ctx context.Context, id, status string, reason *string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE bookings SET status=$1, cancelled_reason=$2, updated_at=NOW() WHERE id=$3`,
		status, reason, id)
	return err
}

// HasConfirmedBooking returns true when the owner has a confirmed booking with the provider.
// Used to authorize access to pet health records.
func (r *bookingRepo) HasConfirmedBooking(ctx context.Context, providerID, ownerID string) (bool, error) {
	var exists bool
	err := r.db.QueryRowContext(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM bookings
			WHERE provider_id = $1 AND owner_id = $2 AND status = 'confirmed'
		)`, providerID, ownerID).Scan(&exists)
	return exists, err
}

// ── errors ────────────────────────────────────────────────────────────────────

// BookingConflictError is returned when a double-booking is detected.
type BookingConflictError struct {
	Message string
}

func (e *BookingConflictError) Error() string { return e.Message }

// isUniqueViolation detects PostgreSQL unique constraint violation (code 23505).
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "23505") ||
		strings.Contains(err.Error(), "unique constraint") ||
		strings.Contains(err.Error(), "duplicate key")
}
