package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"

	"pata-cao/internal/models"
)

// ProviderFilters contém os parâmetros para o caminho de fallback SQL.
// O formato espelha service.SearchParams para a camada de serviço traduzir
// diretamente sem redefinir padrões.
type ProviderFilters struct {
	Query          string // ILIKE comparado com business_name, bio, location
	Service        string // correspondência exata com qualquer elemento de services[]
	SortBy         string // "rating" (padrão) ou "reviews"
	Page           int    // número da página baseado em 1
	PerPage        int    // resultados por página (máx 50)
	AcceptsDogs    *bool  // filtra por accepts_dogs (nil = sem filtro)
	AcceptsCats    *bool  // filtra por accepts_cats (nil = sem filtro)
	AcceptsNeutered *bool // filtra por accepts_neutered (nil = sem filtro)
	AcceptsIntact  *bool  // filtra por accepts_intact (nil = sem filtro)
}

// ProviderRepository define operações de persistência para perfis de prestadores.
type ProviderRepository interface {
	Create(ctx context.Context, p *models.Provider) error
	GetByID(ctx context.Context, id string) (*models.Provider, error)
	GetByUserID(ctx context.Context, userID string) (*models.Provider, error)
	ListApproved(ctx context.Context, filters ProviderFilters) ([]models.Provider, error)
	ListAllApproved(ctx context.Context) ([]models.Provider, error)
	CountApproved(ctx context.Context, filters ProviderFilters) (int, error)
	FacetServices(ctx context.Context, filters ProviderFilters) (map[string]int, error)
	ListPending(ctx context.Context) ([]models.Provider, error)
	ListAll(ctx context.Context, status, search string, offset, limit int) ([]models.Provider, error)
	CountAll(ctx context.Context, status, search string) (int, error)
	UpdateStatus(ctx context.Context, id string, status string, adminID string, reason string) error
	Update(ctx context.Context, p *models.Provider) error
	UpdateRating(ctx context.Context, providerID string, avgRating float64, count int) error
	GetAuditLog(ctx context.Context, providerID string) ([]models.ProviderAuditEntry, error)
	Delete(ctx context.Context, id string) error
	AddGalleryImage(ctx context.Context, providerID, imageID string) error
	ListGalleryImages(ctx context.Context, providerID string) ([]models.ProviderGalleryImage, error)
	CountGalleryImages(ctx context.Context, providerID string) (int, error)
	RemoveGalleryImage(ctx context.Context, providerID, imageID string) error
	SetOnboardingCompleted(ctx context.Context, providerID string) error
	ExportAllProviders(ctx context.Context, statuses []string) ([]models.Provider, error)
	AutocompleteApproved(ctx context.Context, query string) ([]models.AutocompleteSuggestion, error)
}

type providerRepo struct {
	db *sqlx.DB
}

// NewProviderRepository retorna um ProviderRepository com PostgreSQL.
func NewProviderRepository(db *sqlx.DB) ProviderRepository {
	return &providerRepo{db: db}
}

// providerSelectColumns é a lista canônica de colunas usada por todos os caminhos
// de leitura para manter sincronia com scanOne / scanRows.
const providerSelectColumns = `
		id, user_id, business_name, company_name, bio, location, services, status, background_check_status,
		avg_rating, review_count, logo_image_id,
		account_type, birth_date, document_type, document_file_name, document_image_id, social_link,
		legal_representative_name, tax_id,
		accepts_dogs, accepts_cats, accepts_neutered, accepts_intact, whatsapp, onboarding_completed_at,
		COALESCE(social_links, '{}') AS social_links,
		last_business_name_change, last_logo_change, last_service_change,
		created_at, updated_at`

