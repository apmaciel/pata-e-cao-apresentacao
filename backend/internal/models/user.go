package models

import (
	"encoding/json"
	"time"
)

// User represents an application user. Role is one of: owner, provider, admin.
type User struct {
	ID            string          `db:"id" json:"id"`
	Email         string          `db:"email" json:"email"`
	PasswordHash  string          `db:"password_hash" json:"-"`
	Role          string          `db:"role" json:"role"`
	FullName      string          `db:"full_name" json:"fullName"`
	Phone         string          `db:"phone" json:"phone,omitempty"`
	CPF           *string         `db:"cpf" json:"cpf,omitempty"`
	Bio           string          `db:"bio" json:"bio,omitempty"`
	AvatarImageID *string         `db:"avatar_image_id" json:"avatarImageId,omitempty"`
	SocialLinks   json.RawMessage `db:"social_links" json:"socialLinks,omitempty"`
	CreatedAt     time.Time       `db:"created_at" json:"createdAt"`
	UpdatedAt     time.Time       `db:"updated_at" json:"updatedAt"`
}
