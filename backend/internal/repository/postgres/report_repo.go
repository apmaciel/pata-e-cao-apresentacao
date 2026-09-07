package postgres

import (
	"context"

	"github.com/jmoiron/sqlx"

	"pata-cao/internal/models"
)

// ReportRepository define operações de persistência para denúncias de prestadores.
type ReportRepository interface {
	Create(ctx context.Context, providerID, fingerprint, reason string, details *string) error
	ListSummary(ctx context.Context, status string) ([]models.ProviderReportSummary, error)
	ListByProvider(ctx context.Context, providerID string) ([]models.ProviderReport, error)
	MarkReviewed(ctx context.Context, providerID string) error
}

type reportRepo struct {
	db *sqlx.DB
}

// NewReportRepository retorna um ReportRepository com PostgreSQL.
func NewReportRepository(db *sqlx.DB) ReportRepository {
	return &reportRepo{db: db}
}

// Create insere uma nova denúncia ou, se o denunciante já denunciou este
// prestador antes, atualiza a denúncia existente (motivo, detalhes e volta
// para status 'open') em vez de criar uma duplicata.
func (r *reportRepo) Create(ctx context.Context, providerID, fingerprint, reason string, details *string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO provider_reports (provider_id, reporter_fingerprint, reason, details)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (provider_id, reporter_fingerprint)
		DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details,
		              status = 'open', updated_at = NOW()`,
		providerID, fingerprint, reason, details)
	return err
}

// ListSummary retorna, para cada prestador com ao menos uma denúncia, a
// contagem de denúncias únicas (uma linha = um denunciante) e a mais recente.
// status filtra por 'open'/'reviewed'; string vazia retorna todos.
func (r *reportRepo) ListSummary(ctx context.Context, status string) ([]models.ProviderReportSummary, error) {
	var summaries []models.ProviderReportSummary
	err := r.db.SelectContext(ctx, &summaries, `
		SELECT pr.provider_id, p.business_name, p.status AS provider_status,
		       COUNT(*) AS report_count, MAX(pr.created_at) AS last_report_at
		  FROM provider_reports pr
		  JOIN providers p ON p.id = pr.provider_id
		 WHERE ($1 = '' OR pr.status = $1)
		 GROUP BY pr.provider_id, p.business_name, p.status
		 ORDER BY last_report_at DESC`, status)
	return summaries, err
}

// ListByProvider retorna o log completo de denúncias de um prestador,
// mais recentes primeiro.
func (r *reportRepo) ListByProvider(ctx context.Context, providerID string) ([]models.ProviderReport, error) {
	var reports []models.ProviderReport
	err := r.db.SelectContext(ctx, &reports, `
		SELECT id, provider_id, reporter_fingerprint, reason, details, status, created_at, updated_at
		  FROM provider_reports
		 WHERE provider_id = $1
		 ORDER BY created_at DESC`, providerID)
	return reports, err
}

// MarkReviewed marca todas as denúncias abertas de um prestador como revisadas.
func (r *reportRepo) MarkReviewed(ctx context.Context, providerID string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE provider_reports SET status = 'reviewed', updated_at = NOW()
		 WHERE provider_id = $1 AND status = 'open'`, providerID)
	return err
}
