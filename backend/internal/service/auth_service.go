package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"

	"pata-cao/internal/middleware"
	"pata-cao/internal/models"
	"pata-cao/internal/repository/postgres"
)

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

var (
	cpfFirstWeights   = []int{10, 9, 8, 7, 6, 5, 4, 3, 2}
	cpfSecondWeights  = []int{11, 10, 9, 8, 7, 6, 5, 4, 3, 2}
	cnpjFirstWeights  = []int{5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2}
	cnpjSecondWeights = []int{6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2}
)

// validateCPF checks whether a digit-only string is a valid Brazilian CPF.
func validateCPF(cpf string) bool {
	if len(cpf) != 11 {
		return false
	}
	// Reject all-same-digit sequences.
	allSame := true
	for i := 1; i < 11; i++ {
		if cpf[i] != cpf[0] {
			allSame = false
			break
		}
	}
	if allSame {
		return false
	}
	// First check digit.
	var sum int
	for i := 0; i < 9; i++ {
		sum += int(cpf[i]-'0') * cpfFirstWeights[i]
	}
	d1 := (sum * 10) % 11
	if d1 == 10 {
		d1 = 0
	}
	if d1 != int(cpf[9]-'0') {
		return false
	}
	// Second check digit.
	sum = 0
	for i := 0; i < 10; i++ {
		sum += int(cpf[i]-'0') * cpfSecondWeights[i]
	}
	d2 := (sum * 10) % 11
	if d2 == 10 {
		d2 = 0
	}
	return d2 == int(cpf[10]-'0')
}

// validateCNPJ checks whether a digit-only string is a valid Brazilian CNPJ.
func validateCNPJ(cnpj string) bool {
	if len(cnpj) != 14 {
		return false
	}
	allSame := true
	for i := 1; i < 14; i++ {
		if cnpj[i] != cnpj[0] {
			allSame = false
			break
		}
	}
	if allSame {
		return false
	}
	// First check digit.
	var sum int
	for i := 0; i < 12; i++ {
		sum += int(cnpj[i]-'0') * cnpjFirstWeights[i]
	}
	d1 := 11 - (sum % 11)
	if d1 >= 10 {
		d1 = 0
	}
	if d1 != int(cnpj[12]-'0') {
		return false
	}
	// Second check digit.
	sum = 0
	for i := 0; i < 13; i++ {
		sum += int(cnpj[i]-'0') * cnpjSecondWeights[i]
	}
	d2 := 11 - (sum % 11)
	if d2 >= 10 {
		d2 = 0
	}
	return d2 == int(cnpj[13]-'0')
}

// AuthService handles authentication operations.
type AuthService struct {
	db                  *sqlx.DB
	users               postgres.UserRepository
	tokens              postgres.TokenRepository
	passwordResets      postgres.PasswordResetRepository
	providers           postgres.ProviderRepository
	onboardingTokens    postgres.OnboardingTokenRepository
	jwtSecret           string
	accessExpiry        time.Duration
	refreshExpiry       time.Duration
	passwordResetExpiry time.Duration
	// adminEmails is a lowercased set of emails that get role=admin on the
	// JWT regardless of their stored DB role. Source of truth lives in the
	// process config; restart picks up changes.
	adminEmails map[string]struct{}
}

// NewAuthService creates a new AuthService. The db handle is used by
// RegisterProvider, which needs to write users + providers atomically.
func NewAuthService(
	db *sqlx.DB,
	users postgres.UserRepository,
	tokens postgres.TokenRepository,
	passwordResets postgres.PasswordResetRepository,
	providers postgres.ProviderRepository,
	onboardingTokens postgres.OnboardingTokenRepository,
	jwtSecret string,
	accessExpiry time.Duration,
	refreshExpiry time.Duration,
	passwordResetExpiry time.Duration,
	adminEmails map[string]struct{},
) *AuthService {
	return &AuthService{
		db:                  db,
		users:               users,
		tokens:              tokens,
		passwordResets:      passwordResets,
		providers:           providers,
		onboardingTokens:    onboardingTokens,
		jwtSecret:           jwtSecret,
		accessExpiry:        accessExpiry,
		refreshExpiry:       refreshExpiry,
		passwordResetExpiry: passwordResetExpiry,
		adminEmails:         adminEmails,
	}
}

