package postgres

import (
	"context"
	"sort"
	"time"

	"github.com/jmoiron/sqlx"
)

// AdminStats holds aggregate counts for the admin dashboard.
type AdminStats struct {
	TotalUsers            int            `json:"totalUsers"`
	UsersByRole           map[string]int `json:"usersByRole"`
	TotalProviders        int            `json:"totalProviders"`
	ProvidersByStatus     map[string]int `json:"providersByStatus"`
	TotalBookings         int            `json:"totalBookings"`
	BookingsByStatus      map[string]int `json:"bookingsByStatus"`
	TotalPets             int            `json:"totalPets"`
	TotalReviews          int            `json:"totalReviews"`
	NewUsersLast30Days    int            `json:"newUsersLast30Days"`
	NewProvidersLast30Days int           `json:"newProvidersLast30Days"`
}

// ProviderGrowthPoint is a single point in the provider growth time-series.
type ProviderGrowthPoint struct {
	Date      string         `json:"date"`
	Total     int            `json:"total"`
	ByService map[string]int `json:"byService"`
}

// ProviderGrowthResponse is the time-series response for provider growth.
type ProviderGrowthResponse struct {
	Range    string                `json:"range"`
	Interval string                `json:"interval"`
	Data     []ProviderGrowthPoint `json:"data"`
}

// PetSpeciesPoint holds the count for a single pet species.
type PetSpeciesPoint struct {
	Species string `json:"species"`
	Count   int    `json:"count"`
}

// PetAgePoint holds the count for a single age bucket.
type PetAgePoint struct {
	Age   int `json:"age"`
	Count int `json:"count"`
}

// rawGrowthRow is a single row from the provider growth query.
type rawGrowthRow struct {
	Date    time.Time
	Service string
	Count   int
}

// StatsRepository provides aggregate dashboard statistics.
type StatsRepository interface {
	GetStats(ctx context.Context) (*AdminStats, error)
	GetProviderGrowth(ctx context.Context, rangeParam string) (*ProviderGrowthResponse, error)
	GetPetSpeciesDistribution(ctx context.Context) ([]PetSpeciesPoint, error)
	GetPetAgeDistribution(ctx context.Context, species string) ([]PetAgePoint, error)
}

type statsRepo struct {
	db *sqlx.DB
}

// NewStatsRepository creates a StatsRepository.
func NewStatsRepository(db *sqlx.DB) StatsRepository {
	return &statsRepo{db: db}
}

func (r *statsRepo) GetStats(ctx context.Context) (*AdminStats, error) {
	query := `
		SELECT
			(SELECT COUNT(*) FROM users)                                      AS total_users,
			(SELECT COUNT(*) FROM providers)                                  AS total_providers,
			(SELECT COUNT(*) FROM bookings)                                   AS total_bookings,
			(SELECT COUNT(*) FROM pets)                                       AS total_pets,
			(SELECT COUNT(*) FROM reviews)                                    AS total_reviews,
			(SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days')     AS new_users_30d,
			(SELECT COUNT(*) FROM providers WHERE created_at >= NOW() - INTERVAL '30 days') AS new_providers_30d
	`

	var stats AdminStats
	if err := r.db.QueryRowContext(ctx, query).Scan(
		&stats.TotalUsers, &stats.TotalProviders, &stats.TotalBookings,
		&stats.TotalPets, &stats.TotalReviews,
		&stats.NewUsersLast30Days, &stats.NewProvidersLast30Days,
	); err != nil {
		return nil, err
	}

	stats.UsersByRole = map[string]int{}
	stats.ProvidersByStatus = map[string]int{}
	stats.BookingsByStatus = map[string]int{}

	if err := r.scanGroupBy(ctx, `SELECT role, COUNT(*) FROM users GROUP BY role`, stats.UsersByRole); err != nil {
		return nil, err
	}
	if err := r.scanGroupBy(ctx, `SELECT status, COUNT(*) FROM providers GROUP BY status`, stats.ProvidersByStatus); err != nil {
		return nil, err
	}
	if err := r.scanGroupBy(ctx, `SELECT status, COUNT(*) FROM bookings GROUP BY status`, stats.BookingsByStatus); err != nil {
		return nil, err
	}

	return &stats, nil
}

