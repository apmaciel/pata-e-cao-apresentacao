package service

import (
	"context"
	"fmt"
	"strings"

	"pata-cao/internal/models"
	"pata-cao/internal/repository/postgres"
)

// ReportService trata lógica de negócio de denúncias de prestadores.
type ReportService struct {
	reports   postgres.ReportRepository
	providers postgres.ProviderRepository
}

// NewReportService cria um novo ReportService.
func NewReportService(reports postgres.ReportRepository, providers postgres.ProviderRepository) *ReportService {
	return &ReportService{reports: reports, providers: providers}
}

// SubmitReport valida e registra uma denúncia contra um prestador. Público —
// não exige autenticação; fingerprint identifica o denunciante.
func (s *ReportService) SubmitReport(ctx context.Context, providerID, fingerprint, reason string, details *string) error {
	if strings.TrimSpace(fingerprint) == "" {
		return fmt.Errorf("VALIDATION_ERROR: reporterId is required")
	}
	if !models.ValidReportReasons[reason] {
		return fmt.Errorf("VALIDATION_ERROR: invalid reason")
	}
	if _, err := s.providers.GetByID(ctx, providerID); err != nil {
		return fmt.Errorf("PROVIDER_NOT_FOUND: provider not found")
	}

	if details != nil {
		trimmed := strings.TrimSpace(*details)
		if trimmed == "" {
			details = nil
		} else {
			details = &trimmed
		}
	}

	if err := s.reports.Create(ctx, providerID, fingerprint, reason, details); err != nil {
		return fmt.Errorf("INTERNAL_ERROR: failed to submit report")
	}
	return nil
}

// ListReportedProviders retorna o resumo de denúncias por prestador (admin).
// status opcional filtra por 'open'/'reviewed'; vazio retorna todos.
func (s *ReportService) ListReportedProviders(ctx context.Context, status string) ([]models.ProviderReportSummary, error) {
	return s.reports.ListSummary(ctx, status)
}

// GetProviderReportLog retorna o log completo de denúncias de um prestador (admin).
func (s *ReportService) GetProviderReportLog(ctx context.Context, providerID string) ([]models.ProviderReport, error) {
	return s.reports.ListByProvider(ctx, providerID)
}

// MarkProviderReviewed marca as denúncias abertas de um prestador como revisadas (admin).
func (s *ReportService) MarkProviderReviewed(ctx context.Context, providerID string) error {
	return s.reports.MarkReviewed(ctx, providerID)
}
