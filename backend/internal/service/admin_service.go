package service

import (
	"context"

	"pata-cao/internal/repository/postgres"
)

// AdminStats é reexportado do pacote repository.
type AdminStats = postgres.AdminStats

// ProviderGrowthResponse é reexportado do pacote repository.
type ProviderGrowthResponse = postgres.ProviderGrowthResponse

// AdminService fornece lógica de negócio exclusiva para admin além do gerenciamento de prestadores.
type AdminService struct {
	stats postgres.StatsRepository
}

// NewAdminService cria um novo AdminService.
func NewAdminService(stats postgres.StatsRepository) *AdminService {
	return &AdminService{stats: stats}
}

// GetStats retorna estatísticas agregadas do dashboard.
func (s *AdminService) GetStats(ctx context.Context) (*AdminStats, error) {
	return s.stats.GetStats(ctx)
}

// GetProviderGrowth retorna dados de série temporal de crescimento de prestadores.
func (s *AdminService) GetProviderGrowth(ctx context.Context, rangeParam string) (*ProviderGrowthResponse, error) {
	return s.stats.GetProviderGrowth(ctx, rangeParam)
}
