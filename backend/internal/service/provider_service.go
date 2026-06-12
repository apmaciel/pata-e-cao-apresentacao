package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"golang.org/x/crypto/bcrypt"

	"pata-cao/internal/models"
	"pata-cao/internal/repository/postgres"
)

// ProviderService trata lógica de negócio de prestadores.
type ProviderService struct {
	providers        postgres.ProviderRepository
	search           SearchService // nil desabilita busca (apenas fallback Postgres)
	onboardingTokens postgres.OnboardingTokenRepository
	users            postgres.UserRepository
}

// NewProviderService cria um novo ProviderService. Passe nil para search para
// rodar sem Typesense — as listagens usarão o caminho de fallback SQL.
func NewProviderService(providers postgres.ProviderRepository, search SearchService, onboardingTokens postgres.OnboardingTokenRepository, users postgres.UserRepository) *ProviderService {
	return &ProviderService{providers: providers, search: search, onboardingTokens: onboardingTokens, users: users}
}

// Apply cria um perfil de prestador pendente para o usuário autenticado.
// Um usuário pode ter apenas um perfil de prestador.
func (s *ProviderService) Apply(ctx context.Context, userID string, p *models.Provider) error {
	// Verifica perfil existente.
	existing, err := s.providers.GetByUserID(ctx, userID)
	if err == nil && existing != nil {
		return fmt.Errorf("ALREADY_EXISTS: you already have a provider profile")
	}

	p.UserID = userID
	p.Status = "pending"
	return s.providers.Create(ctx, p)
}

// GetProvider retorna um prestador por ID.
// Chamadores não-admin e não-self só veem prestadores aprovados.
func (s *ProviderService) GetProvider(ctx context.Context, id, callerID, callerRole string) (*models.Provider, error) {
	provider, err := s.providers.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("PROVIDER_NOT_FOUND: provider does not exist")
	}

	// Admins e o próprio prestador podem ver qualquer status.
	if callerRole == "admin" || provider.UserID == callerID {
		return s.enrichWithUser(ctx, s.attachGallery(ctx, provider)), nil
	}

	if provider.Status != "approved" {
		return nil, fmt.Errorf("PROVIDER_NOT_FOUND: provider does not exist")
	}
	return s.enrichWithUser(ctx, s.attachGallery(ctx, provider)), nil
}

// enrichWithUser busca o email e telefone do usuário e os anexa ao prestador.
func (s *ProviderService) enrichWithUser(ctx context.Context, p *models.Provider) *models.Provider {
	u, err := s.users.GetByID(ctx, p.UserID)
	if err != nil {
		log.Printf("provider: failed to fetch user %s for provider %s: %v", p.UserID, p.ID, err)
		return p
	}
	p.Email = u.Email
	p.Phone = u.Phone
	return p
}

// attachGallery carrega e anexa imagens da galeria a um prestador.
func (s *ProviderService) attachGallery(ctx context.Context, p *models.Provider) *models.Provider {
	images, err := s.providers.ListGalleryImages(ctx, p.ID)
	if err != nil {
		log.Printf("provider: failed to list gallery images for %s: %v", p.ID, err)
		p.GalleryImages = []models.ProviderGalleryImage{}
		return p
	}
	if images == nil {
		p.GalleryImages = []models.ProviderGalleryImage{}
	} else {
		p.GalleryImages = images
	}
	return p
}

// ListProviders retorna o conjunto paginado e facetado de prestadores aprovados
// que correspondem aos parâmetros. Delega ao Typesense quando configurado e
// faz fallback para PostgreSQL quando o serviço de busca é nil ou retorna erro.
func (s *ProviderService) ListProviders(ctx context.Context, params SearchParams) (*SearchResult, error) {
	if s.search != nil {
		res, err := s.search.SearchProviders(ctx, params)
		if err == nil {
			return res, nil
		}
		log.Printf("search: typesense unavailable, falling back to postgres: %v", err)
	}
	return s.listFromPostgres(ctx, params)
}