// SignupRequest holds validated signup data.
type SignupRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
	FullName string `json:"fullName" validate:"required"`
	Role     string `json:"role" validate:"omitempty,oneof=owner provider"`
}

// AuthResponse is returned on successful login/signup/refresh.
type AuthResponse struct {
	AccessToken     string       `json:"accessToken"`
	RefreshToken    string       `json:"refreshToken"`
	ExpiresIn       int          `json:"expiresIn"` // seconds
	User            *models.User `json:"user"`
	NeedsOnboarding bool         `json:"needsOnboarding,omitempty"`
	OnboardingToken string       `json:"onboardingToken,omitempty"`
}

// Signup creates a new user and returns tokens.
func (s *AuthService) Signup(ctx context.Context, req SignupRequest) (*AuthResponse, error) {
	if !emailRegex.MatchString(req.Email) {
		return nil, fmt.Errorf("INVALID_EMAIL: invalid email format")
	}
	if err := validateStrongPassword(req.Password); err != nil {
		return nil, err
	}

	// Default role is owner.
	role := req.Role
	if role == "" {
		role = "owner"
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		return nil, fmt.Errorf("INTERNAL_ERROR: failed to hash password")
	}

	user := &models.User{
		Email:        req.Email,
		PasswordHash: string(hash),
		Role:         role,
		FullName:     req.FullName,
	}
	if err := s.users.Create(ctx, user); err != nil {
		if isUniqueErr(err) {
			return nil, fmt.Errorf("EMAIL_TAKEN: email already registered")
		}
		return nil, fmt.Errorf("INTERNAL_ERROR: failed to create user")
	}

	resp, err := s.issueTokens(ctx, user)
	if err != nil {
		return nil, err
	}
	// If the user is a provider whose profile was approved but hasn't completed
	// onboarding, auto-generate a setup token so the frontend can redirect them.
	if user.Role == "provider" {
		provider, perr := s.providers.GetByUserID(ctx, user.ID)
		if perr == nil && provider.Status == "approved" && provider.OnboardingCompletedAt == nil {
			rawToken, terr := GenerateSecureToken()
			if terr == nil {
				expiresAt := time.Now().Add(7 * 24 * time.Hour)
				if serr := s.onboardingTokens.Save(ctx, provider.ID, rawToken, expiresAt); serr == nil {
					resp.NeedsOnboarding = true
					resp.OnboardingToken = rawToken
				}
			}
		}
	}
	return resp, nil
}

// RegisterProviderRequest is submitted by the public "Seja um Parceiro Pet"
// form. It creates the user account and the pending provider profile in a
// single transaction so partial signups can never linger.
//
// PF (pessoa_fisica) requires:  fullName, birthDate
// PJ (pessoa_juridica) requires: fullName (legal representative), businessName
//
//	(razão social), taxId (CNPJ)
//
// Cross-field validation is enforced in the service body, not via struct tags,
// because go-playground/validator doesn't compose "required when X" cleanly.
type RegisterProviderRequest struct {
	// Account
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
	FullName string `json:"fullName" validate:"required,min=2,max=100"`
	Phone    string `json:"phone" validate:"required,min=8,max=20"`

	// Provider application
	AccountType      string  `json:"accountType" validate:"required,oneof=pessoa_fisica pessoa_juridica"`
	BirthDate        *string `json:"birthDate" validate:"omitempty,datetime=2006-01-02"`
	BusinessName     *string `json:"businessName"`
	TaxID            *string `json:"taxId"`
	Service          string  `json:"service" validate:"required,min=2,max=50"`
	DocumentType     string  `json:"documentType" validate:"required,min=2,max=20"`
	DocumentFileName *string `json:"documentFileName"`
	DocumentImageID  *string `json:"documentImageId"`
	SocialLink       *string `json:"socialLink"`
}

