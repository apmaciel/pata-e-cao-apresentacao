package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/typesense/typesense-go/v2/typesense"
	"github.com/typesense/typesense-go/v2/typesense/api"
	"github.com/typesense/typesense-go/v2/typesense/api/pointer"

	"pata-cao/internal/models"
)

// ProvidersCollection é o nome da coleção do Typesense para prestadores aprovados.
const ProvidersCollection = "providers"

// SearchParams contém as entradas para SearchService.SearchProviders e o ponto
// de entrada ListProviders da camada de serviço. Espelha o contrato público
// de query do GET /api/providers.
type SearchParams struct {
	Query          string
	Service        string
	SortBy         string // "rating" (padrão) ou "reviews"
	Page           int    // baseado em 1
	PerPage        int    // limitado a 50 pelos chamadores
	AcceptsDogs    *bool  // nil = sem filtro
	AcceptsCats    *bool  // nil = sem filtro
	AcceptsNeutered *bool // nil = sem filtro
	AcceptsIntact  *bool  // nil = sem filtro
}

// FacetValue é um único bucket de faceta retornado junto com resultados de busca.
type FacetValue struct {
	Value string `json:"value"`
	Count int    `json:"count"`
}

// SearchResult é o formato unificado retornado tanto pelo caminho Typesense
// quanto pelo PostgreSQL para que os handlers possam serializar diretamente para JSON.
type SearchResult struct {
	Providers []models.Provider       `json:"providers"`
	Total     int                     `json:"total"`
	Page      int                     `json:"page"`
	PerPage   int                     `json:"perPage"`
	Facets    map[string][]FacetValue `json:"facets"`
}

// SearchService gerencia o índice de prestadores do Typesense.
type SearchService interface {
	SearchProviders(ctx context.Context, params SearchParams) (*SearchResult, error)
	AutocompleteProviders(ctx context.Context, query string) ([]models.AutocompleteSuggestion, error)
	IndexProvider(ctx context.Context, p *models.Provider) error
	DeleteProvider(ctx context.Context, id string) error
	Reindex(ctx context.Context, providers []models.Provider) error
}

// TypesenseSearch é a implementação de SearchService com Typesense.
type TypesenseSearch struct {
	client *typesense.Client
}

// NewTypesenseSearch constrói um cliente Typesense e garante que a coleção
// de prestadores exista. O chamador deve pular a configuração deste serviço
// completamente quando TYPESENSE_URL não estiver definido (busca então degrada
// para o caminho Postgres).
func NewTypesenseSearch(ctx context.Context, serverURL, apiKey string) (*TypesenseSearch, error) {
	if serverURL == "" {
		return nil, fmt.Errorf("typesense URL is required")
	}
	client := typesense.NewClient(
		typesense.WithServer(serverURL),
		typesense.WithAPIKey(apiKey),
	)
	s := &TypesenseSearch{client: client}
	if err := s.ensureCollection(ctx); err != nil {
		return nil, fmt.Errorf("typesense bootstrap failed: %w", err)
	}
	return s, nil
}

// ensureCollection cria a coleção providers no primeiro boot, ou
// a atualiza se a coleção existir mas estiver faltando o campo status
// (migração do schema antes da filtragem por status ser adicionada).
func (s *TypesenseSearch) ensureCollection(ctx context.Context) error {
	cols, err := s.client.Collections().Retrieve(ctx)
	if err != nil {
		return err
	}
	for _, c := range cols {
		if c != nil && c.Name == ProvidersCollection {
			return s.migrateCollection(ctx, c)
		}
	}

	schema := &api.CollectionSchema{
		Name: ProvidersCollection,
		Fields: []api.Field{
			{Name: "id", Type: "string"},
			{Name: "business_name", Type: "string"},
			{Name: "bio", Type: "string", Optional: pointer.True()},
			{Name: "location", Type: "string", Optional: pointer.True()},
			{Name: "services", Type: "string[]", Facet: pointer.True()},
			{Name: "accepts_dogs", Type: "bool", Optional: pointer.True()},
			{Name: "accepts_cats", Type: "bool", Optional: pointer.True()},
			{Name: "accepts_neutered", Type: "bool", Optional: pointer.True()},
			{Name: "accepts_intact", Type: "bool", Optional: pointer.True()},
			{Name: "avg_rating", Type: "float"},
			{Name: "review_count", Type: "int32"},
			{Name: "logo_image_id", Type: "string", Optional: pointer.True(), Index: pointer.False()},
			{Name: "status", Type: "string", Facet: pointer.True()},
		},
		DefaultSortingField: pointer.String("avg_rating"),
	}
	_, err = s.client.Collections().Create(ctx, schema)
	return err
}