func (r *providerRepo) Create(ctx context.Context, p *models.Provider) error {
	if p.AccountType == "" {
		p.AccountType = "pessoa_fisica"
	}
	query := `
		INSERT INTO providers
			(user_id, business_name, company_name, bio, location, services,
			 account_type, birth_date, document_type, document_file_name, document_image_id, social_link,
			 legal_representative_name, tax_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		RETURNING id, status, background_check_status, avg_rating, review_count, created_at, updated_at`
	return r.db.QueryRowContext(ctx, query,
		p.UserID, p.BusinessName, p.CompanyName, p.Bio, p.Location, pq.Array(p.Services),
		p.AccountType, p.BirthDate, p.DocumentType, p.DocumentFileName, p.DocumentImageID, p.SocialLink,
		p.LegalRepresentativeName, p.TaxID,
	).Scan(&p.ID, &p.Status, &p.BackgroundCheckStatus, &p.AvgRating, &p.ReviewCount, &p.CreatedAt, &p.UpdatedAt)
}

func (r *providerRepo) GetByID(ctx context.Context, id string) (*models.Provider, error) {
	p, err := r.scanOne(ctx,
		`SELECT `+providerSelectColumns+` FROM providers WHERE id = $1`, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("provider not found")
		}
		return nil, err
	}
	return p, nil
}

func (r *providerRepo) GetByUserID(ctx context.Context, userID string) (*models.Provider, error) {
	p, err := r.scanOne(ctx,
		`SELECT `+providerSelectColumns+` FROM providers WHERE user_id = $1`, userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("provider not found")
		}
		return nil, err
	}
	return p, nil
}

func (r *providerRepo) ListApproved(ctx context.Context, filters ProviderFilters) ([]models.Provider, error) {
	perPage, page := normalizePagination(filters.PerPage, filters.Page)
	offset := (page - 1) * perPage

	orderBy := "avg_rating DESC"
	if filters.SortBy == "reviews" {
		orderBy = "review_count DESC"
	}

	rows, err := r.db.QueryContext(ctx,
		`SELECT `+providerSelectColumns+`
		 FROM providers
		 WHERE status = 'approved'
		   AND ($1 = '' OR $1 = ANY(services))
		   AND ($2 = ''
		        OR business_name ILIKE '%' || $2 || '%'
		        OR bio              ILIKE '%' || $2 || '%'
		        OR location         ILIKE '%' || $2 || '%')
		   AND ($5::bool IS NULL OR accepts_dogs = $5)
		   AND ($6::bool IS NULL OR accepts_cats = $6)
		   AND ($7::bool IS NULL OR accepts_neutered = $7)
		   AND ($8::bool IS NULL OR accepts_intact = $8)
		 ORDER BY `+orderBy+`
		 LIMIT $3 OFFSET $4`,
		filters.Service, filters.Query, perPage, offset,
		filters.AcceptsDogs, filters.AcceptsCats, filters.AcceptsNeutered, filters.AcceptsIntact)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return r.scanRows(rows)
}

// ListAllApproved retorna todos os prestadores aprovados (sem paginação). Destinado
// ao endpoint admin de reindexação para reconstruir o índice Typesense do zero.
func (r *providerRepo) ListAllApproved(ctx context.Context) ([]models.Provider, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+providerSelectColumns+`
		 FROM providers WHERE status = 'approved' ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return r.scanRows(rows)
}

// CountApproved retorna o total de prestadores aprovados que correspondem aos
// filtros de query e serviço (campos de paginação são ignorados).
func (r *providerRepo) CountApproved(ctx context.Context, filters ProviderFilters) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM providers
		 WHERE status = 'approved'
		   AND ($1 = '' OR $1 = ANY(services))
		   AND ($2 = ''
		        OR business_name ILIKE '%' || $2 || '%'
		        OR bio              ILIKE '%' || $2 || '%'
		        OR location         ILIKE '%' || $2 || '%')
		   AND ($3::bool IS NULL OR accepts_dogs = $3)
		   AND ($4::bool IS NULL OR accepts_cats = $4)
		   AND ($5::bool IS NULL OR accepts_neutered = $5)
		   AND ($6::bool IS NULL OR accepts_intact = $6)`,
		filters.Service, filters.Query,
		filters.AcceptsDogs, filters.AcceptsCats, filters.AcceptsNeutered, filters.AcceptsIntact).Scan(&n)
	return n, err
}