func (r *statsRepo) GetProviderGrowth(ctx context.Context, rangeParam string) (*ProviderGrowthResponse, error) {
	now := time.Now().UTC()
	var since time.Time
	interval := "month"

	switch rangeParam {
	case "30d":
		since = now.AddDate(0, 0, -30)
		interval = "day"
	case "60d":
		since = now.AddDate(0, 0, -60)
		interval = "day"
	case "90d":
		since = now.AddDate(0, 0, -90)
		interval = "week"
	case "ytd":
		since = time.Date(now.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
		interval = "month"
	default: // "all"
		interval = "month"
	}

	query := `SELECT p.created_at, s.service, COUNT(DISTINCT p.id)
		FROM providers p, unnest(p.services) AS s(service)
		WHERE ($1::timestamp IS NULL OR p.created_at >= $1)
		GROUP BY p.created_at, s.service
		ORDER BY p.created_at`

	args := []interface{}{nil}
	if !since.IsZero() {
		args[0] = since
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rawRows []rawGrowthRow
	for rows.Next() {
		var row rawGrowthRow
		if err := rows.Scan(&row.Date, &row.Service, &row.Count); err != nil {
			return nil, err
		}
		rawRows = append(rawRows, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Build cumulative time-series buckets.
	// Determine the bucket key based on interval.
	bucketKey := func(t time.Time) string {
		switch interval {
		case "day":
			return t.Format("2006-01-02")
		case "week":
			year, week := t.ISOWeek()
			return time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, (week-1)*7).Format("2006-01-02")
		default:
			return t.Format("2006-01")
		}
	}

	bucketTotal := map[string]int{}
	bucketServices := map[string]map[string]int{}

	for _, row := range rawRows {
		key := bucketKey(row.Date)
		bucketTotal[key] += row.Count
		if bucketServices[key] == nil {
			bucketServices[key] = map[string]int{}
		}
		bucketServices[key][row.Service] += row.Count
	}

	// Sort bucket keys and build cumulative data.
	var keys []string
	for k := range bucketTotal {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	cumulative := 0
	cumulativeBySvc := map[string]int{}

	var data []ProviderGrowthPoint
	for _, key := range keys {
		cumulative += bucketTotal[key]
		for svc, count := range bucketServices[key] {
			cumulativeBySvc[svc] += count
		}
		bySvc := map[string]int{}
		for svc, c := range cumulativeBySvc {
			bySvc[svc] = c
		}
		data = append(data, ProviderGrowthPoint{
			Date:      key,
			Total:     cumulative,
			ByService: bySvc,
		})
	}

	if data == nil {
		data = []ProviderGrowthPoint{}
	}

	return &ProviderGrowthResponse{
		Range:    rangeParam,
		Interval: interval,
		Data:     data,
	}, nil
}

func (r *statsRepo) GetPetSpeciesDistribution(ctx context.Context) ([]PetSpeciesPoint, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT species, COUNT(*) FROM pets GROUP BY species ORDER BY count DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []PetSpeciesPoint
	for rows.Next() {
		var p PetSpeciesPoint
		if err := rows.Scan(&p.Species, &p.Count); err != nil {
			return nil, err
		}
		points = append(points, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if points == nil {
		points = []PetSpeciesPoint{}
	}
	return points, nil
}

func (r *statsRepo) GetPetAgeDistribution(ctx context.Context, species string) ([]PetAgePoint, error) {
	query := `SELECT
			CASE
				WHEN EXTRACT(YEAR FROM AGE(birth_date)) >= 10 THEN 10
				ELSE FLOOR(EXTRACT(YEAR FROM AGE(birth_date)))::int
			END AS age,
			COUNT(*)
		FROM pets
		WHERE ($1 = '' OR species = $1) AND birth_date IS NOT NULL
		GROUP BY 1
		ORDER BY 1`

	rows, err := r.db.QueryContext(ctx, query, species)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []PetAgePoint
	for rows.Next() {
		var p PetAgePoint
		if err := rows.Scan(&p.Age, &p.Count); err != nil {
			return nil, err
		}
		points = append(points, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if points == nil {
		points = []PetAgePoint{}
	}
	return points, nil
}

func (r *statsRepo) scanGroupBy(ctx context.Context, query string, out map[string]int) error {
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var count int
		if err := rows.Scan(&key, &count); err != nil {
			return err
		}
		out[key] = count
	}
	return rows.Err()
}