// RegisterProvider creates the user and the pending provider in one tx.
// Both rows are committed together or neither — guarantees we never get
// an "orphan" user without a provider application (or vice versa).
func (s *AuthService) RegisterProvider(ctx context.Context, req RegisterProviderRequest) (*AuthResponse, error) {
	if !emailRegex.MatchString(req.Email) {
		return nil, fmt.Errorf("INVALID_EMAIL: invalid email format")
	}
	if err := validateStrongPassword(req.Password); err != nil {
		return nil, err
	}

	// Cross-field validation. Per-account-type required fields can't be
	// expressed with struct tags alone, so they're enforced here.
	var (
		birthDate               *time.Time
		businessName            string
		legalRepresentativeName *string
		taxID                   *string
	)
	switch req.AccountType {
	case "pessoa_fisica":
		if req.BirthDate == nil || *req.BirthDate == "" {
			return nil, fmt.Errorf("VALIDATION_ERROR: birthDate is required for pessoa_fisica")
		}
		t, err := time.Parse("2006-01-02", *req.BirthDate)
		if err != nil {
			return nil, fmt.Errorf("VALIDATION_ERROR: birthDate must be YYYY-MM-DD")
		}
		birthDate = &t
		if req.TaxID == nil || *req.TaxID == "" {
			return nil, fmt.Errorf("VALIDATION_ERROR: taxId (CPF) is required for pessoa_fisica")
		}
		if !validateCPF(*req.TaxID) {
			return nil, fmt.Errorf("VALIDATION_ERROR: invalid CPF")
		}
		taxID = req.TaxID
		// PF: the personal name doubles as the public business name until
		// the provider edits their profile post-approval.
		businessName = req.FullName
	case "pessoa_juridica":
		if req.BusinessName == nil || *req.BusinessName == "" {
			return nil, fmt.Errorf("VALIDATION_ERROR: businessName (razão social) is required for pessoa_juridica")
		}
		if req.TaxID == nil || *req.TaxID == "" {
			return nil, fmt.Errorf("VALIDATION_ERROR: taxId (CNPJ) is required for pessoa_juridica")
		}
		if !validateCNPJ(*req.TaxID) {
			return nil, fmt.Errorf("VALIDATION_ERROR: invalid CNPJ")
		}
		businessName = *req.BusinessName
		// fullName on the request IS the legal representative for PJ — we
		// keep it on user.full_name AND mirror it on providers for clarity.
		lr := req.FullName
		legalRepresentativeName = &lr
		taxID = req.TaxID
	default:
		// Shouldn't reach — struct-tag oneof already gates this.
		return nil, fmt.Errorf("VALIDATION_ERROR: unsupported accountType")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		return nil, fmt.Errorf("INTERNAL_ERROR: failed to hash password")
	}

	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("INTERNAL_ERROR: failed to start transaction")
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p)
		}
	}()

	user := &models.User{
		Email:        req.Email,
		PasswordHash: string(hash),
		Role:         "provider",
		FullName:     req.FullName,
		Phone:        req.Phone,
	}
	err = tx.QueryRowContext(ctx,
		`INSERT INTO users (email, password_hash, role, full_name, phone)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, created_at, updated_at`,
		user.Email, user.PasswordHash, user.Role, user.FullName, user.Phone,
	).Scan(&user.ID, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		_ = tx.Rollback()
		if isUniqueErr(err) {
			return nil, fmt.Errorf("EMAIL_TAKEN: email already registered")
		}
		return nil, fmt.Errorf("INTERNAL_ERROR: failed to create user")
	}

	_, err = tx.ExecContext(ctx,
		`INSERT INTO providers
			(user_id, business_name, company_name, services, status,
			 account_type, birth_date, document_type, document_file_name, document_image_id, social_link,
			 legal_representative_name, tax_id)
		 VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10, $11, $12)`,
		user.ID, businessName, businessName, pq.Array([]string{req.Service}),
		req.AccountType, birthDate, req.DocumentType, req.DocumentFileName, req.DocumentImageID, req.SocialLink,
		legalRepresentativeName, taxID,
	)
	if err != nil {
		_ = tx.Rollback()
		if isUniqueErr(err) {
			// Could be providers_user_id_unique (race on the same user) or
			// the tax_id partial unique index — both are conflicts surfaced
			// the same way to the client.
			return nil, fmt.Errorf("ALREADY_EXISTS: provider profile or tax id already registered")
		}
		return nil, fmt.Errorf("INTERNAL_ERROR: failed to create provider")
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("INTERNAL_ERROR: failed to commit registration")
	}

	resp, err := s.issueTokens(ctx, user)
	if err != nil {
		return nil, err
	}
	// If the user is a provider whose profile was approved but hasn't completed
	// onboarding, auto-generate a setup token so the frontend can redirect them.
	if user.Role == "provider" {
		provider, perr := s.providers.GetByUserID(ctx, user.ID)
		if perr == nil && provider.Status == "approved" && provider.OnboardingCompletedAt == nil {
			rawToken, terr := GenerateSecureToken()
			if terr == nil {
				expiresAt := time.Now().Add(7 * 24 * time.Hour)
				if serr := s.onboardingTokens.Save(ctx, provider.ID, rawToken, expiresAt); serr == nil {
					resp.NeedsOnboarding = true
					resp.OnboardingToken = rawToken
				}
			}
		}
	}
	return resp, nil
}

