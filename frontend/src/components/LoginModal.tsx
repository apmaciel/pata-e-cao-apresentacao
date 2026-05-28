import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { auth, type UserProfile } from '../services/api';
import { evaluatePassword } from '../utils/password';
import PasswordField from './PasswordField';
import { FiX } from 'react-icons/fi';

type Mode = 'signin' | 'signup';

interface LoginModalProps {
  open: boolean;
  initialMode?: Mode;
  onClose: () => void;
  onAuthenticated?: (user: UserProfile) => void;
}

interface FormState {
  email: string;
  password: string;
  fullName: string;
  confirmPassword: string;
}

interface FieldErrors {
  email?: string;
  password?: string;
  fullName?: string;
  confirmPassword?: string;
}

const EMPTY_FORM: FormState = {
  email: '',
  password: '',
  fullName: '',
  confirmPassword: '',
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function LoginModal({
  open,
  initialMode = 'signin',
  onClose,
  onAuthenticated,
}: LoginModalProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const isSignUp = mode === 'signup';

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setForm(EMPTY_FORM);
      setErrors({});
      setApiError(null);
      setLoading(false);
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    // Lock background scroll while modal is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus first field once mounted
    const focusTimer = window.setTimeout(() => firstFieldRef.current?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  if (!open) return null;

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (!form.email) {
      errs.email = t('auth.errors.emailRequired');
    } else if (!isValidEmail(form.email)) {
      errs.email = t('auth.errors.emailInvalid');
    }
    if (!form.password) {
      errs.password = t('auth.errors.passwordRequired');
    } else if (isSignUp && !evaluatePassword(form.password).valid) {
      errs.password = t('password.errorWeak');
    }
    if (isSignUp) {
      if (!form.fullName.trim()) {
        errs.fullName = t('auth.errors.nameRequired');
      }
      if (form.password !== form.confirmPassword) {
        errs.confirmPassword = t('auth.errors.passwordsMismatch');
      }
    }
    return errs;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FieldErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setApiError(null);
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setLoading(true);
    try {
      const resp = isSignUp
        ? await auth.signup(form.email, form.password, form.fullName.trim())
        : await auth.signin(form.email, form.password);
      onAuthenticated?.(resp.user);
      // Redirect providers with incomplete onboarding to the setup page.
      if (!isSignUp && resp.needsOnboarding && resp.onboardingToken) {
        window.location.href = `/providers/setup?token=${resp.onboardingToken}`;
        return;
      }
      onClose();

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.errors.generic');
      setApiError(msg);
    } finally {
      setLoading(false);
    }
  };

  const titleId = 'login-modal-title';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Card container — cream outer, tan inner, matches site mockup */}
      <div className="relative w-full max-w-md mx-4 my-8 bg-cream rounded-2xl shadow-xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('auth.close')}
          className="absolute top-3 right-3 p-2 rounded-full text-primary-dark hover:bg-black/5 transition-colors"
        >
          <FiX className="w-5 h-5" />
        </button>

        <div className="px-6 pt-8 pb-6 sm:px-10 sm:pt-10 sm:pb-8">
          {/* Title */}
          <h2
            id={titleId}
            className="font-display font-black text-3xl sm:text-4xl text-center text-footer tracking-wide uppercase mb-6"
          >
            {isSignUp ? t('auth.signUpTitle') : t('auth.signInTitle')}
          </h2>

          {/* Signup mode — redirect to provider registration */}
          {isSignUp ? (
            <div className="bg-cream-tan/70 rounded-2xl px-5 py-6 sm:px-7 sm:py-8 text-center">
              <p className="text-footer/80 text-sm mb-5 leading-relaxed">
                {t('auth.providerTabDescription')}
              </p>
              <a
                href="/providers/apply"
                className="inline-block w-full bg-primary hover:bg-primary-dark text-white font-display font-bold text-base uppercase tracking-wide py-3 rounded-lg transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:ring-offset-2 focus:ring-offset-cream-tan"
              >
                {t('auth.goToProviderRegistration')}
              </a>
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="mt-4 font-display font-bold text-[11px] uppercase tracking-wide text-footer/70 hover:text-primary-dark"
              >
                {t('auth.haveAccountCta')}
              </button>
            </div>
          ) : (
            /* Signin mode */
            <div className="bg-cream-tan/70 rounded-2xl px-5 py-6 sm:px-7 sm:py-8">
              <form onSubmit={handleSubmit} noValidate className="space-y-5">

                <div>
                  <label
                    htmlFor="lm-email"
                    className="block font-display font-bold text-xs uppercase tracking-wide text-footer mb-2"
                  >
                    {t('auth.emailLabel')}:
                  </label>
                  <input
                    ref={firstFieldRef}
                    id="lm-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    value={form.email}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 rounded-md bg-white text-gray-900 border ${
                      errors.email ? 'border-red-500' : 'border-transparent'
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
                  />
                  {errors.email && <p className="mt-1 text-xs text-red-700">{errors.email}</p>}
                </div>

                <div>
                  <label
                    htmlFor="lm-password"
                    className="block font-display font-bold text-xs uppercase tracking-wide text-footer mb-2"
                  >
                    {t('auth.passwordLabel')}:
                  </label>
                  <PasswordField
                    name="password"
                    value={form.password}
                    onChange={(v) => {
                      setForm((prev) => ({ ...prev, password: v }));
                      if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                    }}
                    placeholder=""
                    autoComplete="current-password"
                    className={`w-full px-3 py-2 rounded-md bg-white text-gray-900 border ${
                      errors.password ? 'border-red-500' : 'border-transparent'
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
                    hasError={!!errors.password}
                    showStrength={false}
                  />
                  {errors.password && (
                    <p className="mt-1 text-xs text-red-700">{errors.password}</p>
                  )}
                </div>



                {/* Helper links */}
                <div className="space-y-1 pt-1">
                  <a
                    href="/auth/forgot-password"
                    className="block font-display font-bold text-[11px] uppercase tracking-wide text-footer hover:text-primary-dark"
                  >
                    {t('auth.forgotPassword')}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setErrors({});
                      setApiError(null);
                    }}
                    className="block font-display font-bold text-[11px] uppercase tracking-wide text-footer/70 hover:text-primary-dark text-left"
                  >
                    {t('auth.noAccountCta')}
                  </button>
                </div>

                {apiError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2 text-sm">
                    {apiError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary-dark text-white font-display font-bold text-base uppercase tracking-wide py-3 rounded-lg transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:ring-offset-2 focus:ring-offset-cream-tan"
                >
                  {loading ? t('auth.loading') : t('auth.signInCta')}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
