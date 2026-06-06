package service

import (
	"context"

	"pata-cao/internal/repository/postgres"
)

// AdminStats is re-exported from the repository package.
type AdminStats = postgres.AdminStats

// ProviderGrowthResponse is re-exported from the repository package.
type ProviderGrowthResponse = postgres.ProviderGrowthResponse

// AdminService provides admin-only business logic beyond provider management.
type AdminService struct {
	stats postgres.StatsRepository
}

// NewAdminService creates a new AdminService.
func NewAdminService(stats postgres.StatsRepository) *AdminService {
	return &AdminService{stats: stats}
}

// GetStats returns aggregate dashboard statistics.
func (s *AdminService) GetStats(ctx context.Context) (*AdminStats, error) {
	return s.stats.GetStats(ctx)
}

// GetProviderGrowth returns time-series provider growth data.
func (s *AdminService) GetProviderGrowth(ctx context.Context, rangeParam string) (*ProviderGrowthResponse, error) {
	return s.stats.GetProviderGrowth(ctx, rangeParam)
}
