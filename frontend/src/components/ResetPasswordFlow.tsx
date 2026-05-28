import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { auth } from '../services/api';
import { evaluatePassword } from '../utils/password';
import PasswordField from './PasswordField';
import '../i18n.config';

type Step = 'edit' | 'done';

export default function ResetPasswordFlow() {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('edit');

  useEffect(() => {
    // The recovery link is /auth/reset-password?token=<raw>. Read it on mount.
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token'));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError(t('resetPassword.errors.missingToken'));
      return;
    }
    const strength = evaluatePassword(password);
    if (!strength.valid) {
      setError(t('resetPassword.errors.passwordWeak'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.errors.passwordsMismatch'));
      return;
    }
    setLoading(true);
    try {
      await auth.confirmPasswordReset(token, password);
      setStep('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.errors.generic');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <div className="max-w-md mx-auto text-center">
        <h1 className="font-display font-black text-3xl sm:text-4xl text-footer uppercase tracking-wide mb-6">
          {t('resetPassword.doneTitle')}
        </h1>
        <div className="bg-cream-tan/70 rounded-3xl px-6 py-8 sm:px-10 sm:py-10 space-y-6">
          <p className="font-display font-bold text-sm uppercase tracking-wide text-footer">
            {t('resetPassword.doneBody')}
          </p>
          <a
            href="/"
            className="inline-block px-12 py-3 bg-primary hover:bg-primary-dark text-white font-display font-bold text-base uppercase tracking-wide rounded-lg transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream-tan"
          >
            {t('resetPassword.backToLogin')}
          </a>
        </div>
      </div>
    );
  }

  const fieldClass = (hasError?: boolean) =>
    `w-full px-3 py-2 rounded-md bg-white text-gray-900 border ${
      hasError ? 'border-red-500' : 'border-transparent'
    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`;

  return (
    <div className="max-w-md mx-auto text-center">
      <h1 className="font-display font-black text-3xl sm:text-4xl text-footer uppercase tracking-wide mb-6">
        {t('resetPassword.title')}
      </h1>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-cream-tan/70 rounded-3xl px-6 py-8 sm:px-10 sm:py-10 space-y-5 text-left"
      >
        <div>
          <label
            htmlFor="rp-password"
            className="block font-display font-bold text-xs uppercase tracking-wide text-footer mb-2"
          >
            {t('resetPassword.newPassword')}:
          </label>
          <PasswordField
            name="password"
            value={password}
            onChange={setPassword}
            placeholder=""
            autoComplete="new-password"
            className={fieldClass(false)}
            showStrength
          />
        </div>

        <div>
          <label
            htmlFor="rp-confirm"
            className="block font-display font-bold text-xs uppercase tracking-wide text-footer mb-2"
          >
            {t('resetPassword.confirmPassword')}:
          </label>
          <PasswordField
            name="confirm"
            value={confirm}
            onChange={setConfirm}
            placeholder=""
            autoComplete="new-password"
            className={fieldClass(false)}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-center pt-2">
          <button
            type="submit"
            disabled={loading || !token}
            className="px-12 py-3 bg-primary hover:bg-primary-dark text-white font-display font-bold text-base uppercase tracking-wide rounded-lg transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream-tan"
          >
            {loading ? t('auth.loading') : t('resetPassword.submit')}
          </button>
        </div>

        {!token && (
          <p className="text-xs text-red-700 text-center">
            {t('resetPassword.errors.missingToken')}
          </p>
        )}
      </form>
    </div>
  );
}
