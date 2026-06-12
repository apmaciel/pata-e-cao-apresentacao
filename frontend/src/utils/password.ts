// Password policy mirrors backend/internal/service/password.go.
// Keep both files in sync — at least minLength chars, at least 3 of 4 classes.

export const MIN_PASSWORD_LENGTH = 10;

export interface PasswordStrength {
  /** classes matched out of 4 (lower, upper, digit, symbol) */
  classes: number;
  /** 0..4 — used to drive the strength meter; never exceeds 4 */
  score: number;
  /** true iff the password meets the backend policy */
  valid: boolean;
}

export function evaluatePassword(pw: string): PasswordStrength {
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^A-Za-z0-9]/.test(pw)) classes++;

  // The strength score also rewards length over the floor — purely cosmetic
  // for the UI bar; validity is determined by classes + length.
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= MIN_PASSWORD_LENGTH) score++;
  if (classes >= 2) score++;
  if (classes >= 3) score++;
  if (pw.length >= 14 && classes >= 4) score = 4;

  return {
    classes,
    score: Math.min(score, 4),
    valid: pw.length >= MIN_PASSWORD_LENGTH && classes >= 3,
  };
}

// generateStrongPassword returns a 14-char password that always satisfies
// the policy: one of each class, the rest random across all classes.
// Usa crypto.getRandomValues para amostragem não enviesada.
export function generateStrongPassword(length = 14): string {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const symbols = '!@#$%^&*()-_=+[]{};:,.?';
  const all = lower + upper + digits + symbols;

  const pick = (chars: string) => {
    const idx = new Uint32Array(1);
    crypto.getRandomValues(idx);
    return chars[idx[0] % chars.length];
  };

  const out: string[] = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  while (out.length < length) {
    out.push(pick(all));
  }

  // Shuffle (Fisher-Yates) with crypto randomness so the leading character
  // isn't predictably lowercase.
  for (let i = out.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}
