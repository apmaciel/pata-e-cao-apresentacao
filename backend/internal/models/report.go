package models

import "time"

// Valores válidos de ReportReason.
const (
	ReportReasonFraud         = "fraud"
	ReportReasonInappropriate = "inappropriate_behavior"
	ReportReasonFalseInfo     = "false_information"
	ReportReasonOther         = "other"
)

// ValidReportReasons enumera os motivos de denúncia aceitos.
var ValidReportReasons = map[string]bool{
	ReportReasonFraud:         true,
	ReportReasonInappropriate: true,
	ReportReasonFalseInfo:     true,
	ReportReasonOther:         true,
}

// ProviderReport representa uma denúncia enviada por um visitante (autenticado
// ou não) contra um prestador. reporter_fingerprint identifica o denunciante
// sem exigir login e nunca é exposto via JSON.
// Valores de Status: open, reviewed.
type ProviderReport struct {
	ID          string    `db:"id" json:"id"`
	ProviderID  string    `db:"provider_id" json:"providerId"`
	Fingerprint string    `db:"reporter_fingerprint" json:"-"`
	Reason      string    `db:"reason" json:"reason"`
	Details     *string   `db:"details" json:"details,omitempty"`
	Status      string    `db:"status" json:"status"`
	CreatedAt   time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt   time.Time `db:"updated_at" json:"updatedAt"`
}

// ProviderReportSummary agrega denúncias por prestador para a fila do admin.
type ProviderReportSummary struct {
	ProviderID     string    `db:"provider_id" json:"providerId"`
	BusinessName   string    `db:"business_name" json:"businessName"`
	ProviderStatus string    `db:"provider_status" json:"providerStatus"`
	ReportCount    int       `db:"report_count" json:"reportCount"`
	LastReportAt   time.Time `db:"last_report_at" json:"lastReportAt"`
}