// LoginRequest holds login credentials.
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

// Login verifies credentials and returns tokens.
func (s *AuthService) Login(ctx context.Context, req LoginRequest) (*AuthResponse, error) {
	user, err := s.users.GetByEmail(ctx, req.Email)
	if err != nil {
		// Constant-time-ish: still hash even if user not found.
		_ = bcrypt.CompareHashAndPassword([]byte("$2a$12$invalid"), []byte(req.Password))
		return nil, fmt.Errorf("INVALID_CREDENTIALS: email or password incorrect")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, fmt.Errorf("INVALID_CREDENTIALS: email or password incorrect")
	}

	resp, err := s.issueTokens(ctx, user)
	if err != nil {
		return nil, err
	}
	// If the user is a provider whose profile was approved but hasn't completed
	// onboarding, auto-generate a setup token so the frontend can redirect them.
	if user.Role == "provider" {
		provider, perr := s.providers.GetByUserID(ctx, user.ID)
		if perr == nil && provider.Status == "approved" && provider.OnboardingCompletedAt == nil {
			rawToken, terr := GenerateSecureToken()
			if terr == nil {
				expiresAt := time.Now().Add(7 * 24 * time.Hour)
				if serr := s.onboardingTokens.Save(ctx, provider.ID, rawToken, expiresAt); serr == nil {
					resp.NeedsOnboarding = true
					resp.OnboardingToken = rawToken
				}
			}
		}
	}
	return resp, nil
}

// Refresh validates a refresh token and issues a new access token.
func (s *AuthService) Refresh(ctx context.Context, rawRefreshToken string) (*AuthResponse, error) {
	stored, err := s.tokens.GetByHash(ctx, rawRefreshToken)
	if err != nil {
		return nil, fmt.Errorf("INVALID_TOKEN: refresh token not found")
	}
	if stored.RevokedAt != nil {
		return nil, fmt.Errorf("INVALID_TOKEN: refresh token has been revoked")
	}
	if time.Now().After(stored.ExpiresAt) {
		return nil, fmt.Errorf("TOKEN_EXPIRED: refresh token has expired")
	}

	user, err := s.users.GetByID(ctx, stored.UserID)
	if err != nil {
		return nil, fmt.Errorf("INTERNAL_ERROR: user not found")
	}

	// Rotate refresh token.
	if err := s.tokens.Revoke(ctx, rawRefreshToken); err != nil {
		return nil, fmt.Errorf("INTERNAL_ERROR: failed to revoke old token")
	}

	resp, err := s.issueTokens(ctx, user)
	if err != nil {
		return nil, err
	}
	// If the user is a provider whose profile was approved but hasn't completed
	// onboarding, auto-generate a setup token so the frontend can redirect them.
	if user.Role == "provider" {
		provider, perr := s.providers.GetByUserID(ctx, user.ID)
		if perr == nil && provider.Status == "approved" && provider.OnboardingCompletedAt == nil {
			rawToken, terr := GenerateSecureToken()
			if terr == nil {
				expiresAt := time.Now().Add(7 * 24 * time.Hour)
				if serr := s.onboardingTokens.Save(ctx, provider.ID, rawToken, expiresAt); serr == nil {
					resp.NeedsOnboarding = true
					resp.OnboardingToken = rawToken
				}
			}
		}
	}
	return resp, nil
}