// FacetServices returns service-value counts across approved providers
// matching only the query filter. The service filter itself is intentionally
// ignored so the client can render alternative facets to switch to.
func (r *providerRepo) FacetServices(ctx context.Context, filters ProviderFilters) (map[string]int, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT service, COUNT(*) AS n
		 FROM providers, UNNEST(services) AS service
		 WHERE status = 'approved'
		   AND ($1 = ''
		        OR business_name ILIKE '%' || $1 || '%'
		        OR bio              ILIKE '%' || $1 || '%'
		        OR location         ILIKE '%' || $1 || '%')
		 GROUP BY service`,
		filters.Query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]int)
	for rows.Next() {
		var value string
		var count int
		if err := rows.Scan(&value, &count); err != nil {
			return nil, err
		}
		out[value] = count
	}
	return out, rows.Err()
}

// AutocompleteApproved returns up to 5 lightweight suggestions for
// search-as-you-type, matching against business_name, bio, and location.
// Usado como fallback PostgreSQL quando Typesense está indisponível.
func (r *providerRepo) AutocompleteApproved(ctx context.Context, query string) ([]models.AutocompleteSuggestion, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, business_name, logo_image_id, services, location
		 FROM providers
		 WHERE status = 'approved'
		   AND (business_name ILIKE '%' || $1 || '%'
		        OR bio ILIKE '%' || $1 || '%'
		        OR location ILIKE '%' || $1 || '%')
		 ORDER BY business_name ILIKE $1 || '%' DESC,
		          business_name ASC
		 LIMIT 5`, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var suggestions []models.AutocompleteSuggestion
	for rows.Next() {
		var s models.AutocompleteSuggestion
		if err := rows.Scan(&s.ID, &s.BusinessName, &s.LogoImageID, pq.Array(&s.Services), &s.Location); err != nil {
			return nil, err
		}
		suggestions = append(suggestions, s)
	}
	if suggestions == nil {
		suggestions = []models.AutocompleteSuggestion{}
	}
	return suggestions, rows.Err()
}

func (r *providerRepo) ListPending(ctx context.Context) ([]models.Provider, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+adminSelectColumns+`
		 FROM providers p
		 LEFT JOIN users u ON u.id = p.user_id
		 WHERE p.status IN ('pending','under_review')
		 ORDER BY p.created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return r.scanAdminRows(rows)
}

// adminSearchClause constrói o fragmento WHERE para o campo de busca admin.
// Quando não vazio, faz correspondência ILIKE com business_name,
// qualquer elemento de services[], e LEFT JOIN em users.email para admins
// poderem buscar prestadores pelo email de registro.
const adminSearchClause = `
  AND ($1 = ''
    OR p.business_name ILIKE '%' || $1 || '%'
    OR EXISTS (SELECT 1 FROM UNNEST(p.services) svc WHERE svc ILIKE '%' || $1 || '%')
    OR p.id::text ILIKE '%' || $1 || '%'
    OR u.email ILIKE '%' || $1 || '%')`

// adminSelectColumns é providerSelectColumns com cada coluna qualificada por
// "p." mais email e telefone do usuário do LEFT JOIN para o modal de detalhes
// admin poder mostrar informações de contato.
const adminSelectColumns = `
		p.id, p.user_id, p.business_name, p.company_name, p.bio, p.location, p.services, p.status,
		p.background_check_status, p.avg_rating, p.review_count, p.logo_image_id,
		p.account_type, p.birth_date, p.document_type, p.document_file_name, p.document_image_id,
		p.social_link, p.legal_representative_name, p.tax_id,
		p.accepts_dogs, p.accepts_cats, p.accepts_neutered, p.accepts_intact, p.whatsapp, p.onboarding_completed_at,
		COALESCE(p.social_links, '{}') AS social_links,
		p.last_business_name_change, p.last_logo_change, p.last_service_change,
		p.created_at, p.updated_at,
		COALESCE(u.email, '') AS email, COALESCE(u.phone, '') AS phone`

// ListAll returns every provider (any status) ordered by created_at DESC,
// with optional status filtering, full-text search (name, email, services,
// ID), and pagination. Admin-only data; never exposed to public endpoints.
func (r *providerRepo) ListAll(ctx context.Context, status, search string, offset, limit int) ([]models.Provider, error) {
	if limit <= 0 || limit > 100 {
		limit = 15
	}
	query := `
		SELECT ` + adminSelectColumns + `
		 FROM providers p
		 LEFT JOIN users u ON u.id = p.user_id
		 WHERE ($2 = '' OR p.status = $2)` + adminSearchClause + `
		 ORDER BY p.created_at DESC
		 LIMIT $3 OFFSET $4`
	rows, err := r.db.QueryContext(ctx, query, search, status, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return r.scanAdminRows(rows)
}
func (r *providerRepo) CountAll(ctx context.Context, status, search string) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*)
		 FROM providers p
		 LEFT JOIN users u ON u.id = p.user_id
		 WHERE ($2 = '' OR p.status = $2)`+adminSearchClause,
		search, status).Scan(&n)
	return n, err
}

