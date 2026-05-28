package models

import "time"

// PetImage represents a photo in a pet's gallery.
type PetImage struct {
	ID        string    `db:"id" json:"id"`
	PetID     string    `db:"pet_id" json:"petId"`
	ImageID   string    `db:"image_id" json:"imageId"`
	SortOrder int       `db:"sort_order" json:"sortOrder"`
	IsPrimary bool      `db:"is_primary" json:"isPrimary"`
	CreatedAt time.Time `db:"created_at" json:"createdAt"`
}

// AddImageRequest is the body for POST /api/pets/:id/images.
type AddImageRequest struct {
	ImageID string `json:"imageId" validate:"required,min=1,max=500"`
}