// AutocompleteProviders retorna sugestões leves para busca enquanto digita.
// Delega ao Typesense quando configurado; fallback para query ILIKE no PostgreSQL.
func (s *ProviderService) AutocompleteProviders(ctx context.Context, query string) ([]models.AutocompleteSuggestion, error) {
	if query == "" {
		return []models.AutocompleteSuggestion{}, nil
	}
	if s.search != nil {
		suggestions, err := s.search.AutocompleteProviders(ctx, query)
		if err == nil {
			return suggestions, nil
		}
		log.Printf("search: typesense autocomplete unavailable, falling back to postgres: %v", err)
	}
	return s.providers.AutocompleteApproved(ctx, query)
}

func (s *ProviderService) listFromPostgres(ctx context.Context, params SearchParams) (*SearchResult, error) {
	page := params.Page
	if page <= 0 {
		page = 1
	}
	perPage := params.PerPage
	if perPage <= 0 || perPage > 50 {
		perPage = 20
	}

	filters := postgres.ProviderFilters{
		Query:          params.Query,
		Service:        params.Service,
		SortBy:         params.SortBy,
		Page:           page,
		PerPage:        perPage,
		AcceptsDogs:    params.AcceptsDogs,
		AcceptsCats:    params.AcceptsCats,
		AcceptsNeutered: params.AcceptsNeutered,
		AcceptsIntact:  params.AcceptsIntact,
	}
	providers, err := s.providers.ListApproved(ctx, filters)
	if err != nil {
		return nil, err
	}
	if providers == nil {
		providers = []models.Provider{}
	}
	total, err := s.providers.CountApproved(ctx, filters)
	if err != nil {
		return nil, err
	}
	facetMap, err := s.providers.FacetServices(ctx, filters)
	if err != nil {
		return nil, err
	}
	facetValues := make([]FacetValue, 0, len(facetMap))
	for v, c := range facetMap {
		facetValues = append(facetValues, FacetValue{Value: v, Count: c})
	}

	// Enrich with user email/phone for contact popover.
	for i := range providers {
		providers[i] = *s.enrichWithUser(ctx, &providers[i])
	}

	return &SearchResult{
		Providers: providers,
		Total:     total,
		Page:      page,
		PerPage:   perPage,
		Facets:    map[string][]FacetValue{"services": facetValues},
	}, nil
}

// ApproveProvider transiciona um prestador para status aprovado e gera um
// token de onboarding de uso único. O token é retornado ao chamador (admin)
// para compartilhar o link de configuração com o prestador.
// CRÍTICO: Apenas admins podem chamar este método. O chamador deve impor isso.
func (s *ProviderService) ApproveProvider(ctx context.Context, id, adminID, reason string) (string, error) {
	if reason == "" {
		return "", fmt.Errorf("VALIDATION_ERROR: approval reason is required")
	}

	provider, err := s.providers.GetByID(ctx, id)
	if err != nil {
		return "", fmt.Errorf("PROVIDER_NOT_FOUND: provider does not exist")
	}

	// Apenas pendentes ou em_revisão → aprovado.
	if provider.Status != "pending" && provider.Status != "under_review" {
		return "", fmt.Errorf("INVALID_TRANSITION: provider status is %q, cannot approve", provider.Status)
	}

	if err := s.providers.UpdateStatus(ctx, id, "approved", adminID, reason); err != nil {
		return "", err
	}

	// Gera token de onboarding de uso único (válido por 7 dias).
	rawToken, err := GenerateSecureToken()
	if err != nil {
		return "", fmt.Errorf("INTERNAL_ERROR: failed to generate onboarding token")
	}
	expiresAt := time.Now().Add(7 * 24 * time.Hour)
	if err := s.onboardingTokens.Save(ctx, id, rawToken, expiresAt); err != nil {
		return "", fmt.Errorf("INTERNAL_ERROR: failed to save onboarding token")
	}

	s.syncProvider(ctx, id)
	return rawToken, nil
}

