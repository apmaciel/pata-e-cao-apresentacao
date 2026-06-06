package models

import (
	"time"
)

// User represents an application user. Role is one of: owner, provider, admin.
type User struct {
	ID           string    `db:"id" json:"id"`
	Email        string    `db:"email" json:"email"`
	PasswordHash string    `db:"password_hash" json:"-"`
	Role         string    `db:"role" json:"role"`
	FullName     string    `db:"full_name" json:"fullName"`
	Phone        string    `db:"phone" json:"phone,omitempty"`
	CreatedAt    time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt    time.Time `db:"updated_at" json:"updatedAt"`
}
