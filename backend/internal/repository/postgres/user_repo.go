package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/jmoiron/sqlx"

	"pata-cao/internal/models"
)

// UserRepository define operações de persistência para usuários.
type UserRepository interface {
	Create(ctx context.Context, user *models.User) error
	GetByEmail(ctx context.Context, email string) (*models.User, error)
	GetByID(ctx context.Context, id string) (*models.User, error)
	Delete(ctx context.Context, id string) error
}

type userRepo struct {
	db *sqlx.DB
}

// NewUserRepository retorna um UserRepository com PostgreSQL.
func NewUserRepository(db *sqlx.DB) UserRepository {
	return &userRepo{db: db}
}

func (r *userRepo) Create(ctx context.Context, user *models.User) error {
	query := `
		INSERT INTO users (email, password_hash, role, full_name, phone)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, updated_at`
	return r.db.QueryRowContext(ctx, query,
		user.Email, user.PasswordHash, user.Role, user.FullName, user.Phone,
	).Scan(&user.ID, &user.CreatedAt, &user.UpdatedAt)
}

const userSelectColumns = `id, email, password_hash, role, full_name, COALESCE(phone,'') AS phone, created_at, updated_at`

func (r *userRepo) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := r.db.GetContext(ctx, &u,
		`SELECT `+userSelectColumns+`
		 FROM users WHERE email = $1`, email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("user not found")
		}
		return nil, err
	}
	return &u, nil
}

func (r *userRepo) GetByID(ctx context.Context, id string) (*models.User, error) {
	var u models.User
	err := r.db.GetContext(ctx, &u,
		`SELECT `+userSelectColumns+`
		 FROM users WHERE id = $1`, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("user not found")
		}
		return nil, err
	}
	return &u, nil
}

// Delete remove um usuário por ID. A tabela users tem ON DELETE CASCADE para
// providers (via providers.user_id), que por sua vez cascateia para reviews,
// gallery images, onboarding tokens, registros de auditoria e refresh_tokens.
// Chamadores devem remover o prestador do índice Typesense antes de invocar isso.
func (r *userRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM users WHERE id = $1`, id)
	return err
}
