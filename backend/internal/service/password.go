package service

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"unicode"
)

// GenerateSecureToken returns a 48-byte cryptographically random token
// encoded as a URL-safe base64 string. Suitable for refresh tokens,
// password-reset tokens, and onboarding invite tokens.
func GenerateSecureToken() (string, error) {
	b := make([]byte, 48)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

// minPasswordLength is the floor enforced on signup and password reset.
// Kept in lockstep with the frontend (see PasswordField.tsx).
const minPasswordLength = 10

// validateStrongPassword enforces the rule described in SKILL.md and the
// PasswordField component: at least minPasswordLength chars AND at least
// three of the four classes (lowercase, uppercase, digit, symbol).
// Returns a VALIDATION_ERROR-prefixed error so the existing parseServiceError
// path maps it to a 422 response cleanly.
func validateStrongPassword(pw string) error {
	if len(pw) < minPasswordLength {
		return fmt.Errorf("VALIDATION_ERROR: password must be at least %d characters", minPasswordLength)
	}
	var hasLower, hasUpper, hasDigit, hasSymbol bool
	for _, r := range pw {
		switch {
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsDigit(r):
			hasDigit = true
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			hasSymbol = true
		}
	}
	classes := 0
	for _, ok := range []bool{hasLower, hasUpper, hasDigit, hasSymbol} {
		if ok {
			classes++
		}
	}
	if classes < 3 {
		return fmt.Errorf("VALIDATION_ERROR: password must include at least three of: uppercase, lowercase, digit, symbol")
	}
	return nil
}
