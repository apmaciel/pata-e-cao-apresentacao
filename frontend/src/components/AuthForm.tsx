import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { auth } from '../services/api';
import '../i18n.config';

interface AuthFormProps {
  mode: 'signin' | 'signup';
}

interface FormState {
  email: string;
  password: string;
  fullName: string;
  confirmPassword: string;
}

interface ValidationErrors {
  email?: string;
  password?: string;
  fullName?: string;
  confirmPassword?: string;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function AuthForm({ mode }: AuthFormProps) {
  const { t } = useTranslation();
  const isSignUp = mode === 'signup';

  const [form, setForm] = useState<FormState>({
    email: '',
    password: '',
    fullName: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const validate = (): ValidationErrors => {
    const errs: ValidationErrors = {};

    if (!form.email) {
      errs.email = t('auth.errors.emailRequired');
    } else if (!validateEmail(form.email)) {
      errs.email = t('auth.errors.emailInvalid');
    }

    if (!form.password) {
      errs.password = t('auth.errors.passwordRequired');
    } else if (isSignUp && form.password.length < 8) {
      errs.password = t('auth.errors.passwordMinLength');
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
    // Clear field error on change
    if (errors[name as keyof ValidationErrors]) {
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
      if (isSignUp) {
        await auth.signup(form.email, form.password, form.fullName);
        setSuccess(true);
        // Redirect after brief pause
        setTimeout(() => {
          window.location.href = '/auth/signin?registered=1';
        }, 1500);
      } else {
        const resp = await auth.signin(form.email, form.password);
        if (resp.needsOnboarding && resp.onboardingToken) {
          window.location.href = `/providers/setup?token=${resp.onboardingToken}`;
        } else {
          window.location.href = '/';
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : t('auth.errors.generic');
      setApiError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Show a success banner when redirected from signup (/auth/signin?registered=1).
  const justRegistered = !isSignUp && new URLSearchParams(window.location.search).get('registered') === '1';

  if (success) {
    return (
      <div className="text-center py-8">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          {t('auth.signup.successTitle')}
        </h2>
        <p className="text-gray-600">
          {t('auth.signup.successMessage')}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Page heading */}
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        {isSignUp ? t('auth.signUpTitle') : t('auth.signInTitle')}
      </h1>
      <p className="text-gray-500 text-sm mb-8">
        {isSignUp ? t('auth.signUpSubtitle') : t('auth.signInSubtitle')}
      </p>

      {/* Registration success banner (redirected from signup) */}
      {justRegistered && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
          {t('auth.signup.successTitle')}
        </div>
      )}

      {/* Full Name (signup only) */}
      {isSignUp && (
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1.5">
            {t('auth.fullName')}
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            value={form.fullName}
            onChange={handleChange}
            className={`w-full px-4 py-2.5 rounded-lg border ${
              errors.fullName ? 'border-red-500 focus-visible:ring-red-500' : 'border-gray-300 focus-visible:ring-primary'
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:border-transparent transition-colors duration-200`}
            placeholder={t('auth.fullNamePlaceholder')}
          />
          {errors.fullName && <p className="mt-1 text-sm text-red-600">{errors.fullName}</p>}
        </div>
      )}

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
          {t('auth.emailLabel')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={handleChange}
          className={`w-full px-4 py-2.5 rounded-lg border ${
            errors.email ? 'border-red-500 focus-visible:ring-red-500' : 'border-gray-300 focus-visible:ring-primary'
          } focus-visible:outline-none focus-visible:ring-2 focus-visible:border-transparent transition-colors duration-200`}
          placeholder={t('auth.emailPlaceholder')}
        />
        {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
      </div>

      {/* Password */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
          {t('auth.passwordLabel')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          value={form.password}
          onChange={handleChange}
          className={`w-full px-4 py-2.5 rounded-lg border ${
            errors.password ? 'border-red-500 focus-visible:ring-red-500' : 'border-gray-300 focus-visible:ring-primary'
          } focus-visible:outline-none focus-visible:ring-2 focus-visible:border-transparent transition-colors duration-200`}
          placeholder={isSignUp ? t('auth.passwordMinHint') : '••••••••'}
        />
        {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
      </div>

      {/* Confirm Password (signup only) */}
      {isSignUp && (
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
            {t('auth.confirmPassword')}
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={handleChange}
            className={`w-full px-4 py-2.5 rounded-lg border ${
              errors.confirmPassword ? 'border-red-500 focus-visible:ring-red-500' : 'border-gray-300 focus-visible:ring-primary'
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:border-transparent transition-colors duration-200`}
            placeholder="••••••••"
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
          )}
        </div>
      )}

      {/* API Error */}
      {apiError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {apiError}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full btn-primary py-3 text-base disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {t('auth.loading')}
          </span>
        ) : isSignUp ? (
          t('auth.signUpCta')
        ) : (
          t('auth.signInCta')
        )}
      </button>

      {/* Switch link */}
      <p className="text-center text-sm text-gray-600">
        {isSignUp ? (
          <>
            {t('auth.haveAccountCta')}{' '}
            <a href="/auth/signin" className="text-primary-dark font-semibold hover:underline">
              {t('auth.signInCta')}
            </a>
          </>
        ) : (
          <>
            {t('auth.noAccountCta')}{' '}
            <a href="/auth/signup" className="text-primary-dark font-semibold hover:underline">
              {t('auth.signUpCta')}
            </a>
          </>
        )}
      </p>
    </form>
  );
}
