package postgres

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
)

// StoredToken is a refresh token record.
type StoredToken struct {
	ID        string     `db:"id"`
	UserID    string     `db:"user_id"`
	TokenHash string     `db:"token_hash"`
	ExpiresAt time.Time  `db:"expires_at"`
	CreatedAt time.Time  `db:"created_at"`
	RevokedAt *time.Time `db:"revoked_at"`
}

// TokenRepository manages refresh token persistence.
type TokenRepository interface {
	Save(ctx context.Context, userID string, rawToken string, expiresAt time.Time) error
	GetByHash(ctx context.Context, rawToken string) (*StoredToken, error)
	Revoke(ctx context.Context, rawToken string) error
	RevokeAllForUser(ctx context.Context, userID string) error
}

type tokenRepo struct {
	db *sqlx.DB
}

// NewTokenRepository returns a TokenRepository backed by PostgreSQL.
func NewTokenRepository(db *sqlx.DB) TokenRepository {
	return &tokenRepo{db: db}
}

func (r *tokenRepo) Save(ctx context.Context, userID, rawToken string, expiresAt time.Time) error {
	hash := hashToken(rawToken)
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, hash, expiresAt)
	return err
}

func (r *tokenRepo) GetByHash(ctx context.Context, rawToken string) (*StoredToken, error) {
	hash := hashToken(rawToken)
	var t StoredToken
	err := r.db.GetContext(ctx, &t,
		`SELECT id, user_id, token_hash, expires_at, created_at, revoked_at
		 FROM refresh_tokens WHERE token_hash = $1`, hash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("token not found")
		}
		return nil, err
	}
	return &t, nil
}

func (r *tokenRepo) Revoke(ctx context.Context, rawToken string) error {
	hash := hashToken(rawToken)
	_, err := r.db.ExecContext(ctx,
		`UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL`, hash)
	return err
}

func (r *tokenRepo) RevokeAllForUser(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL`, userID)
	return err
}

// hashToken returns a hex-encoded SHA-256 hash of the raw token.
// Tokens are hashed before storage so the DB never contains usable bearer values.
func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", sum)
}