// RejectProvider transiciona um prestador para status rejeitado com um motivo.
// CRÍTICO: Apenas admins podem chamar este método. O chamador deve impor isso.
func (s *ProviderService) RejectProvider(ctx context.Context, id, adminID, reason string) error {
	if reason == "" {
		return fmt.Errorf("VALIDATION_ERROR: rejection reason is required")
	}

	provider, err := s.providers.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("PROVIDER_NOT_FOUND: provider does not exist")
	}

	if provider.Status == "approved" {
		// Prestadores aprovados não podem ser rejeitados diretamente sem reavaliação.
		return fmt.Errorf("INVALID_TRANSITION: cannot reject an approved provider")
	}

	return s.providers.UpdateStatus(ctx, id, "rejected", adminID, reason)
}

// DeleteOwnProvider permite que um prestador aprovado exclua permanentemente sua
// própria conta. O chamador deve fornecer sua senha para confirmação — a senha
// é verificada contra o hash armazenado antes de prosseguir.
//
// Excluir o usuário cascateia por todos os relacionamentos FK:
//   users → providers (ON DELETE CASCADE)
//   providers → reviews, gallery images, onboarding tokens, audit records
//   users → refresh_tokens (ON DELETE CASCADE)
//
// O prestador também é removido do índice Typesense se presente.
func (s *ProviderService) DeleteOwnProvider(ctx context.Context, userID, password string) error {
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return fmt.Errorf("NOT_FOUND: user not found")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return fmt.Errorf("INVALID_CREDENTIALS: password is incorrect")
	}

	provider, err := s.providers.GetByUserID(ctx, userID)
	if err != nil {
		return fmt.Errorf("PROVIDER_NOT_FOUND: no provider profile for this user")
	}

	// Apenas prestadores aprovados (ou suspensos) podem se autoexcluir.
	// Pendentes/rejeitados devem seguir o fluxo admin.
	if provider.Status != "approved" && provider.Status != "suspended" {
		return fmt.Errorf("INVALID_STATUS: only approved providers can delete their account (current: %s)", provider.Status)
	}

	// Remove do índice de busca primeiro para desaparecer imediatamente.
	s.deleteFromSearch(ctx, provider.ID)

	// Exclui o usuário — o cascade FK (users → providers → reviews, gallery,
	// tokens, audit) remove todos os dados desta conta.
	if err := s.users.Delete(ctx, userID); err != nil {
		return fmt.Errorf("INTERNAL_ERROR: failed to delete account")
	}

	return nil
}

// DeleteProvider remove permanentemente um prestador rejeitado e todos os seus
// dados dependentes (auditoria, reservas, reviews). Apenas prestadores rejeitados
// podem ser excluídos — isso evita remoção acidental de perfis ativos.
// Também remove o prestador do índice Typesense se presente.
func (s *ProviderService) DeleteProvider(ctx context.Context, id string) error {
	provider, err := s.providers.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("PROVIDER_NOT_FOUND: provider does not exist")
	}
	if provider.Status != "rejected" {
		return fmt.Errorf("INVALID_TRANSITION: only rejected providers can be deleted (current: %s)", provider.Status)
	}
	if err := s.providers.Delete(ctx, id); err != nil {
		return err
	}
	s.deleteFromSearch(ctx, id)
	return nil
}

// GetMyProvider retorna o perfil de prestador do usuário autenticado.
func (s *ProviderService) GetMyProvider(ctx context.Context, userID string) (*models.Provider, error) {
	provider, err := s.providers.GetByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("PROVIDER_NOT_FOUND: no provider profile for this user")
	}
	return s.enrichWithUser(ctx, s.attachGallery(ctx, provider)), nil
}

// GetPendingProviders retorna todos os prestadores aguardando revisão. Apenas admin.
func (s *ProviderService) GetPendingProviders(ctx context.Context) ([]models.Provider, error) {
	return s.providers.ListPending(ctx)
}

