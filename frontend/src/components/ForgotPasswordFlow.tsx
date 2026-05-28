import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { auth } from '../services/api';
import '../i18n.config';

// 15s — long enough to comfortably copy the dev link before it auto-clears.
const DEV_LINK_TTL_MS = 15_000;

type Step = 'enter-email' | 'sent';

export default function ForgotPasswordFlow() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('enter-email');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const clearTimerRef = useRef<number | null>(null);

  // Auto-clear the dev link after the TTL so it doesn't linger on screen.
  useEffect(() => {
    if (!devLink) return;
    clearTimerRef.current = window.setTimeout(() => setDevLink(null), DEV_LINK_TTL_MS);
    return () => {
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    };
  }, [devLink]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t('auth.errors.emailInvalid'));
      return;
    }
    setLoading(true);
    try {
      const resp = await auth.requestPasswordReset(email);
      if (resp.devResetLink) setDevLink(resp.devResetLink);
      setStep('sent');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.errors.generic');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!devLink) return;
    try {
      await navigator.clipboard.writeText(devLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked in some contexts; fall back gracefully.
      setCopied(false);
    }
  };

  if (step === 'sent') {
    return (
      <div className="max-w-md mx-auto text-center">
        <h1 className="font-display font-black text-3xl sm:text-4xl text-footer uppercase tracking-wide mb-6">
          {t('forgotPassword.sentTitle')}
        </h1>
        <div className="bg-cream-tan/70 rounded-3xl px-6 py-8 sm:px-10 sm:py-10 space-y-6">
          <p className="font-display font-bold text-sm uppercase tracking-wide text-footer leading-relaxed">
            {t('forgotPassword.sentBody')}
          </p>

          {devLink && (
            <div
              role="status"
              aria-live="polite"
              className="bg-white/70 border border-primary/30 rounded-lg px-4 py-3 text-left space-y-2"
            >
              <p className="text-[11px] font-display font-bold uppercase tracking-wide text-primary-dark">
                {t('forgotPassword.devBanner')}
              </p>
              <code className="block break-all text-xs text-footer font-sans">{devLink}</code>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-footer/60">
                  {t('forgotPassword.devAutoClear', { seconds: DEV_LINK_TTL_MS / 1000 })}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="font-display font-bold text-[11px] uppercase tracking-wide text-primary hover:text-primary-dark underline"
                >
                  {copied ? t('forgotPassword.copied') : t('forgotPassword.copy')}
                </button>
              </div>
            </div>
          )}

          <a
            href="/"
            className="inline-block px-12 py-3 bg-primary hover:bg-primary-dark text-white font-display font-bold text-base uppercase tracking-wide rounded-lg transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream-tan"
          >
            {t('forgotPassword.continue')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto text-center">
      <h1 className="font-display font-black text-3xl sm:text-4xl text-footer uppercase tracking-wide mb-6">
        {t('forgotPassword.title')}
      </h1>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-cream-tan/70 rounded-3xl px-6 py-8 sm:px-10 sm:py-10 space-y-5 text-left"
      >
        <label
          htmlFor="fp-email"
          className="block font-display font-bold text-xs uppercase tracking-wide text-footer"
        >
          {t('forgotPassword.emailLabel')}:
        </label>
        <input
          id="fp-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`w-full px-3 py-2 rounded-md bg-white text-gray-900 border ${
            error ? 'border-red-500' : 'border-transparent'
          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
        />
        {error && <p className="text-xs text-red-700 pl-1">{error}</p>}

        <div className="flex justify-center pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-12 py-3 bg-primary hover:bg-primary-dark text-white font-display font-bold text-base uppercase tracking-wide rounded-lg transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream-tan"
          >
            {loading ? t('auth.loading') : t('forgotPassword.continue')}
          </button>
        </div>
      </form>
    </div>
  );
}
