package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"pata-cao/internal/models"
)

// OnboardingTokenRepository persists one-time provider setup tokens.
type OnboardingTokenRepository interface {
	Save(ctx context.Context, providerID, rawToken string, expiresAt time.Time) error
	GetByHash(ctx context.Context, rawToken string) (*models.ProviderOnboardingToken, error)
	Consume(ctx context.Context, rawToken string) error
}

type onboardingTokenRepo struct {
	db *sqlx.DB
}

func NewOnboardingTokenRepository(db *sqlx.DB) OnboardingTokenRepository {
	return &onboardingTokenRepo{db: db}
}

func (r *onboardingTokenRepo) Save(ctx context.Context, providerID, rawToken string, expiresAt time.Time) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO provider_onboarding_tokens (provider_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		providerID, hashToken(rawToken), expiresAt)
	return err
}

func (r *onboardingTokenRepo) GetByHash(ctx context.Context, rawToken string) (*models.ProviderOnboardingToken, error) {
	var t models.ProviderOnboardingToken
	err := r.db.GetContext(ctx, &t,
		`SELECT id, provider_id, token_hash, expires_at, consumed_at, created_at
		 FROM provider_onboarding_tokens WHERE token_hash = $1`, hashToken(rawToken))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("token not found")
		}
		return nil, err
	}
	return &t, nil
}

func (r *onboardingTokenRepo) Consume(ctx context.Context, rawToken string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE provider_onboarding_tokens SET consumed_at=NOW() WHERE token_hash=$1 AND consumed_at IS NULL`,
		hashToken(rawToken))
	return err
}
