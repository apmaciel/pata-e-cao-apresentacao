package models

import "time"

// Review represents a post-booking review left by an owner for a provider.
// Status values: pending, approved, rejected, flagged.
type Review struct {
	ID               string    `db:"id" json:"id"`
	BookingID        string    `db:"booking_id" json:"bookingId"`
	ReviewerID       string    `db:"reviewer_id" json:"reviewerId"`
	ProviderID       string    `db:"provider_id" json:"providerId"`
	Rating           int       `db:"rating" json:"rating"`
	Text             *string   `db:"text" json:"text,omitempty"`
	Status           string    `db:"status" json:"status"`
	ProviderResponse *string   `db:"provider_response" json:"providerResponse,omitempty"`
	CreatedAt        time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt        time.Time `db:"updated_at" json:"updatedAt"`
}
