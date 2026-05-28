package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/jmoiron/sqlx"

	"pata-cao/internal/models"
)

// ReviewRepository defines persistence operations for reviews.
type ReviewRepository interface {
	Create(ctx context.Context, r *models.Review) error
	GetByID(ctx context.Context, id string) (*models.Review, error)
	GetByBookingID(ctx context.Context, bookingID string) (*models.Review, error)
	ListByProvider(ctx context.Context, providerID string, status string) ([]models.Review, error)
	UpdateStatus(ctx context.Context, id string, status string) error
	AddProviderResponse(ctx context.Context, id string, response string) error
}

type reviewRepo struct {
	db *sqlx.DB
}

// NewReviewRepository returns a ReviewRepository backed by PostgreSQL.
func NewReviewRepository(db *sqlx.DB) ReviewRepository {
	return &reviewRepo{db: db}
}

func (r *reviewRepo) Create(ctx context.Context, rev *models.Review) error {
	query := `
		INSERT INTO reviews (booking_id, reviewer_id, provider_id, rating, text)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, status, created_at, updated_at`
	err := r.db.QueryRowContext(ctx, query,
		rev.BookingID, rev.ReviewerID, rev.ProviderID, rev.Rating, rev.Text,
	).Scan(&rev.ID, &rev.Status, &rev.CreatedAt, &rev.UpdatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return fmt.Errorf("review already exists for this booking")
		}
		return err
	}
	return nil
}

func (r *reviewRepo) GetByID(ctx context.Context, id string) (*models.Review, error) {
	var rev models.Review
	err := r.db.GetContext(ctx, &rev,
		`SELECT id, booking_id, reviewer_id, provider_id, rating, text, status, provider_response, created_at, updated_at
		 FROM reviews WHERE id = $1`, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("review not found")
		}
		return nil, err
	}
	return &rev, nil
}

func (r *reviewRepo) GetByBookingID(ctx context.Context, bookingID string) (*models.Review, error) {
	var rev models.Review
	err := r.db.GetContext(ctx, &rev,
		`SELECT id, booking_id, reviewer_id, provider_id, rating, text, status, provider_response, created_at, updated_at
		 FROM reviews WHERE booking_id = $1`, bookingID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("review not found")
		}
		return nil, err
	}
	return &rev, nil
}

func (r *reviewRepo) ListByProvider(ctx context.Context, providerID string, status string) ([]models.Review, error) {
	var reviews []models.Review
	err := r.db.SelectContext(ctx, &reviews,
		`SELECT id, booking_id, reviewer_id, provider_id, rating, text, status, provider_response, created_at, updated_at
		 FROM reviews WHERE provider_id = $1 AND status = $2 ORDER BY created_at DESC`,
		providerID, status)
	return reviews, err
}

func (r *reviewRepo) UpdateStatus(ctx context.Context, id, status string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE reviews SET status=$1, updated_at=NOW() WHERE id=$2`, status, id)
	return err
}

func (r *reviewRepo) AddProviderResponse(ctx context.Context, id, response string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE reviews SET provider_response=$1, updated_at=NOW() WHERE id=$2`, response, id)
	return err
}
