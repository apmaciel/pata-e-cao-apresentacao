package handler

import (
	"net/http"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"

	"pata-cao/internal/service"
)

// refreshCookieName é o cookie httpOnly que carrega o refresh token.
// O caminho tem escopo /api/auth para não ser enviado em requisições não relacionadas.
const refreshCookieName = "refresh_token"
const refreshCookiePath = "/api/auth"

// AuthHandler trata endpoints de autenticação.
type AuthHandler struct {
	auth         *service.AuthService
	validate     *validator.Validate
	cookieSecure bool
	refreshTTL   time.Duration
	frontendURL  string
	devMode      bool
}

// NewAuthHandler cria um novo AuthHandler.
func NewAuthHandler(
	auth *service.AuthService,
	cookieSecure bool,
	refreshTTL time.Duration,
	frontendURL string,
	devMode bool,
) *AuthHandler {
	return &AuthHandler{
		auth:         auth,
		validate:     validator.New(),
		cookieSecure: cookieSecure,
		refreshTTL:   refreshTTL,
		frontendURL:  frontendURL,
		devMode:      devMode,
	}
}

// clientAuthResponse espelha service.AuthResponse sem o RefreshToken —
// este viaja em um cookie httpOnly, nunca no corpo JSON.
type clientAuthResponse struct {
	AccessToken string      `json:"accessToken"`
	ExpiresIn   int         `json:"expiresIn"`
	User        interface{} `json:"user"`
}

func toClientResponse(r *service.AuthResponse) clientAuthResponse {
	return clientAuthResponse{
		AccessToken: r.AccessToken,
		ExpiresIn:   r.ExpiresIn,
		User:        r.User,
	}
}

func (h *AuthHandler) setRefreshCookie(c echo.Context, token string) {
	c.SetCookie(&http.Cookie{
		Name:     refreshCookieName,
		Value:    token,
		Path:     refreshCookiePath,
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(h.refreshTTL),
		MaxAge:   int(h.refreshTTL.Seconds()),
	})
}

func (h *AuthHandler) clearRefreshCookie(c echo.Context) {
	c.SetCookie(&http.Cookie{
		Name:     refreshCookieName,
		Value:    "",
		Path:     refreshCookiePath,
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
	})
}

// RegisterProvider trata POST /api/providers/register (público).
// Cadastro único que cria um usuário + perfil de prestador pendente atomicamente.
func (h *AuthHandler) RegisterProvider(c echo.Context) error {
	var req service.RegisterProviderRequest
	if err := c.Bind(&req); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(req); err != nil {
		return validationError(c, err)
	}

	resp, err := h.auth.RegisterProvider(c.Request().Context(), req)
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	h.setRefreshCookie(c, resp.RefreshToken)
	return c.JSON(http.StatusCreated, toClientResponse(resp))
}

// Signup trata POST /api/auth/signup
func (h *AuthHandler) Signup(c echo.Context) error {
	var req service.SignupRequest
	if err := c.Bind(&req); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(req); err != nil {
		return validationError(c, err)
	}

	resp, err := h.auth.Signup(c.Request().Context(), req)
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	h.setRefreshCookie(c, resp.RefreshToken)
	return c.JSON(http.StatusCreated, toClientResponse(resp))
}

// Login trata POST /api/auth/login
func (h *AuthHandler) Login(c echo.Context) error {
	var req service.LoginRequest
	if err := c.Bind(&req); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(req); err != nil {
		return validationError(c, err)
	}

	resp, err := h.auth.Login(c.Request().Context(), req)
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	h.setRefreshCookie(c, resp.RefreshToken)
	return c.JSON(http.StatusOK, toClientResponse(resp))
}

// Refresh trata POST /api/auth/refresh — lê o refresh token do cookie.
func (h *AuthHandler) Refresh(c echo.Context) error {
	cookie, err := c.Cookie(refreshCookieName)
	if err != nil || cookie.Value == "" {
		return apiError(c, http.StatusUnauthorized, "INVALID_TOKEN", "refresh token missing")
	}

	resp, err := h.auth.Refresh(c.Request().Context(), cookie.Value)
	if err != nil {
		// Stale cookie — clear it so the client stops sending it.
		h.clearRefreshCookie(c)
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	h.setRefreshCookie(c, resp.RefreshToken)
	return c.JSON(http.StatusOK, toClientResponse(resp))
}

// RequestPasswordReset trata POST /api/auth/password-reset/request.
//
// Sempre responde 200 com mensagem genérica "se o email existir..." para que
// o endpoint não possa ser usado para enumerar contas registradas. Em modo dev
// a resposta inclui `devResetLink` para testes sem relay de email.
func (h *AuthHandler) RequestPasswordReset(c echo.Context) error {
	var body struct {
		Email string `json:"email" validate:"required,email"`
	}
	if err := c.Bind(&body); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(body); err != nil {
		return validationError(c, err)
	}

	rawToken, err := h.auth.RequestPasswordReset(c.Request().Context(), body.Email)
	if err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}

	resp := map[string]string{
		"message": "if an account exists for that email, a reset link has been sent",
	}
	// Conveniência dev: expõe o link real na resposta para o UI copiar
	// localmente. NUNCA habilitado em produção (controlado por devMode).
	if h.devMode && rawToken != "" {
		resp["devResetLink"] = h.frontendURL + "/auth/reset-password?token=" + rawToken
	}
	return c.JSON(http.StatusOK, resp)
}

// ConfirmPasswordReset trata POST /api/auth/password-reset/confirm.
func (h *AuthHandler) ConfirmPasswordReset(c echo.Context) error {
	var body struct {
		Token    string `json:"token" validate:"required"`
		Password string `json:"password" validate:"required"`
	}
	if err := c.Bind(&body); err != nil {
		return apiError(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
	}
	if err := h.validate.Struct(body); err != nil {
		return validationError(c, err)
	}

	if err := h.auth.ConfirmPasswordReset(c.Request().Context(), body.Token, body.Password); err != nil {
		code, errCode, msg := parseServiceError(err)
		return apiError(c, code, errCode, msg)
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "password updated"})
}

// Logout trata DELETE /api/auth/logout — revoga o refresh token do cookie.
func (h *AuthHandler) Logout(c echo.Context) error {
	cookie, err := c.Cookie(refreshCookieName)
	if err == nil && cookie.Value != "" {
		// Revogação no melhor esforço; limpa cookie independente do resultado.
		_ = h.auth.Logout(c.Request().Context(), cookie.Value)
	}
	h.clearRefreshCookie(c)
	return c.JSON(http.StatusOK, map[string]string{"message": "logged out successfully"})
}
