package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
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

// validateCPF verifica se uma string contendo apenas dígitos é um CPF brasileiro válido.
func validateCPF(cpf string) bool {
	if len(cpf) != 11 {
		return false
	}
	// Rejeita sequências com todos os dígitos iguais.
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
	// Primeiro dígito verificador.
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
	// Segundo dígito verificador.
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

// validateCNPJ verifica se uma string contendo apenas dígitos é um CNPJ brasileiro válido.
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
	// Primeiro dígito verificador.
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
	// Segundo dígito verificador.
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

// AuthService trata operações de autenticação.
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
	// adminEmails é um conjunto de emails em minúsculas que recebem role=admin
	// no JWT independentemente do papel armazenado no BD. A fonte de verdade
	// está na config do processo; reiniciar aplica mudanças.
	adminEmails map[string]struct{}
}

// NewAuthService cria um novo AuthService. O handle db é usado por
// RegisterProvider, que precisa escrever users + providers atomicamente.
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

// SignupRequest contém dados validados de cadastro.
type SignupRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
	FullName string `json:"fullName" validate:"required"`
	Role     string `json:"role" validate:"omitempty,oneof=owner provider"`
}

// AuthResponse é retornado em login/signup/refresh bem-sucedidos.
type AuthResponse struct {
	AccessToken     string       `json:"accessToken"`
	RefreshToken    string       `json:"refreshToken"`
	ExpiresIn       int          `json:"expiresIn"` // segundos
	User            *models.User `json:"user"`
	NeedsOnboarding bool         `json:"needsOnboarding,omitempty"`
	OnboardingToken string       `json:"onboardingToken,omitempty"`
}

// Signup cria um novo usuário e retorna tokens.
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
	// Se o usuário é um prestador cujo perfil foi aprovado mas não completou
	// onboarding, gera automaticamente token de configuração para redirecionar.
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

// RegisterProviderRequest é enviado pelo formulário público "Seja um Parceiro Pet".
// Cria a conta de usuário e o perfil de prestador pendente em uma única
// transação para que cadastros parciais nunca fiquem órfãos.
//
// PF (pessoa_fisica) requer:  fullName, birthDate
// PJ (pessoa_juridica) requer: fullName (representante legal), businessName
//
//	(razão social), taxId (CNPJ)
//
// Validação cruzada de campos é feita no corpo do serviço, não via struct tags,
// porque go-playground/validator não compõe "required when X" de forma limpa.
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

// RegisterProvider cria o usuário e o prestador pendente em uma única transação.
// Ambas as linhas são commitadas juntas ou nenhuma — garante que nunca teremos
// um usuário "órfão" sem aplicação de prestador (ou vice-versa).
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
		// PF: nome pessoal serve como nome público do negócio até o prestador
		// editar seu perfil pós-aprovação.
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
		// fullName na requisição É o representante legal para PJ — mantemos
		// em user.full_name E espelhamos em providers para clareza.
		lr := req.FullName
		legalRepresentativeName = &lr
		taxID = req.TaxID
	default:
		// Não deveria chegar aqui — struct-tag oneof já bloqueia.
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
			// Pode ser providers_user_id_unique (concorrência no mesmo usuário) ou
			// o índice unique parcial tax_id — ambos são conflitos reportados
			// da mesma forma para o cliente.
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
	// Se o usuário é um prestador cujo perfil foi aprovado mas não completou
	// onboarding, gera automaticamente token de configuração para redirecionar.
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
	// Se o usuário é um prestador cujo perfil foi aprovado mas não completou
	// onboarding, gera automaticamente token de configuração para redirecionar.
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

// Refresh valida um refresh token e emite um novo access token.
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

	// Rotaciona refresh token.
	if err := s.tokens.Revoke(ctx, rawRefreshToken); err != nil {
		return nil, fmt.Errorf("INTERNAL_ERROR: failed to revoke old token")
	}

	resp, err := s.issueTokens(ctx, user)
	if err != nil {
		return nil, err
	}
	// Se o usuário é um prestador cujo perfil foi aprovado mas não completou
	// onboarding, gera automaticamente token de configuração para redirecionar.
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

// Logout revoga um refresh token.
func (s *AuthService) Logout(ctx context.Context, rawRefreshToken string) error {
	return s.tokens.Revoke(ctx, rawRefreshToken)
}

// RequestPasswordReset emite um token de recuperação de uso único para o usuário
// com o email fornecido. O token bruto é retornado para o chamador construir um
// link (enviar por email em produção, expor em dev). Quando o email não corresponde
// a um usuário conhecido, o método retorna ("", nil) — o endpoint público
// deliberadamente não pode distinguir "sem usuário" de "enviado" para evitar
// vazamento de existência de conta.
func (s *AuthService) RequestPasswordReset(ctx context.Context, email string) (string, error) {
	user, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		// Silencioso — mesma resposta do caminho de sucesso. O handler
		// sempre reporta "se o email existir, um link foi enviado".
		return "", nil
	}

	// Melhor esforço: invalida tokens pendentes anteriores. Um único usuário
	// não deve ter múltiplos tokens de redefinição ativos simultaneamente.
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

// ConfirmPasswordReset valida o token de recuperação e rotaciona a senha do
// usuário. Tokens são de uso único; uma vez consumidos, todos os refresh tokens
// existentes são revogados para que outras sessões não sobrevivam à troca de credenciais.
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
