package models

import (
	"encoding/json"
	"time"
)

// Pet represents a pet owned by a user.
type Pet struct {
	ID           string    `db:"id" json:"id"`
	OwnerID      string    `db:"owner_id" json:"ownerId"`
	Slug         string    `db:"slug" json:"slug"`
	Name         string    `db:"name" json:"name"`
	Species      string    `db:"species" json:"species"`
	Breed        *string   `db:"breed" json:"breed,omitempty"`
	BirthDate    *time.Time `db:"birth_date" json:"birthDate,omitempty"`
	Color        *string   `db:"color" json:"color,omitempty"`
	WeightKg     *float64  `db:"weight_kg" json:"weightKg,omitempty"`
	HeightCm     *float64  `db:"height_cm" json:"heightCm,omitempty"`
	Size         string    `db:"size" json:"size"`
	AgeYears     *int      `db:"age_years" json:"ageYears,omitempty"`
	PhotoImageID *string   `db:"photo_image_id" json:"photoImageId,omitempty"`
	CreatedAt    time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt    time.Time `db:"updated_at" json:"updatedAt"`
}

// PetHealthRecord stores sensitive health information for a pet.
// Access to this struct must always be audit-logged.
type PetHealthRecord struct {
	ID             string    `db:"id" json:"id"`
	PetID          string    `db:"pet_id" json:"petId"`
	Vaccinations   json.RawMessage `db:"vaccinations" json:"vaccinations"` // JSONB
	Allergies      []string  `db:"allergies" json:"allergies"`
	Medications    []string  `db:"medications" json:"medications"`
	SpecialNeeds   *string   `db:"special_needs" json:"specialNeeds,omitempty"`
	IsSensitive    *bool     `db:"is_sensitive" json:"isSensitive,omitempty"`
	IsNeutered     *bool     `db:"is_neutered" json:"isNeutered,omitempty"`
	BehaviorNotes  *string   `db:"behavior_notes" json:"behaviorNotes,omitempty"`
	VetName        *string   `db:"vet_name" json:"vetName,omitempty"`
	VetPhone       *string   `db:"vet_phone" json:"vetPhone,omitempty"`
	VetEmail       *string   `db:"vet_email" json:"vetEmail,omitempty"`
	CreatedAt      time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt      time.Time `db:"updated_at" json:"updatedAt"`
}

// HealthAccessLog records every access to a pet's health data.
type HealthAccessLog struct {
	ID         string  `db:"id" json:"id"`
	PetID      string  `db:"pet_id" json:"petId"`
	AccessedBy string  `db:"accessed_by" json:"accessedBy"`
	Context    string  `db:"context" json:"context"`
	BookingID  *string `db:"booking_id" json:"bookingId,omitempty"`
	IPAddress  *string `db:"ip_address" json:"ipAddress,omitempty"`
}
