package models

import (
	"encoding/json"
	"time"
)

// Provider representa um perfil de prestador de serviço verificado.
// Valores de Status: pending, under_review, approved, rejected.
// Valores de BackgroundCheckStatus: pending, passed, failed.
// Valores de AccountType: pessoa_fisica, pessoa_juridica.
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

	// Campos de aplicação — coletados via formulário público de registro.
	AccountType             string     `db:"account_type" json:"accountType"`
	BirthDate               *time.Time `db:"birth_date" json:"birthDate,omitempty"`
	DocumentType            *string    `db:"document_type" json:"documentType,omitempty"`
	DocumentFileName        *string    `db:"document_file_name" json:"documentFileName,omitempty"`
	DocumentImageID         *string    `db:"document_image_id" json:"documentImageId,omitempty"`
	SocialLink              *string    `db:"social_link" json:"socialLink,omitempty"`
	LegalRepresentativeName *string    `db:"legal_representative_name" json:"legalRepresentativeName,omitempty"`
	TaxID                   *string    `db:"tax_id" json:"taxId,omitempty"`

	// Campos de onboarding / preferências de serviço.
	AcceptsDogs           bool       `db:"accepts_dogs" json:"acceptsDogs"`
	AcceptsCats           bool       `db:"accepts_cats" json:"acceptsCats"`
	AcceptsNeutered       bool       `db:"accepts_neutered" json:"acceptsNeutered"`
	AcceptsIntact         bool       `db:"accepts_intact" json:"acceptsIntact"`
	Whatsapp              *string    `db:"whatsapp" json:"whatsapp,omitempty"`
	OnboardingCompletedAt *time.Time `db:"onboarding_completed_at" json:"onboardingCompletedAt,omitempty"`

	// Links sociais (espelha o padrão users.social_links).
	SocialLinks json.RawMessage `db:"social_links" json:"socialLinks,omitempty"`

	// Controle de rate-limit para campos restritos (uma alteração por mês).
	LastBusinessNameChange *time.Time `db:"last_business_name_change" json:"-"`
	LastLogoChange         *time.Time `db:"last_logo_change" json:"-"`
	LastServiceChange      *time.Time `db:"last_service_change" json:"-"`

	// Preenchido apenas pela query de listagem admin (LEFT JOIN users).
	Email string `json:"email,omitempty"`
	Phone string `json:"phone,omitempty"`

	// Imagens da galeria — carregadas separadamente via ListGalleryImages.
	GalleryImages []ProviderGalleryImage `json:"galleryImages,omitempty"`

	CreatedAt time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt time.Time `db:"updated_at" json:"updatedAt"`
}

// ProviderOnboardingToken representa um token de configuração única.
type ProviderOnboardingToken struct {
	ID         string     `db:"id" json:"id"`
	ProviderID string     `db:"provider_id" json:"providerId"`
	TokenHash  string     `db:"token_hash" json:"-"`
	ExpiresAt  time.Time  `db:"expires_at" json:"expiresAt"`
	ConsumedAt *time.Time `db:"consumed_at" json:"consumedAt,omitempty"`
	CreatedAt  time.Time  `db:"created_at" json:"createdAt"`
}

// ProviderGalleryImage representa uma única imagem na galeria de um prestador.
type ProviderGalleryImage struct {
	ID         string    `db:"id" json:"id"`
	ProviderID string    `db:"provider_id" json:"providerId"`
	ImageID    string    `db:"image_id" json:"imageId"`
	SortOrder  int       `db:"sort_order" json:"sortOrder"`
	CreatedAt  time.Time `db:"created_at" json:"createdAt"`
}

// AutocompleteSuggestion é um resultado leve de prestador para autocomplete de busca.
type AutocompleteSuggestion struct {
	ID           string   `json:"id"`
	BusinessName string   `json:"businessName"`
	LogoImageID  *string  `json:"logoImageId,omitempty"`
	Services     []string `json:"services"`
	Location     *string  `json:"location,omitempty"`
}

// ProviderAuditEntry representa uma linha na tabela provider_verification_audit.
// Dados restritos a admin; expostos via API admin para o dashboard mostrar
// quem aprovou/suspendeu/removeu suspensão de cada prestador e o motivo.
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
