package service

import (
	"context"
	"fmt"

	"pata-cao/internal/models"
	"pata-cao/internal/repository/postgres"
)

// ReviewService handles review business logic.
type ReviewService struct {
	reviews   postgres.ReviewRepository
	bookings  postgres.BookingRepository
	providers postgres.ProviderRepository
	search    SearchService // nil disables provider re-indexing after rating updates
}

// NewReviewService creates a new ReviewService. Pass nil for search to skip
// Typesense rating sync (the Postgres rating still updates either way).
func NewReviewService(
	reviews postgres.ReviewRepository,
	bookings postgres.BookingRepository,
	providers postgres.ProviderRepository,
	search SearchService,
) *ReviewService {
	return &ReviewService{reviews: reviews, bookings: bookings, providers: providers, search: search}
}

// CreateReview creates a review after verifying all preconditions.
func (s *ReviewService) CreateReview(ctx context.Context, reviewerID string, r *models.Review) error {
	if r.Rating < 1 || r.Rating > 5 {
		return fmt.Errorf("VALIDATION_ERROR: rating must be between 1 and 5")
	}

	// Verify booking exists and belongs to reviewer.
	booking, err := s.bookings.GetByID(ctx, r.BookingID)
	if err != nil {
		return fmt.Errorf("BOOKING_NOT_FOUND: booking does not exist")
	}
	if booking.OwnerID != reviewerID {
		return fmt.Errorf("FORBIDDEN: you are not the owner of this booking")
	}
	if booking.Status != "completed" {
		return fmt.Errorf("BOOKING_NOT_COMPLETED: can only review completed bookings")
	}

	// Check for duplicate review (also enforced at DB level).
	existing, err := s.reviews.GetByBookingID(ctx, r.BookingID)
	if err == nil && existing != nil {
		return fmt.Errorf("REVIEW_EXISTS: a review already exists for this booking")
	}

	r.ReviewerID = reviewerID
	r.ProviderID = booking.ProviderID

	if err := s.reviews.Create(ctx, r); err != nil {
		if isUniqueErr(err) {
			return fmt.Errorf("REVIEW_EXISTS: a review already exists for this booking")
		}
		return fmt.Errorf("INTERNAL_ERROR: failed to create review")
	}

	// Recalculate provider rating.
	go s.recalculateRating(context.Background(), booking.ProviderID)

	return nil
}

// GetProviderReviews returns approved reviews for a provider (public).
func (s *ReviewService) GetProviderReviews(ctx context.Context, providerID string) ([]models.Review, error) {
	return s.reviews.ListByProvider(ctx, providerID, "approved")
}

// recalculateRating recalculates and persists the provider's average rating,
// then best-effort re-indexes the provider in Typesense so search results
// reflect the new avg_rating / review_count.
func (s *ReviewService) recalculateRating(ctx context.Context, providerID string) {
	reviews, err := s.reviews.ListByProvider(ctx, providerID, "approved")
	if err != nil || len(reviews) == 0 {
		return
	}

	var sum float64
	for _, r := range reviews {
		sum += float64(r.Rating)
	}
	avg := sum / float64(len(reviews))
	if err := s.providers.UpdateRating(ctx, providerID, avg, len(reviews)); err != nil {
		return
	}
	if s.search != nil {
		if p, err := s.providers.GetByID(ctx, providerID); err == nil && p.Status == "approved" {
			_ = s.search.IndexProvider(ctx, p)
		}
	}
}
