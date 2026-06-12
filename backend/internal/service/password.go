package service

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"unicode"
)

// GenerateSecureToken retorna um token criptograficamente aleatório de 48 bytes
// codificado como string base64 URL-safe. Adequado para refresh tokens,
// tokens de redefinição de senha e tokens de convite de onboarding.
func GenerateSecureToken() (string, error) {
	b := make([]byte, 48)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

// minPasswordLength é o mínimo exigido no cadastro e redefinição de senha.
// Mantido em sincronia com o frontend (veja PasswordField.tsx).
const minPasswordLength = 10

// validateStrongPassword aplica a regra descrita no SKILL.md e no componente
// PasswordField: pelo menos minPasswordLength caracteres E pelo menos três
// das quatro classes (minúsculas, maiúsculas, dígito, símbolo).
// Retorna erro prefixado com VALIDATION_ERROR para o parseServiceError
// mapear para resposta 422 corretamente.
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