// migrateCollection adds missing fields (currently: status) to an existing
// collection without destroying data.
func (s *TypesenseSearch) migrateCollection(ctx context.Context, c *api.CollectionResponse) error {
	for _, f := range c.Fields {
		if f.Name == "status" {
			return nil // already migrated
		}
	}
	update := &api.CollectionUpdateSchema{
		Fields: []api.Field{
			{Name: "status", Type: "string", Facet: pointer.True()},
		},
	}
	_, err := s.client.Collection(ProvidersCollection).Update(ctx, update)
	return err
}

// providerToDoc projects a Provider into the Typesense document shape. Nil
// optional fields are written as empty strings so search behaves predictably
// (Typesense treats the field as absent when filtering).
func providerToDoc(p *models.Provider) map[string]interface{} {
	bio := ""
	if p.Bio != nil {
		bio = *p.Bio
	}
	location := ""
	if p.Location != nil {
		location = *p.Location
	}
	services := p.Services
	if services == nil {
		services = []string{}
	}
	doc := map[string]interface{}{
		"id":               p.ID,
		"business_name":    p.BusinessName,
		"bio":              bio,
		"location":         location,
		"services":         services,
		"accepts_dogs":     p.AcceptsDogs,
		"accepts_cats":     p.AcceptsCats,
		"accepts_neutered": p.AcceptsNeutered,
		"accepts_intact":   p.AcceptsIntact,
		"avg_rating":       p.AvgRating,
		"review_count":     p.ReviewCount,
		"status":           p.Status,
	}
	if p.LogoImageID != nil {
		doc["logo_image_id"] = *p.LogoImageID
	}
	return doc
}

func (s *TypesenseSearch) IndexProvider(ctx context.Context, p *models.Provider) error {
	if p == nil || p.ID == "" {
		return fmt.Errorf("invalid provider for indexing")
	}
	_, err := s.client.Collection(ProvidersCollection).Documents().Upsert(ctx, providerToDoc(p))
	return err
}

func (s *TypesenseSearch) DeleteProvider(ctx context.Context, id string) error {
	if id == "" {
		return fmt.Errorf("missing provider id")
	}
	_, err := s.client.Collection(ProvidersCollection).Document(id).Delete(ctx)
	return err
}

func (s *TypesenseSearch) Reindex(ctx context.Context, providers []models.Provider) error {
	// Wipe the collection first so that docs deleted from Postgres don't
	// linger in Typesense (upsert alone never removes stale entries).
	_, _ = s.client.Collection(ProvidersCollection).Documents().Delete(ctx, &api.DeleteDocumentsParams{
		FilterBy: pointer.String("id:*"),
	})

	if len(providers) == 0 {
		return nil
	}
	docs := make([]interface{}, 0, len(providers))
	for i := range providers {
		docs = append(docs, providerToDoc(&providers[i]))
	}
	params := &api.ImportDocumentsParams{Action: pointer.String("upsert")}
	_, err := s.client.Collection(ProvidersCollection).Documents().Import(ctx, docs, params)
	return err
}

func (s *TypesenseSearch) SearchProviders(ctx context.Context, params SearchParams) (*SearchResult, error) {
	page := params.Page
	if page <= 0 {
		page = 1
	}
	perPage := params.PerPage
	if perPage <= 0 || perPage > 50 {
		perPage = 20
	}

	q := params.Query
	if q == "" {
		q = "*"
	}

	sortBy := "avg_rating:desc"
	if params.SortBy == "reviews" {
		sortBy = "review_count:desc"
	}

	sp := &api.SearchCollectionParams{
		Q:       pointer.String(q),
		QueryBy: pointer.String("business_name,bio,location"),
		SortBy:  pointer.String(sortBy),
		FacetBy: pointer.String("services"),
		Page:    pointer.Int(page),
		PerPage: pointer.Int(perPage),
	}
	filter := "status:=[approved]"
	if params.Service != "" {
		filter += fmt.Sprintf(" && services:=%s", params.Service)
	}
	if params.AcceptsDogs != nil {
		filter += fmt.Sprintf(" && accepts_dogs:=%v", *params.AcceptsDogs)
	}
	if params.AcceptsCats != nil {
		filter += fmt.Sprintf(" && accepts_cats:=%v", *params.AcceptsCats)
	}
	if params.AcceptsNeutered != nil {
		filter += fmt.Sprintf(" && accepts_neutered:=%v", *params.AcceptsNeutered)
	}
	if params.AcceptsIntact != nil {
		filter += fmt.Sprintf(" && accepts_intact:=%v", *params.AcceptsIntact)
	}
	sp.FilterBy = pointer.String(filter)

	res, err := s.client.Collection(ProvidersCollection).Documents().Search(ctx, sp)
	if err != nil {
		return nil, err
	}

	out := &SearchResult{
		Providers: []models.Provider{},
		Page:      page,
		PerPage:   perPage,
		Facets:    map[string][]FacetValue{"services": {}},
	}
	if res.Found != nil {
		out.Total = *res.Found
	}
	if res.Hits != nil {
		for _, hit := range *res.Hits {
			if hit.Document == nil {
				continue
			}
			p, err := docToProvider(*hit.Document)
			if err != nil {
				log.Printf("typesense: skipping malformed hit: %v", err)
				continue
			}
			out.Providers = append(out.Providers, p)
		}
	}
	if res.FacetCounts != nil {
		for _, fc := range *res.FacetCounts {
			if fc.FieldName == nil || fc.Counts == nil {
				continue
			}
			bucket := make([]FacetValue, 0, len(*fc.Counts))
			for _, c := range *fc.Counts {
				if c.Value == nil {
					continue
				}
				count := 0
				if c.Count != nil {
					count = *c.Count
				}
				bucket = append(bucket, FacetValue{Value: *c.Value, Count: count})
			}
			out.Facets[*fc.FieldName] = bucket
		}
	}
	return out, nil
}