// ListAllProviders returns a paginated view of every provider, optionally
// filtered by status and full-text search (name, email, services, ID).
// Admin-only; caller must enforce that.
func (s *ProviderService) ListAllProviders(ctx context.Context, status, search string, page, perPage int) (*SearchResult, error) {
	if page <= 0 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 15
	}
	offset := (page - 1) * perPage
	providers, err := s.providers.ListAll(ctx, status, search, offset, perPage)
	if err != nil {
		return nil, err
	}
	if providers == nil {
		providers = []models.Provider{}
	}
	total, err := s.providers.CountAll(ctx, status, search)
	if err != nil {
		return nil, err
	}
	return &SearchResult{
		Providers: providers,
		Total:     total,
		Page:      page,
		PerPage:   perPage,
	}, nil
}

// SuspendProvider desativa um prestador aprovado: esconde da busca,
// bloqueia novas reservas e registra a ação na auditoria de verificação.
// A suspensão é reversível (veja UnsuspendProvider).
func (s *ProviderService) SuspendProvider(ctx context.Context, id, adminID, reason string) error {
	if reason == "" {
		return fmt.Errorf("VALIDATION_ERROR: suspension reason is required")
	}
	provider, err := s.providers.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("PROVIDER_NOT_FOUND: provider does not exist")
	}
	if provider.Status == "suspended" {
		return fmt.Errorf("INVALID_TRANSITION: provider is already suspended")
	}
	if provider.Status != "approved" {
		return fmt.Errorf("INVALID_TRANSITION: only approved providers can be suspended (current: %s)", provider.Status)
	}
	if err := s.providers.UpdateStatus(ctx, id, "suspended", adminID, reason); err != nil {
		return err
	}
	// Remove do índice de busca imediatamente — prestadores suspensos
	// não devem aparecer em listagens públicas.
	s.deleteFromSearch(ctx, id)
	return nil
}

// UnsuspendProvider restaura um prestador suspenso de volta ao status aprovado.
func (s *ProviderService) UnsuspendProvider(ctx context.Context, id, adminID, reason string) error {
	if reason == "" {
		return fmt.Errorf("VALIDATION_ERROR: reinstatement reason is required")
	}
	provider, err := s.providers.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("PROVIDER_NOT_FOUND: provider does not exist")
	}
	if provider.Status != "suspended" {
		return fmt.Errorf("INVALID_TRANSITION: provider is not suspended (current: %s)", provider.Status)
	}
	if err := s.providers.UpdateStatus(ctx, id, "approved", adminID, reason); err != nil {
		return err
	}
	s.syncProvider(ctx, id)
	return nil
}

// canChangeThisMonth retorna true se o timestamp for nil ou cair em um mês
// diferente do mês atual.
func canChangeThisMonth(lastChange *time.Time) bool {
	if lastChange == nil {
		return true
	}
	now := time.Now()
	return lastChange.Year() != now.Year() || lastChange.Month() != now.Month()
}