// Logout revokes a refresh token.
func (s *AuthService) Logout(ctx context.Context, rawRefreshToken string) error {
	return s.tokens.Revoke(ctx, rawRefreshToken)
}

// UpdateProfileRequest carries the updatable owner profile fields.
type UpdateProfileRequest struct {
	CPF           *string         `json:"cpf"`
	Phone         *string         `json:"phone"`
	Bio           *string         `json:"bio"`
	AvatarImageID *string         `json:"avatarImageId"`
	SocialLinks   json.RawMessage `json:"socialLinks"`
}

// UpdateProfile updates the authenticated user's profile fields.
func (s *AuthService) UpdateProfile(ctx context.Context, userID string, req UpdateProfileRequest) (*models.User, error) {
	if req.CPF != nil {
		cpf := strings.Map(func(r rune) rune {
			if r >= '0' && r <= '9' {
				return r
			}
			return -1
		}, *req.CPF)
		if len(cpf) != 11 {
			return nil, fmt.Errorf("VALIDATION_ERROR: CPF must be exactly 11 digits")
		}
		if !validateCPF(cpf) {
			return nil, fmt.Errorf("VALIDATION_ERROR: invalid CPF check digits")
		}
		req.CPF = &cpf
	}

	// Build a fields map for the dynamic update.
	fields := map[string]interface{}{}
	if req.CPF != nil {
		fields["cpf"] = *req.CPF
	}
	if req.Phone != nil {
		fields["phone"] = *req.Phone
	}
	if req.Bio != nil {
		fields["bio"] = *req.Bio
	}
	if req.AvatarImageID != nil {
		fields["avatar_image_id"] = *req.AvatarImageID
	}
	if req.SocialLinks != nil {
		fields["social_links"] = req.SocialLinks
	}

	if len(fields) == 0 {
		// Nothing to update — return current user.
		return s.users.GetByID(ctx, userID)
	}

	if err := s.users.UpdateProfile(ctx, userID, fields); err != nil {
		if isUniqueErr(err) {
			return nil, fmt.Errorf("ALREADY_EXISTS: this CPF is already registered")
		}
		return nil, fmt.Errorf("INTERNAL_ERROR: failed to update profile")
	}

	return s.users.GetByID(ctx, userID)
}

// GetProfile returns the authenticated user's full profile.
func (s *AuthService) GetProfile(ctx context.Context, userID string) (*models.User, error) {
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("INTERNAL_ERROR: user not found")
	}
	return user, nil
}

// GetUserByID returns any user's profile by ID. Callers must enforce access control.
func (s *AuthService) GetUserByID(ctx context.Context, userID string) (*models.User, error) {
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("NOT_FOUND: user not found")
	}
	return user, nil
}

// DeleteProfile permanently deletes the user account and all cascaded data.
func (s *AuthService) DeleteProfile(ctx context.Context, userID string) error {
	if err := s.users.Delete(ctx, userID); err != nil {
		return fmt.Errorf("INTERNAL_ERROR: failed to delete user")
	}
	return nil
}

// RequestPasswordReset issues a single-use recovery token for the user with
// the given email. The raw token is returned so the caller can build a link
// (email it in prod, surface it in dev). When the email doesn't match a known
// user the method returns ("", nil) — the public endpoint deliberately can't
// distinguish "no user" from "sent" to avoid leaking account existence.
func (s *AuthService) RequestPasswordReset(ctx context.Context, email string) (string, error) {
	user, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		// Silent no-op — same response as the success path. The handler
		// always reports "if the email exists, a link was sent".
		return "", nil
	}

	// Best-effort: invalidate prior outstanding tokens. A single user
	// shouldn't have multiple live reset tokens floating around.
	_ = s.passwordResets.InvalidateAllForUser(ctx, user.ID)

	rawToken, err := generateSecureToken()
	if err != nil {
		return "", fmt.Errorf("INTERNAL_ERROR: failed to generate reset token")
	}
	expiresAt := time.Now().Add(s.passwordResetExpiry)
	if err := s.passwordResets.Save(ctx, user.ID, rawToken, expiresAt); err != nil {
		return "", fmt.Errorf("INTERNAL_ERROR: failed to store reset token")
	}
	return rawToken, nil
}