// UpdateStatus transiciona o status de um prestador. Somente chamável por um admin
// (o chamador DEVE ter verificado o papel de admin na camada de serviço).
func (r *providerRepo) UpdateStatus(ctx context.Context, id, status, adminID, reason string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	var previousStatus string
	err = tx.QueryRowContext(ctx, `SELECT status FROM providers WHERE id = $1 FOR UPDATE`, id).Scan(&previousStatus)
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("provider not found")
	}

	_, err = tx.ExecContext(ctx,
		`UPDATE providers SET status=$1, status_changed_at=NOW(), status_changed_by=$2, rejection_reason=$3, updated_at=NOW()
		 WHERE id=$4`,
		status, adminID, nullString(reason), id)
	if err != nil {
		_ = tx.Rollback()
		return err
	}

	_, err = tx.ExecContext(ctx,
		`INSERT INTO provider_verification_audit (provider_id, admin_id, action, previous_status, new_status, notes)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		id, adminID, status, previousStatus, status, nullString(reason))
	if err != nil {
		_ = tx.Rollback()
		return err
	}

	return tx.Commit()
}

func (r *providerRepo) Update(ctx context.Context, p *models.Provider) error {
	// NOTA: status e background_check_status são intencionalmente excluídos aqui.
	// Esses campos só podem ser alterados via UpdateStatus (ação admin).
	socialLinks := p.SocialLinks
	if len(socialLinks) == 0 {
		socialLinks = json.RawMessage("{}")
	}
	_, err := r.db.ExecContext(ctx,
		`UPDATE providers SET business_name=$1, bio=$2, location=$3, services=$4, logo_image_id=$5,
		 accepts_dogs=$6, accepts_cats=$7, accepts_neutered=$8, accepts_intact=$9, whatsapp=$10,
		 social_links=$11::jsonb,
		 last_business_name_change=$12, last_logo_change=$13, last_service_change=$14,
		 updated_at=NOW()
		 WHERE id=$15`,
		p.BusinessName, p.Bio, p.Location, pq.Array(p.Services), p.LogoImageID,
		p.AcceptsDogs, p.AcceptsCats, p.AcceptsNeutered, p.AcceptsIntact, p.Whatsapp,
		socialLinks,
		p.LastBusinessNameChange, p.LastLogoChange, p.LastServiceChange,
		p.ID)
	return err
}

func (r *providerRepo) UpdateRating(ctx context.Context, providerID string, avgRating float64, count int) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE providers SET avg_rating=$1, review_count=$2, updated_at=NOW() WHERE id=$3`,
		avgRating, count, providerID)
	return err
}

// ── helpers ──────────────────────────────────────────────────────────────────