// UpdateProfile permite que um prestador atualize os detalhes do próprio perfil.
// Nome do negócio e logo só podem ser alterados uma vez por mês.
// Preferências de serviço (accepts_*) só podem ser alteradas uma vez por mês.
// Bio, localização, whatsapp e links sociais são livremente editáveis.
func (s *ProviderService) UpdateProfile(ctx context.Context, callerID string, p *models.Provider) error {
	existing, err := s.providers.GetByUserID(ctx, callerID)
	if err != nil {
		return fmt.Errorf("PROVIDER_NOT_FOUND: no provider profile for this user")
	}

	// Só permite edições de perfil após o formulário de onboarding ter sido concluído.
	if existing.OnboardingCompletedAt == nil {
		return fmt.Errorf("ONBOARDING_REQUIRED: profile editing is only available after completing the onboarding form")
	}

	p.ID = existing.ID
	p.UserID = existing.UserID
	p.Status = existing.Status
	p.BackgroundCheckStatus = existing.BackgroundCheckStatus

	now := time.Now()

	// Rate-limit business name: once per calendar month.
	if p.BusinessName != existing.BusinessName {
		if !canChangeThisMonth(existing.LastBusinessNameChange) {
			return fmt.Errorf("RATE_LIMITED: business name can only be changed once per calendar month")
		}
		p.LastBusinessNameChange = &now
	} else {
		p.LastBusinessNameChange = existing.LastBusinessNameChange
	}

	// Rate-limit logo image: once per calendar month.
	logoChanged := !ptrEqual(p.LogoImageID, existing.LogoImageID)
	if logoChanged {
		if !canChangeThisMonth(existing.LastLogoChange) {
			return fmt.Errorf("RATE_LIMITED: profile picture can only be changed once per calendar month")
		}
		p.LastLogoChange = &now
	} else {
		p.LastLogoChange = existing.LastLogoChange
	}

	// Rate-limit service flags: once per calendar month.
	servicesChanged := p.AcceptsDogs != existing.AcceptsDogs ||
		p.AcceptsCats != existing.AcceptsCats ||
		p.AcceptsNeutered != existing.AcceptsNeutered ||
		p.AcceptsIntact != existing.AcceptsIntact
	if servicesChanged {
		if !canChangeThisMonth(existing.LastServiceChange) {
			return fmt.Errorf("RATE_LIMITED: service offerings can only be changed once per calendar month")
		}
		p.LastServiceChange = &now
	} else {
		p.LastServiceChange = existing.LastServiceChange
	}

	// Preserve onboarding fields that aren't editable here.
	p.OnboardingCompletedAt = existing.OnboardingCompletedAt
	p.Services = existing.Services

	if err := s.providers.Update(ctx, p); err != nil {
		return err
	}
	s.syncProvider(ctx, existing.ID)
	return nil
}

// ptrEqual returns true if both string pointers are nil or point to the same value.
func ptrEqual(a, b *string) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

// ReindexAll reconstrói todo o índice Typesense de prestadores a partir do PostgreSQL.
// Retorna o número de prestadores aprovados indexados. Apenas admin; o chamador
// deve impor essa restrição.
func (s *ProviderService) ReindexAll(ctx context.Context) (int, error) {
	if s.search == nil {
		return 0, fmt.Errorf("SEARCH_DISABLED: search service is not configured")
	}
	providers, err := s.providers.ListAllApproved(ctx)
	if err != nil {
		return 0, err
	}
	if err := s.search.Reindex(ctx, providers); err != nil {
		return 0, err
	}
	return len(providers), nil
}

// GetAuditLog retorna a trilha de auditoria de verificação de um prestador.
// Apenas admin; o chamador deve impor essa restrição.
func (s *ProviderService) GetAuditLog(ctx context.Context, providerID string) ([]models.ProviderAuditEntry, error) {
	return s.providers.GetAuditLog(ctx, providerID)
}

// SyncProvider reindexa um único prestador por ID. Público para o ReviewService
// manter avg_rating/review_count em sincronia após recálculo de nota.
// Melhor esforço: falhas são logadas mas nunca propagadas.
func (s *ProviderService) SyncProvider(ctx context.Context, id string) {
	s.syncProvider(ctx, id)
}

// ── onboarding ────────────────────────────────────────────────────────────────

// OnboardingValidation é a resposta de ValidateOnboardingToken.
type OnboardingValidation struct {
	Provider         *models.Provider `json:"provider"`
	NeedsCredentials bool             `json:"needsCredentials"`
}

// OnboardingData é o payload completo do formulário de onboarding de 5 seções.
type OnboardingData struct {
	// Section 2 — Visual Profile
	AvatarImageID   *string  `json:"avatarImageId"`
	BusinessName    string   `json:"businessName"`
	GalleryImageIDs []string `json:"galleryImageIds"`

	// Section 3 — Service Preferences
	AcceptsDogs     bool `json:"acceptsDogs"`
	AcceptsCats     bool `json:"acceptsCats"`
	AcceptsNeutered bool `json:"acceptsNeutered"`
	AcceptsIntact   bool `json:"acceptsIntact"`

	// Section 4 — About Business
	Description string `json:"description"`
	Location    string `json:"location"`

	// Section 5 — Contact
	Whatsapp string `json:"whatsapp"`
	Email    string `json:"email"`
}

