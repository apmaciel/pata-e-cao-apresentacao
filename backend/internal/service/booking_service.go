package service

import (
	"context"
	"errors"
	"fmt"

	"pata-cao/internal/models"
	"pata-cao/internal/repository/postgres"
)

// BookingService handles booking business logic.
type BookingService struct {
	bookings  postgres.BookingRepository
	providers postgres.ProviderRepository
}

// NewBookingService creates a new BookingService.
func NewBookingService(
	bookings postgres.BookingRepository,
	providers postgres.ProviderRepository,
) *BookingService {
	return &BookingService{
		bookings:  bookings,
		providers: providers,
	}
}

// CreateBooking creates a new booking after verifying all preconditions.
func (s *BookingService) CreateBooking(ctx context.Context, ownerID string, b *models.Booking) error {
	// Verify provider is approved.
	provider, err := s.providers.GetByID(ctx, b.ProviderID)
	if err != nil {
		return fmt.Errorf("PROVIDER_NOT_FOUND: provider does not exist")
	}
	if provider.Status != "approved" {
		return fmt.Errorf("PROVIDER_NOT_APPROVED: provider is not available for bookings")
	}

	if b.StartDate.IsZero() || b.EndDate.IsZero() {
		return fmt.Errorf("VALIDATION_ERROR: start and end dates are required")
	}
	if !b.EndDate.After(b.StartDate) {
		return fmt.Errorf("VALIDATION_ERROR: end date must be after start date")
	}

	b.OwnerID = ownerID
	if err := s.bookings.Create(ctx, b); err != nil {
		var conflictErr *postgres.BookingConflictError
		if errors.As(err, &conflictErr) {
			return fmt.Errorf("BOOKING_CONFLICT: %s", conflictErr.Message)
		}
		return fmt.Errorf("INTERNAL_ERROR: failed to create booking")
	}
	return nil
}

// GetBooking returns a booking only if the caller is the owner or the provider.
func (s *BookingService) GetBooking(ctx context.Context, callerID, bookingID string) (*models.Booking, error) {
	b, err := s.bookings.GetByID(ctx, bookingID)
	if err != nil {
		return nil, fmt.Errorf("BOOKING_NOT_FOUND: booking does not exist")
	}

	// Resolve provider user ID.
	provider, _ := s.providers.GetByID(ctx, b.ProviderID)
	isProvider := provider != nil && provider.UserID == callerID

	if b.OwnerID != callerID && !isProvider {
		return nil, fmt.Errorf("FORBIDDEN: access denied")
	}
	return b, nil
}

// ListBookings returns all bookings for the calling user (owner or provider).
func (s *BookingService) ListBookings(ctx context.Context, callerID, role string) ([]models.Booking, error) {
	if role == "provider" {
		provider, err := s.providers.GetByUserID(ctx, callerID)
		if err != nil {
			return nil, fmt.Errorf("PROVIDER_NOT_FOUND: no provider profile")
		}
		return s.bookings.ListByProvider(ctx, provider.ID)
	}
	return s.bookings.ListByOwner(ctx, callerID)
}

// ConfirmBooking allows the booking's provider to confirm a pending booking.
func (s *BookingService) ConfirmBooking(ctx context.Context, callerID, bookingID string) error {
	b, err := s.bookings.GetByID(ctx, bookingID)
	if err != nil {
		return fmt.Errorf("BOOKING_NOT_FOUND: booking does not exist")
	}

	provider, err := s.providers.GetByID(ctx, b.ProviderID)
	if err != nil || provider.UserID != callerID {
		return fmt.Errorf("FORBIDDEN: you are not the provider for this booking")
	}

	if b.Status != "pending" {
		return fmt.Errorf("INVALID_STATUS: booking must be pending to confirm (current: %s)", b.Status)
	}

	return s.bookings.UpdateStatus(ctx, bookingID, "confirmed", nil)
}

// CancelBooking allows the owner or provider to cancel a booking.
// Completed bookings cannot be cancelled.
func (s *BookingService) CancelBooking(ctx context.Context, callerID, bookingID, reason string) error {
	b, err := s.bookings.GetByID(ctx, bookingID)
	if err != nil {
		return fmt.Errorf("BOOKING_NOT_FOUND: booking does not exist")
	}

	// Resolve provider user ID.
	provider, _ := s.providers.GetByID(ctx, b.ProviderID)
	isProvider := provider != nil && provider.UserID == callerID

	if b.OwnerID != callerID && !isProvider {
		return fmt.Errorf("FORBIDDEN: access denied")
	}

	if b.Status == "completed" {
		return fmt.Errorf("INVALID_STATUS: completed bookings cannot be cancelled")
	}
	if b.Status == "cancelled" {
		return fmt.Errorf("INVALID_STATUS: booking is already cancelled")
	}

	var r *string
	if reason != "" {
		r = &reason
	}
	return s.bookings.UpdateStatus(ctx, bookingID, "cancelled", r)
}
