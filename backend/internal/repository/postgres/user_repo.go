package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/jmoiron/sqlx"

	"pata-cao/internal/models"
)

// UserRepository defines persistence operations for users.
type UserRepository interface {
	Create(ctx context.Context, user *models.User) error
	GetByEmail(ctx context.Context, email string) (*models.User, error)
	GetByID(ctx context.Context, id string) (*models.User, error)
}

type userRepo struct {
	db *sqlx.DB
}

// NewUserRepository returns a UserRepository backed by PostgreSQL.
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