// AutocompleteProviders returns lightweight suggestions for search-as-you-type.
// Usa Typesense com per_page pequeno para manter respostas rápidas.
func (s *TypesenseSearch) AutocompleteProviders(ctx context.Context, query string) ([]models.AutocompleteSuggestion, error) {
	if query == "" {
		return []models.AutocompleteSuggestion{}, nil
	}

	sp := &api.SearchCollectionParams{
		Q:       pointer.String(query),
		QueryBy: pointer.String("business_name,bio,location"),
		FilterBy: pointer.String("status:=[approved]"),
		SortBy:  pointer.String("_text_match:desc"),
		PerPage: pointer.Int(5),
	}

	res, err := s.client.Collection(ProvidersCollection).Documents().Search(ctx, sp)
	if err != nil {
		return nil, err
	}

	suggestions := make([]models.AutocompleteSuggestion, 0, 5)
	if res.Hits != nil {
		for _, hit := range *res.Hits {
			if hit.Document == nil {
				continue
			}
			s := docToSuggestion(*hit.Document)
			suggestions = append(suggestions, s)
		}
	}
	return suggestions, nil
}

// docToSuggestion extracts a lightweight AutocompleteSuggestion from a Typesense doc.
func docToSuggestion(doc map[string]interface{}) models.AutocompleteSuggestion {
	s := models.AutocompleteSuggestion{}
	if v, ok := doc["id"].(string); ok {
		s.ID = v
	}
	if v, ok := doc["business_name"].(string); ok {
		s.BusinessName = v
	}
	if v, ok := doc["logo_image_id"].(string); ok && v != "" {
		s.LogoImageID = &v
	}
	if v, ok := doc["location"].(string); ok && v != "" {
		s.Location = &v
	}
	if services, ok := doc["services"].([]interface{}); ok {
		s.Services = make([]string, 0, len(services))
		for _, svc := range services {
			if str, ok := svc.(string); ok {
				s.Services = append(s.Services, str)
			}
		}
	}
	return s
}

// docToProvider reconstrói um Provider a partir da representação doc do Typesense.
// Apenas os campos armazenados no índice são preenchidos; userId/timestamps
// permanecem zerados, o que é aceitável para respostas de listagem.
func docToProvider(doc map[string]interface{}) (models.Provider, error) {
	b, err := json.Marshal(doc)
	if err != nil {
		return models.Provider{}, err
	}
	var raw struct {
		ID              string   `json:"id"`
		BusinessName    string   `json:"business_name"`
		Bio             string   `json:"bio"`
		Location        string   `json:"location"`
		Services        []string `json:"services"`
		AcceptsDogs     bool     `json:"accepts_dogs"`
		AcceptsCats     bool     `json:"accepts_cats"`
		AcceptsNeutered bool     `json:"accepts_neutered"`
		AcceptsIntact   bool     `json:"accepts_intact"`
		AvgRating       float64  `json:"avg_rating"`
		ReviewCount     int      `json:"review_count"`
		LogoImageID     string   `json:"logo_image_id"`
		Status          string   `json:"status"`
	}
	if err := json.Unmarshal(b, &raw); err != nil {
		return models.Provider{}, err
	}
	status := raw.Status
	if status == "" {
		status = "approved"
	}
	p := models.Provider{
		ID:              raw.ID,
		BusinessName:    raw.BusinessName,
		Services:        raw.Services,
		AcceptsDogs:     raw.AcceptsDogs,
		AcceptsCats:     raw.AcceptsCats,
		AcceptsNeutered: raw.AcceptsNeutered,
		AcceptsIntact:   raw.AcceptsIntact,
		AvgRating:       raw.AvgRating,
		ReviewCount:     raw.ReviewCount,
		Status:          status,
	}
	if raw.Bio != "" {
		bio := raw.Bio
		p.Bio = &bio
	}
	if raw.Location != "" {
		loc := raw.Location
		p.Location = &loc
	}
	if raw.LogoImageID != "" {
		l := raw.LogoImageID
		p.LogoImageID = &l
	}
	return p, nil
}
