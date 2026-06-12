package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
)

// PasswordReset é uma linha de token de recuperação de uso único.
type PasswordReset struct {
	ID        string     `db:"id"`
	UserID    string     `db:"user_id"`
	TokenHash string     `db:"token_hash"`
	ExpiresAt time.Time  `db:"expires_at"`
	UsedAt    *time.Time `db:"used_at"`
	CreatedAt time.Time  `db:"created_at"`
}

// PasswordResetRepository persists password-recovery tokens.
type PasswordResetRepository interface {
	Save(ctx context.Context, userID, rawToken string, expiresAt time.Time) error
	GetByHash(ctx context.Context, rawToken string) (*PasswordReset, error)
	MarkUsed(ctx context.Context, id string) error
	// InvalidateAllForUser revoga tokens pendentes, então emitir um novo
	// ou completar um reset limpa quaisquer outros em trânsito.
	InvalidateAllForUser(ctx context.Context, userID string) error
}

type passwordResetRepo struct {
	db *sqlx.DB
}

// NewPasswordResetRepository retorna um PasswordResetRepository com PostgreSQL.
func NewPasswordResetRepository(db *sqlx.DB) PasswordResetRepository {
	return &passwordResetRepo{db: db}
}

func (r *passwordResetRepo) Save(ctx context.Context, userID, rawToken string, expiresAt time.Time) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, hashToken(rawToken), expiresAt)
	return err
}

func (r *passwordResetRepo) GetByHash(ctx context.Context, rawToken string) (*PasswordReset, error) {
	var pr PasswordReset
	err := r.db.GetContext(ctx, &pr,
		`SELECT id, user_id, token_hash, expires_at, used_at, created_at
		 FROM password_resets WHERE token_hash = $1`, hashToken(rawToken))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("token not found")
		}
		return nil, err
	}
	return &pr, nil
}

func (r *passwordResetRepo) MarkUsed(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE password_resets SET used_at=NOW() WHERE id=$1 AND used_at IS NULL`, id)
	return err
}

func (r *passwordResetRepo) InvalidateAllForUser(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE password_resets SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL`, userID)
	return err
}
