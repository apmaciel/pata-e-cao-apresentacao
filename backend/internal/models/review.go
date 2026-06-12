package models

import "time"

// Review representa uma avaliação pós-reserva deixada por um dono para um prestador.
// Valores de Status: pending, approved, rejected, flagged.
type Review struct {
	ID               string    `db:"id" json:"id"`
	ReviewerID       string    `db:"reviewer_id" json:"reviewerId"`
	ProviderID       string    `db:"provider_id" json:"providerId"`
	Rating           int       `db:"rating" json:"rating"`
	Text             *string   `db:"text" json:"text,omitempty"`
	Status           string    `db:"status" json:"status"`
	ProviderResponse *string   `db:"provider_response" json:"providerResponse,omitempty"`
	CreatedAt        time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt        time.Time `db:"updated_at" json:"updatedAt"`
}
