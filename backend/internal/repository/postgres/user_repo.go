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
	Update(ctx context.Context, user *models.User) error
	UpdateProfile(ctx context.Context, userID string, fields map[string]interface{}) error
	Delete(ctx context.Context, id string) error
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

const userSelectColumns = `id, email, password_hash, role, full_name, COALESCE(phone,'') AS phone, cpf, COALESCE(bio,'') AS bio, avatar_image_id, COALESCE(social_links,'{}') AS social_links, created_at, updated_at`

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

func (r *userRepo) Update(ctx context.Context, user *models.User) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE users SET full_name=$1, phone=$2, cpf=$3, bio=$4, avatar_image_id=$5, social_links=$6::jsonb, updated_at=NOW() WHERE id=$7`,
		user.FullName, user.Phone, user.CPF, user.Bio, user.AvatarImageID, user.SocialLinks, user.ID)
	return err
}

// UpdateProfile updates only the provided non-nil fields for the given user.
func (r *userRepo) UpdateProfile(ctx context.Context, userID string, fields map[string]interface{}) error {
	// Build a dynamic UPDATE from the provided fields map.
	// Only allow safe columns: phone, cpf, bio, avatar_image_id, social_links.
	allowed := map[string]bool{
		"phone": true, "cpf": true, "bio": true,
		"avatar_image_id": true, "social_links": true,
	}

	setClauses := []string{}
	args := []interface{}{}
	argIdx := 1

	for col, val := range fields {
		if !allowed[col] {
			continue
		}
		placeholder := fmt.Sprintf("$%d", argIdx)
		// PostgreSQL needs an explicit cast for JSONB columns.
		if col == "social_links" {
			placeholder += "::jsonb"
		}
		setClauses = append(setClauses, fmt.Sprintf("%s=%s", col, placeholder))
		args = append(args, val)
		argIdx++
	}

	if len(setClauses) == 0 {
		return nil
	}

	query := "UPDATE users SET " + setClauses[0]
	for i := 1; i < len(setClauses); i++ {
		query += ", " + setClauses[i]
	}
	query += fmt.Sprintf(", updated_at=NOW() WHERE id=$%d", argIdx)
	args = append(args, userID)

	_, err := r.db.ExecContext(ctx, query, args...)
	return err
}

func (r *userRepo) Delete(ctx context.Context, id string) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}
