package models

import "time"

// Booking represents a service booking between an owner and a provider.
// Status values: pending, confirmed, completed, cancelled.
type Booking struct {
	ID              string    `db:"id" json:"id"`
	OwnerID         string    `db:"owner_id" json:"ownerId"`
	ProviderID      string    `db:"provider_id" json:"providerId"`
	PetID           string    `db:"pet_id" json:"petId"`
	ServiceType     string    `db:"service_type" json:"serviceType"`
	StartDate       time.Time `db:"start_date" json:"startDate"`
	EndDate         time.Time `db:"end_date" json:"endDate"`
	Status          string    `db:"status" json:"status"`
	Notes           *string   `db:"notes" json:"notes,omitempty"`
	PriceCents      *int      `db:"price_cents" json:"priceCents,omitempty"`
	CancelledReason *string   `db:"cancelled_reason" json:"cancelledReason,omitempty"`
	CreatedAt       time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt       time.Time `db:"updated_at" json:"updatedAt"`
}
