package service

import (
	"context"

	"pata-cao/internal/repository/postgres"
)

// AdminStats is re-exported from the repository package.
type AdminStats = postgres.AdminStats

// ProviderGrowthResponse is re-exported from the repository package.
type ProviderGrowthResponse = postgres.ProviderGrowthResponse

// PetSpeciesPoint is re-exported from the repository package.
type PetSpeciesPoint = postgres.PetSpeciesPoint

// PetAgePoint is re-exported from the repository package.
type PetAgePoint = postgres.PetAgePoint

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

// GetPetSpeciesDistribution returns the count of pets grouped by species.
func (s *AdminService) GetPetSpeciesDistribution(ctx context.Context) ([]PetSpeciesPoint, error) {
	return s.stats.GetPetSpeciesDistribution(ctx)
}

// GetPetAgeDistribution returns the count of pets grouped by age bucket,
// optionally filtered by species.
func (s *AdminService) GetPetAgeDistribution(ctx context.Context, species string) ([]PetAgePoint, error) {
	return s.stats.GetPetAgeDistribution(ctx, species)
}