// ValidateOnboardingToken verifica o token e retorna o prestador com uma
// flag indicando se o usuário ainda precisa criar credenciais.
func (s *ProviderService) ValidateOnboardingToken(ctx context.Context, rawToken string) (*OnboardingValidation, error) {
	stored, err := s.onboardingTokens.GetByHash(ctx, rawToken)
	if err != nil {
		return nil, fmt.Errorf("INVALID_TOKEN: onboarding link is invalid")
	}
	if stored.ConsumedAt != nil {
		return nil, fmt.Errorf("INVALID_TOKEN: onboarding link has already been used")
	}
	if time.Now().After(stored.ExpiresAt) {
		return nil, fmt.Errorf("TOKEN_EXPIRED: onboarding link has expired")
	}

	provider, err := s.providers.GetByID(ctx, stored.ProviderID)
	if err != nil {
		return nil, fmt.Errorf("PROVIDER_NOT_FOUND: provider not found")
	}

	// needsCredentials é true quando o prestador não tem conta de usuário vinculada
	// (Caso B: prestador criado por admin). Para MVP, sempre false porque
	// prestadores se auto-registram primeiro. Preparado para uso futuro.
	needsCredentials := provider.UserID == ""

	return &OnboardingValidation{
		Provider:         provider,
		NeedsCredentials: needsCredentials,
	}, nil
}

// CompleteOnboarding consome o token, atualiza o perfil do prestador, insere
// imagens da galeria e marca o onboarding como concluído. Tudo em um único passo —
// o chamador (handler) é responsável por qualquer criação de credenciais antes.
func (s *ProviderService) CompleteOnboarding(ctx context.Context, rawToken string, data OnboardingData) error {
	stored, err := s.onboardingTokens.GetByHash(ctx, rawToken)
	if err != nil {
		return fmt.Errorf("INVALID_TOKEN: onboarding link is invalid")
	}
	if stored.ConsumedAt != nil {
		return fmt.Errorf("INVALID_TOKEN: onboarding link has already been used")
	}
	if time.Now().After(stored.ExpiresAt) {
		return fmt.Errorf("TOKEN_EXPIRED: onboarding link has expired")
	}

	provider, err := s.providers.GetByID(ctx, stored.ProviderID)
	if err != nil {
		return fmt.Errorf("PROVIDER_NOT_FOUND: provider not found")
	}

	// Atualiza campos do perfil.
	bio := data.Description
	location := data.Location
	whatsapp := data.Whatsapp
	provider.BusinessName = data.BusinessName
	provider.Bio = &bio
	provider.Location = &location
	provider.LogoImageID = data.AvatarImageID
	provider.Whatsapp = &whatsapp
	provider.AcceptsDogs = data.AcceptsDogs
	provider.AcceptsCats = data.AcceptsCats
	provider.AcceptsNeutered = data.AcceptsNeutered
	provider.AcceptsIntact = data.AcceptsIntact

	if err := s.providers.Update(ctx, provider); err != nil {
		log.Printf("onboarding: update provider %s failed: %v", provider.ID, err)
		return fmt.Errorf("INTERNAL_ERROR: failed to update provider profile")
	}

	// Insere imagens da galeria.
	for _, imageID := range data.GalleryImageIDs {
		if err := s.providers.AddGalleryImage(ctx, provider.ID, imageID); err != nil {
			log.Printf("onboarding: failed to add gallery image %s for provider %s: %v", imageID, provider.ID, err)
			return fmt.Errorf("INTERNAL_ERROR: failed to save gallery image")
		}
	}

	// Consome token (uso único).
	if err := s.onboardingTokens.Consume(ctx, rawToken); err != nil {
		log.Printf("onboarding: consume token for provider %s failed: %v", provider.ID, err)
		return fmt.Errorf("INTERNAL_ERROR: failed to consume onboarding token")
	}

	// Marca onboarding como concluído.
	if err := s.providers.SetOnboardingCompleted(ctx, provider.ID); err != nil {
		log.Printf("onboarding: set complete for provider %s failed: %v", provider.ID, err)
		return fmt.Errorf("INTERNAL_ERROR: failed to mark onboarding complete")
	}

	s.syncProvider(ctx, provider.ID)
	return nil
}

