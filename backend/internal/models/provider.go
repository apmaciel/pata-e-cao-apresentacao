package models

import (
	"encoding/json"
	"time"
)

// Provider represents a verified service provider profile.
// Status values: pending, under_review, approved, rejected.
// BackgroundCheckStatus values: pending, passed, failed.
// AccountType values: pessoa_fisica, pessoa_juridica.
type Provider struct {
	ID                    string   `db:"id" json:"id"`
	UserID                string   `db:"user_id" json:"userId"`
	BusinessName          string   `db:"business_name" json:"businessName"`
	CompanyName           *string  `db:"company_name" json:"companyName,omitempty"`
	Bio                   *string  `db:"bio" json:"bio,omitempty"`
	Location              *string  `db:"location" json:"location,omitempty"`
	Services              []string `db:"services" json:"services"`
	Status                string   `db:"status" json:"status"`
	BackgroundCheckStatus string   `db:"background_check_status" json:"backgroundCheckStatus"`
	AvgRating             float64  `db:"avg_rating" json:"avgRating"`
	ReviewCount           int      `db:"review_count" json:"reviewCount"`
	LogoImageID           *string  `db:"logo_image_id" json:"logoImageId,omitempty"`

	// Application fields — collected via the public registration form.
	AccountType             string     `db:"account_type" json:"accountType"`
	BirthDate               *time.Time `db:"birth_date" json:"birthDate,omitempty"`
	DocumentType            *string    `db:"document_type" json:"documentType,omitempty"`
	DocumentFileName        *string    `db:"document_file_name" json:"documentFileName,omitempty"`
	DocumentImageID         *string    `db:"document_image_id" json:"documentImageId,omitempty"`
	SocialLink              *string    `db:"social_link" json:"socialLink,omitempty"`
	LegalRepresentativeName *string    `db:"legal_representative_name" json:"legalRepresentativeName,omitempty"`
	TaxID                   *string    `db:"tax_id" json:"taxId,omitempty"`

	// Onboarding / service-preference fields.
	AcceptsDogs           bool       `db:"accepts_dogs" json:"acceptsDogs"`
	AcceptsCats           bool       `db:"accepts_cats" json:"acceptsCats"`
	AcceptsNeutered       bool       `db:"accepts_neutered" json:"acceptsNeutered"`
	AcceptsIntact         bool       `db:"accepts_intact" json:"acceptsIntact"`
	Whatsapp              *string    `db:"whatsapp" json:"whatsapp,omitempty"`
	OnboardingCompletedAt *time.Time `db:"onboarding_completed_at" json:"onboardingCompletedAt,omitempty"`

	// Social links (mirrors users.social_links pattern).
	SocialLinks json.RawMessage `db:"social_links" json:"socialLinks,omitempty"`

	// Rate-limit tracking for restricted fields (one change per calendar month).
	LastBusinessNameChange *time.Time `db:"last_business_name_change" json:"-"`
	LastLogoChange         *time.Time `db:"last_logo_change" json:"-"`
	LastServiceChange      *time.Time `db:"last_service_change" json:"-"`

	// Populated only by the admin list query (LEFT JOIN users).
	Email string `json:"email,omitempty"`
	Phone string `json:"phone,omitempty"`

	// Gallery images — loaded separately via ListGalleryImages.
	GalleryImages []ProviderGalleryImage `json:"galleryImages,omitempty"`

	CreatedAt time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt time.Time `db:"updated_at" json:"updatedAt"`
}

// ProviderOnboardingToken represents a one-time setup token.
type ProviderOnboardingToken struct {
	ID         string     `db:"id" json:"id"`
	ProviderID string     `db:"provider_id" json:"providerId"`
	TokenHash  string     `db:"token_hash" json:"-"`
	ExpiresAt  time.Time  `db:"expires_at" json:"expiresAt"`
	ConsumedAt *time.Time `db:"consumed_at" json:"consumedAt,omitempty"`
	CreatedAt  time.Time  `db:"created_at" json:"createdAt"`
}

// ProviderGalleryImage represents a single image in a provider's gallery.
type ProviderGalleryImage struct {
	ID         string    `db:"id" json:"id"`
	ProviderID string    `db:"provider_id" json:"providerId"`
	ImageID    string    `db:"image_id" json:"imageId"`
	SortOrder  int       `db:"sort_order" json:"sortOrder"`
	CreatedAt  time.Time `db:"created_at" json:"createdAt"`
}

// ProviderAuditEntry represents a single row in the provider_verification_audit
// table. Admin-only data; exposed via the admin API so the dashboard can show
// who approved/suspended/unsuspended each provider and why.
type ProviderAuditEntry struct {
	ID             string    `db:"id" json:"id"`
	ProviderID     string    `db:"provider_id" json:"providerId"`
	AdminID        string    `db:"admin_id" json:"adminId"`
	AdminEmail     string    `db:"admin_email" json:"adminEmail"`
	Action         string    `db:"action" json:"action"`
	PreviousStatus *string   `db:"previous_status" json:"previousStatus,omitempty"`
	NewStatus      *string   `db:"new_status" json:"newStatus,omitempty"`
	Notes          *string   `db:"notes" json:"notes,omitempty"`
	CreatedAt      time.Time `db:"created_at" json:"createdAt"`
}