func (r *providerRepo) scanOne(ctx context.Context, query string, args ...interface{}) (*models.Provider, error) {
	row := r.db.QueryRowContext(ctx, query, args...)
	p := &models.Provider{}
	err := row.Scan(
		&p.ID, &p.UserID, &p.BusinessName, &p.CompanyName, &p.Bio, &p.Location,
		pq.Array(&p.Services), &p.Status, &p.BackgroundCheckStatus,
		&p.AvgRating, &p.ReviewCount, &p.LogoImageID,
		&p.AccountType, &p.BirthDate, &p.DocumentType, &p.DocumentFileName, &p.DocumentImageID, &p.SocialLink,
		&p.LegalRepresentativeName, &p.TaxID,
		&p.AcceptsDogs, &p.AcceptsCats, &p.AcceptsNeutered, &p.AcceptsIntact, &p.Whatsapp, &p.OnboardingCompletedAt,
		&p.SocialLinks,
		&p.LastBusinessNameChange, &p.LastLogoChange, &p.LastServiceChange,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (r *providerRepo) scanRows(rows *sql.Rows) ([]models.Provider, error) {
	var providers []models.Provider
	for rows.Next() {
		p := models.Provider{}
		err := rows.Scan(
			&p.ID, &p.UserID, &p.BusinessName, &p.CompanyName, &p.Bio, &p.Location,
			pq.Array(&p.Services), &p.Status, &p.BackgroundCheckStatus,
			&p.AvgRating, &p.ReviewCount, &p.LogoImageID,
			&p.AccountType, &p.BirthDate, &p.DocumentType, &p.DocumentFileName, &p.DocumentImageID, &p.SocialLink,
			&p.LegalRepresentativeName, &p.TaxID,
			&p.AcceptsDogs, &p.AcceptsCats, &p.AcceptsNeutered, &p.AcceptsIntact, &p.Whatsapp, &p.OnboardingCompletedAt,
			&p.SocialLinks,
			&p.LastBusinessNameChange, &p.LastLogoChange, &p.LastServiceChange,
			&p.CreatedAt, &p.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		providers = append(providers, p)
	}
	return providers, rows.Err()
}

// scanAdminRows é usada por ListAll, que faz LEFT JOIN com users e seleciona
// u.email + u.phone além das colunas canônicas de provider.
func (r *providerRepo) scanAdminRows(rows *sql.Rows) ([]models.Provider, error) {
	var providers []models.Provider
	for rows.Next() {
		p := models.Provider{}
		err := rows.Scan(
			&p.ID, &p.UserID, &p.BusinessName, &p.CompanyName, &p.Bio, &p.Location,
			pq.Array(&p.Services), &p.Status, &p.BackgroundCheckStatus,
			&p.AvgRating, &p.ReviewCount, &p.LogoImageID,
			&p.AccountType, &p.BirthDate, &p.DocumentType, &p.DocumentFileName, &p.DocumentImageID, &p.SocialLink,
			&p.LegalRepresentativeName, &p.TaxID,
			&p.AcceptsDogs, &p.AcceptsCats, &p.AcceptsNeutered, &p.AcceptsIntact, &p.Whatsapp, &p.OnboardingCompletedAt,
			&p.SocialLinks,
			&p.LastBusinessNameChange, &p.LastLogoChange, &p.LastServiceChange,
			&p.CreatedAt, &p.UpdatedAt,
			&p.Email, &p.Phone,
		)
		if err != nil {
			return nil, err
		}
		providers = append(providers, p)
	}
	return providers, rows.Err()
}

func nullString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// GetAuditLog retorna a trilha de auditoria de verificação de um prestador, ordenada
// do mais recente primeiro, com o email do admin incluído via LEFT JOIN.
func (r *providerRepo) GetAuditLog(ctx context.Context, providerID string) ([]models.ProviderAuditEntry, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT a.id, a.provider_id, a.admin_id, COALESCE(u.email, '') AS admin_email,
		        a.action, a.previous_status, a.new_status, a.notes, a.created_at
		   FROM provider_verification_audit a
		   LEFT JOIN users u ON u.id = a.admin_id
		  WHERE a.provider_id = $1
		  ORDER BY a.created_at DESC`, providerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []models.ProviderAuditEntry
	for rows.Next() {
		var e models.ProviderAuditEntry
		if err := rows.Scan(&e.ID, &e.ProviderID, &e.AdminID, &e.AdminEmail,
			&e.Action, &e.PreviousStatus, &e.NewStatus, &e.Notes, &e.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	if entries == nil {
		entries = []models.ProviderAuditEntry{}
	}
	return entries, rows.Err()
}

// Delete remove um prestador e todas as linhas dependentes em uma única transação.
// Tabelas dependentes limpas: provider_verification_audit, bookings, reviews.
// Também remove o prestador do Typesense via o chamador (camada de serviço).
func (r *providerRepo) Delete(ctx context.Context, id string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	// Ordem FK: tabelas filhas primeiro.
	if _, err := tx.ExecContext(ctx, `DELETE FROM provider_verification_audit WHERE provider_id = $1`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM reviews WHERE provider_id = $1`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM providers WHERE id = $1`, id); err != nil {
		return err
	}
	return tx.Commit()
}

// AddGalleryImage inserts a gallery image for a provider, capping at 15.
func (r *providerRepo) AddGalleryImage(ctx context.Context, providerID, imageID string) error {
	// Usa parâmetros posicionais únicos — pgx não suporta reutilizar $1
	// across subqueries in a single statement.
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO provider_gallery_images (provider_id, image_id, sort_order)
		 SELECT $1, $2, COALESCE((SELECT MAX(sort_order) FROM provider_gallery_images WHERE provider_id = $3), -1) + 1
		 WHERE (SELECT COUNT(*) FROM provider_gallery_images WHERE provider_id = $4) < 15`,
		providerID, imageID, providerID, providerID)
	return err
}

// ListGalleryImages returns all gallery images for a provider ordered by sort_order.
func (r *providerRepo) ListGalleryImages(ctx context.Context, providerID string) ([]models.ProviderGalleryImage, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, provider_id, image_id, sort_order, created_at
		 FROM provider_gallery_images WHERE provider_id = $1 ORDER BY sort_order`, providerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var images []models.ProviderGalleryImage
	for rows.Next() {
		var img models.ProviderGalleryImage
		if err := rows.Scan(&img.ID, &img.ProviderID, &img.ImageID, &img.SortOrder, &img.CreatedAt); err != nil {
			return nil, err
		}
		images = append(images, img)
	}
	if images == nil {
		images = []models.ProviderGalleryImage{}
	}
	return images, rows.Err()
}

// CountGalleryImages returns the number of gallery images for a provider.
func (r *providerRepo) CountGalleryImages(ctx context.Context, providerID string) (int, error) {
	var count int
	err := r.db.GetContext(ctx, &count,
		`SELECT COUNT(*) FROM provider_gallery_images WHERE provider_id = $1`, providerID)
	return count, err
}

// RemoveGalleryImage deletes a specific gallery image by provider and image ID.
func (r *providerRepo) RemoveGalleryImage(ctx context.Context, providerID, imageID string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM provider_gallery_images WHERE provider_id = $1 AND image_id = $2`, providerID, imageID)
	return err
}

// SetOnboardingCompleted marca o onboarding do prestador como concluído.
func (r *providerRepo) SetOnboardingCompleted(ctx context.Context, providerID string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE providers SET onboarding_completed_at = NOW() WHERE id = $1`, providerID)
	return err
}

// ExportAllProviders retorna todos os prestadores (qualquer status) com email/telefone
// do usuário para exportação CSV. Passe slice statuses vazio para incluir todos.
func (r *providerRepo) ExportAllProviders(ctx context.Context, statuses []string) ([]models.Provider, error) {
	query := fmt.Sprintf(`
		SELECT %s
		FROM providers p
		LEFT JOIN users u ON u.id = p.user_id
		WHERE 1=1
	`, adminSelectColumns)

	var args []any
	if len(statuses) > 0 {
		placeholders := make([]string, len(statuses))
		for i, s := range statuses {
			placeholders[i] = fmt.Sprintf("$%d", i+1)
			args = append(args, s)
		}
		query += " AND p.status IN (" + strings.Join(placeholders, ",") + ")"
	}
	query += " ORDER BY p.created_at DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("ExportAllProviders: %w", err)
	}
	defer rows.Close()
	return r.scanAdminRows(rows)
}

// normalizePagination limita perPage em [1, 50] (padrão 20) e page >= 1.
// Retorna na ordem (perPage, page) para os chamadores computarem offset.
func normalizePagination(perPage, page int) (int, int) {
	if perPage <= 0 || perPage > 50 {
		perPage = 20
	}
	if page <= 0 {
		page = 1
	}
	return perPage, page
}