// RegenerateOnboardingToken cria um novo token de onboarding para um prestador
// aprovado, invalidando tokens não consumidos existentes. Apenas admin.
func (s *ProviderService) RegenerateOnboardingToken(ctx context.Context, providerID string) (string, error) {
	provider, err := s.providers.GetByID(ctx, providerID)
	if err != nil {
		return "", fmt.Errorf("PROVIDER_NOT_FOUND: provider does not exist")
	}
	if provider.Status != "approved" {
		return "", fmt.Errorf("INVALID_TRANSITION: only approved providers can receive onboarding tokens (current: %s)", provider.Status)
	}

	rawToken, err := GenerateSecureToken()
	if err != nil {
		return "", fmt.Errorf("INTERNAL_ERROR: failed to generate token")
	}
	expiresAt := time.Now().Add(7 * 24 * time.Hour)
	if err := s.onboardingTokens.Save(ctx, providerID, rawToken, expiresAt); err != nil {
		return "", fmt.Errorf("INTERNAL_ERROR: failed to save token")
	}
	return rawToken, nil
}

// ── helpers de busca ────────────────────────────────────────────────────────

// deleteFromSearch remove um documento de prestador do índice Typesense.
// Melhor esforço: loga falhas mas nunca propaga.
func (s *ProviderService) deleteFromSearch(ctx context.Context, id string) {
	if s.search == nil {
		return
	}
	if err := s.search.DeleteProvider(ctx, id); err != nil {
		log.Printf("search sync: failed to delete provider %s from index: %v", id, err)
	}
}

func (s *ProviderService) syncProvider(ctx context.Context, id string) {
	if s.search == nil {
		return
	}
	p, err := s.providers.GetByID(ctx, id)
	if err != nil {
		log.Printf("search sync: failed to fetch provider %s: %v", id, err)
		return
	}
	if p.Status != "approved" {
		return
	}
	if err := s.search.IndexProvider(ctx, p); err != nil {
		log.Printf("search sync: failed to index provider %s: %v", id, err)
	}
}

// ExportProviders returns all providers for CSV export, optionally filtered by status.
func (s *ProviderService) ExportProviders(ctx context.Context, statuses []string) ([]models.Provider, error) {
	return s.providers.ExportAllProviders(ctx, statuses)
}

// ── gallery management ────────────────────────────────────────────────────────

// AddGalleryImage adds an image to a provider's gallery, capping at 15.
func (s *ProviderService) AddGalleryImage(ctx context.Context, providerID, imageID string) error {
	count, err := s.providers.CountGalleryImages(ctx, providerID)
	if err != nil {
		return fmt.Errorf("INTERNAL_ERROR: failed to count gallery images")
	}
	if count >= 15 {
		return fmt.Errorf("GALLERY_FULL: maximum of 15 gallery images reached")
	}
	return s.providers.AddGalleryImage(ctx, providerID, imageID)
}

// RemoveGalleryImage removes an image from a provider's gallery.
func (s *ProviderService) RemoveGalleryImage(ctx context.Context, providerID, imageID string) error {
	return s.providers.RemoveGalleryImage(ctx, providerID, imageID)
}

// GetGalleryImages retorna todas as imagens da galeria de um prestador.
func (s *ProviderService) GetGalleryImages(ctx context.Context, providerID string) ([]models.ProviderGalleryImage, error) {
	return s.providers.ListGalleryImages(ctx, providerID)
}
