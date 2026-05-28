package middleware

import (
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
)

const (
	ctxKeyUserID   = "userID"
	ctxKeyUserRole = "userRole"
)

// Claims is the JWT payload.
type Claims struct {
	jwt.RegisteredClaims
	Role string `json:"role"`
}

// JWTAuth returns an Echo middleware that validates Bearer JWT tokens.
// On success it stores userID and role in the context.
func JWTAuth(secret string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			token, err := extractBearer(c)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, map[string]string{
					"error":   "UNAUTHORIZED",
					"message": "missing or malformed authorization header",
				})
			}

			claims, err := parseJWT(token, secret)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, map[string]string{
					"error":   "INVALID_TOKEN",
					"message": "token is invalid or expired",
				})
			}

			c.Set(ctxKeyUserID, claims.Subject)
			c.Set(ctxKeyUserRole, claims.Role)
			return next(c)
		}
	}
}

// RequireAdmin rejects requests from non-admin users.
// Must be placed after JWTAuth in the middleware chain.
func RequireAdmin() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if GetUserRole(c) != "admin" {
				return c.JSON(http.StatusForbidden, map[string]string{
					"error":   "FORBIDDEN",
					"message": "admin access required",
				})
			}
			return next(c)
		}
	}
}

// RequireProvider rejects requests from non-provider (and non-admin) users.
func RequireProvider() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			role := GetUserRole(c)
			if role != "provider" && role != "admin" {
				return c.JSON(http.StatusForbidden, map[string]string{
					"error":   "FORBIDDEN",
					"message": "provider access required",
				})
			}
			return next(c)
		}
	}
}

// GetUserID retrieves the authenticated user's ID from the Echo context.
// Returns an empty string if not set.
func GetUserID(c echo.Context) string {
	v, _ := c.Get(ctxKeyUserID).(string)
	return v
}

// GetUserRole retrieves the authenticated user's role from the Echo context.
func GetUserRole(c echo.Context) string {
	v, _ := c.Get(ctxKeyUserRole).(string)
	return v
}

// extractBearer pulls the raw JWT string from the Authorization header.
func extractBearer(c echo.Context) (string, error) {
	header := c.Request().Header.Get("Authorization")
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return "", echo.ErrUnauthorized
	}
	return strings.TrimSpace(parts[1]), nil
}

// parseJWT validates the token string and returns the claims.
func parseJWT(tokenStr, secret string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, echo.ErrUnauthorized
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	return claims, nil
}
