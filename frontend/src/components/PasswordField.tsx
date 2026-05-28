import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { evaluatePassword, generateStrongPassword } from '../utils/password';

interface PasswordFieldProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: 'new-password' | 'current-password';
  className: string;
  hasError?: boolean;
  /** When true, render strength meter + "suggest strong password" affordance. */
  showStrength?: boolean;
}

// Strength bar colors map to score 0..4. The threshold for "valid" (3+ classes,
// >= 10 chars) lands at score 3 so users can see they're hitting the floor.
const STRENGTH_COLORS = ['bg-red-400', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-primary'];

export default function PasswordField({
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  className,
  hasError,
  showStrength,
}: PasswordFieldProps) {
  const { t } = useTranslation();
  const [reveal, setReveal] = useState(false);
  const inputId = useId();

  const strength = useMemo(
    () => (showStrength && value ? evaluatePassword(value) : null),
    [value, showStrength],
  );

  const strengthLabel = (() => {
    if (!strength) return '';
    if (strength.valid) return t('password.strengthStrong');
    if (strength.score >= 2) return t('password.strengthMedium');
    return t('password.strengthWeak');
  })();

  const handleSuggest = () => {
    const generated = generateStrongPassword();
    onChange(generated);
    setReveal(true);
  };

  return (
    <div>
      <div className="relative">
        <input
          id={inputId}
          name={name}
          type={reveal ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${className} pr-20`}
          aria-describedby={showStrength ? `${inputId}-strength` : undefined}
          aria-invalid={hasError || undefined}
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          aria-label={reveal ? t('password.hide') : t('password.show')}
          className="absolute inset-y-0 right-3 flex items-center text-footer/70 hover:text-footer text-xs font-display font-bold uppercase tracking-wide"
        >
          {reveal ? t('password.hide') : t('password.show')}
        </button>
      </div>

      {showStrength && (
        <div id={`${inputId}-strength`} className="mt-2 space-y-1">
          <div className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded ${
                  strength && strength.score > i ? STRENGTH_COLORS[strength.score] : 'bg-footer/15'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span
              className={`font-display font-bold uppercase tracking-wide ${
                strength?.valid ? 'text-primary-dark' : 'text-footer/70'
              }`}
              aria-live="polite"
            >
              {value ? strengthLabel : t('password.requirements')}
            </span>
            <button
              type="button"
              onClick={handleSuggest}
              className="font-display font-bold text-[11px] uppercase tracking-wide text-primary hover:text-primary-dark underline whitespace-nowrap"
            >
              {t('password.suggest')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