// ConfirmPasswordReset validates the recovery token and rotates the user's
// password. Tokens are single-use; once consumed the user's existing refresh
// tokens are all revoked so other sessions can't survive a credential change.
func (s *AuthService) ConfirmPasswordReset(ctx context.Context, rawToken, newPassword string) error {
	if rawToken == "" {
		return fmt.Errorf("INVALID_TOKEN: missing reset token")
	}
	if err := validateStrongPassword(newPassword); err != nil {
		return err
	}

	pr, err := s.passwordResets.GetByHash(ctx, rawToken)
	if err != nil {
		return fmt.Errorf("INVALID_TOKEN: reset link is invalid")
	}
	if pr.UsedAt != nil {
		return fmt.Errorf("INVALID_TOKEN: reset link has already been used")
	}
	if time.Now().After(pr.ExpiresAt) {
		return fmt.Errorf("TOKEN_EXPIRED: reset link has expired")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), 12)
	if err != nil {
		return fmt.Errorf("INTERNAL_ERROR: failed to hash password")
	}

	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return fmt.Errorf("INTERNAL_ERROR: failed to start transaction")
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2`,
		string(hash), pr.UserID,
	); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("INTERNAL_ERROR: failed to update password")
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE password_resets SET used_at=NOW() WHERE id=$1`, pr.ID,
	); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("INTERNAL_ERROR: failed to mark token used")
	}
	// Revoke every outstanding refresh token for this user. A password reset
	// is the textbook "log everyone out" signal.
	if _, err := tx.ExecContext(ctx,
		`UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL`, pr.UserID,
	); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("INTERNAL_ERROR: failed to revoke sessions")
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("INTERNAL_ERROR: failed to commit reset")
	}
	return nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

// applyAdminAllowlist promotes the user's role to "admin" iff their email is
// in the configured allowlist. Mutates the in-memory copy only so the JWT
// claim and the AuthResponse.User both reflect admin without touching the
// DB. Demotion happens implicitly: removing the email from the allowlist
// means the next issueTokens leaves user.Role at whatever the DB holds.
func (s *AuthService) applyAdminAllowlist(user *models.User) {
	if len(s.adminEmails) == 0 || user == nil {
		return
	}
	if _, ok := s.adminEmails[strings.ToLower(strings.TrimSpace(user.Email))]; ok {
		user.Role = "admin"
	}
}

func (s *AuthService) issueTokens(ctx context.Context, user *models.User) (*AuthResponse, error) {
	s.applyAdminAllowlist(user)

	accessToken, err := s.buildJWT(user)
	if err != nil {
		return nil, fmt.Errorf("INTERNAL_ERROR: failed to create access token")
	}

	rawRefresh, err := generateSecureToken()
	if err != nil {
		return nil, fmt.Errorf("INTERNAL_ERROR: failed to generate refresh token")
	}

	expiresAt := time.Now().Add(s.refreshExpiry)
	if err := s.tokens.Save(ctx, user.ID, rawRefresh, expiresAt); err != nil {
		return nil, fmt.Errorf("INTERNAL_ERROR: failed to store refresh token")
	}

	return &AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: rawRefresh,
		ExpiresIn:    int(s.accessExpiry.Seconds()),
		User:         user,
	}, nil
}

func (s *AuthService) buildJWT(user *models.User) (string, error) {
	now := time.Now()
	claims := middleware.Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.accessExpiry)),
		},
		Role: user.Role,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtSecret))
}

func generateSecureToken() (string, error) {
	b := make([]byte, 48)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

func isUniqueErr(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return contains(msg, "23505") || contains(msg, "unique constraint") || contains(msg, "duplicate key")
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && indexStr(s, sub) >= 0)
}

func indexStr(s, sub string) int {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
