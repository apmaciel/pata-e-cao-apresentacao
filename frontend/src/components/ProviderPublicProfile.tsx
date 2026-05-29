import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import '../i18n.config';
import { providers, authReady, type ProviderDetail } from '../services/api';
import { API_URL } from '../utils/config';
import { serviceLabel } from '../utils/adminHelpers';
import { FiArrowLeft, FiMapPin, FiLink, FiCheck, FiX, FiEdit2, FiLinkedin, FiInstagram, FiGlobe, FiMail, FiMessageCircle, FiCheckCircle, FiTrash2, FiAlertTriangle } from 'react-icons/fi';
import ProviderProfileEdit from './ProviderProfileEdit';

const SOCIAL_PLATFORMS: { key: string; icon: typeof FiLinkedin }[] = [
  { key: 'linkedin', icon: FiLinkedin },
  { key: 'instagram', icon: FiInstagram },
  { key: 'facebook', icon: FiGlobe },
  { key: 'twitter', icon: FiGlobe },
  { key: 'website', icon: FiGlobe },
];

export default function ProviderPublicProfile() {
  const { t } = useTranslation();
  const providerId = new URLSearchParams(window.location.search).get('id') || '';
  const [provider, setProvider] = useState<ProviderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwn, setIsOwn] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);

  // Delete account state.
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Close contact popover on outside click + ESC.
  useEffect(() => {
    if (!contactOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!contactRef.current?.contains(e.target as Node)) setContactOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContactOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [contactOpen]);

  useEffect(() => {
    let cancelled = false;
    authReady().then(async (u) => {
      if (cancelled) return;

      try {
        let p: ProviderDetail;
        if (providerId) {
          p = await providers.get(providerId);
        } else if (u) {
          p = await providers.me();
          setIsOwn(true);
        } else {
          if (!cancelled) {
            setError(t('providerProfile.loginRequired'));
            setLoading(false);
          }
          return;
        }

        // Mark as own profile if the logged-in user matches.
        if (u && p.userId === u.id) setIsOwn(true);

        if (!cancelled) {
          setProvider(p);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('auth.errors.generic'));
          setLoading(false);
        }
      }
    });
    return () => { cancelled = true; };
  }, [providerId, t]);

  // Delete account handler.
  async function handleDeleteAccount() {
    if (!deletePassword) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await providers.deleteMe(deletePassword);
      // Clear session and redirect to home.
      const { auth } = await import('../services/api');
      await auth.logout();
      window.location.href = '/';
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : t('providerProfile.deleteAccountError'));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-footer/60 font-medium">{t('providerProfile.loading')}</p>
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 px-4">
        <h2 className="font-display font-black text-xl text-footer mb-2">{t('providerProfile.notFound')}</h2>
        <p className="text-footer/60 mb-6">{error}</p>
        <a href="/" className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-display font-bold text-sm uppercase tracking-wide px-6 py-3 rounded-xl transition-colors">
          {t('providerProfile.backToHome')}
        </a>
      </div>
    );
  }

  // Edit mode for own profile.
  if (editing && provider) {
    return (
      <ProviderProfileEdit
        provider={provider}
        onSaved={(updated) => {
          setProvider(updated);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* Back link */}
      <a href="/providers" className="inline-flex items-center gap-2 text-footer/50 hover:text-footer text-sm mb-6 transition-colors">
        <FiArrowLeft className="w-4 h-4" />
        {t('providerProfile.backToSearch')}
      </a>

      {/* Profile header */}
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
        {/* Logo + Name header */}
        <div className="bg-gradient-to-r from-primary to-primary-dark px-6 sm:px-10 py-8">
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-white/30">
              {provider.logoImageId ? (
                <img src={`${API_URL}/api/images/${provider.logoImageId}`} alt={provider.businessName} className="w-full h-full object-cover" />
              ) : (
                <span className="font-display font-black text-3xl text-white">
                  {provider.businessName?.charAt(0)?.toUpperCase() || '?'}
                </span>
              )}
            </div>
            <div>
              <h1 className="font-display font-black text-2xl sm:text-3xl text-white mb-1">
                {provider.businessName}
              </h1>
              <div className="flex items-center gap-1 text-white/80 text-sm">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-white">
                  <FiCheckCircle className="w-3.5 h-3.5" />
                  {t('providers.verified')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Gallery */}
        {provider.galleryImages && provider.galleryImages.length > 0 && (
          <div className="px-6 sm:px-10 pt-6">
            <div className="flex gap-3 overflow-x-auto pb-2">
              {provider.galleryImages.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setLightbox(img.imageId)}
                  className="flex-shrink-0 w-32 h-24 rounded-xl overflow-hidden bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-transform hover:scale-105"
                >
                  <img
                    src={`${API_URL}/api/images/${img.imageId}`}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Profile body */}
        <div className="px-6 py-8 sm:px-10 space-y-6">
          {/* Description */}
          {provider.bio && (
            <div>
              <h3 className="font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-2">
                {t('providerProfile.about')}
              </h3>
              <p className="text-footer/80 text-sm leading-relaxed whitespace-pre-line">{provider.bio}</p>
            </div>
          )}

          {/* Location */}
          {provider.location && (
            <div className="flex items-start gap-2">
              <FiMapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <span className="text-footer/80 text-sm">{provider.location}</span>
            </div>
          )}

          {/* Services */}
          {provider.services && provider.services.length > 0 && (
            <div>
              <h3 className="font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-2">
                {t('providerProfile.services')}
              </h3>
              <div className="flex flex-wrap gap-2">
                {provider.services.map((s: string) => (
                  <span key={s} className="px-3 py-1.5 rounded-full bg-primary/10 text-primary-dark text-xs font-bold uppercase tracking-wide">
                    {t(serviceLabel(s))}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Service preferences */}
          <div>
            <h3 className="font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-2">
              {t('providerProfile.accepts')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {provider.acceptsDogs && (
                <span className="px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-bold uppercase tracking-wide">🐕 {t('providerProfile.dogs')}</span>
              )}
              {provider.acceptsCats && (
                <span className="px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-bold uppercase tracking-wide">🐈 {t('providerProfile.cats')}</span>
              )}
              {provider.acceptsNeutered && (
                <span className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wide">{t('providerProfile.neutered')}</span>
              )}
              {provider.acceptsIntact && (
                <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-bold uppercase tracking-wide">{t('providerProfile.intact')}</span>
              )}
              {!provider.acceptsDogs && !provider.acceptsCats && !provider.acceptsNeutered && !provider.acceptsIntact && (
                <span className="text-footer/40 text-xs">{t('providerProfile.noPreferences')}</span>
              )}
            </div>
          </div>

          {/* Social links */}
          {provider.socialLinks && Object.keys(provider.socialLinks).length > 0 && (
            <div>
              <h3 className="font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-3">
                {t('providerProfile.socialLinks')}
              </h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(provider.socialLinks).map(([key, url]) => {
                  if (!url) return null;
                  const platform = SOCIAL_PLATFORMS.find((p) => p.key === key);
                  const Icon = platform?.icon || FiGlobe;
                  return (
                    <a
                      key={key}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary-dark text-xs font-bold uppercase tracking-wide hover:bg-primary/20 transition-colors"
                    >
                      <Icon className="w-4 h-4" />
                      {key}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Contact — Get in touch popover */}
          {(provider.email || provider.phone || provider.whatsapp) && (
            <div className="relative" ref={contactRef}>
              <button
                type="button"
                onClick={() => setContactOpen((v) => !v)}
                className="w-full bg-primary text-white rounded-xl px-4 py-3 text-sm font-display font-bold uppercase tracking-wide hover:bg-primary-dark transition-colors"
              >
                {t('providerProfile.getInTouch')}
              </button>
              {contactOpen && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
                  <div className="p-2 space-y-1">
                    {provider.email && (
                      <a
                        href={`mailto:${provider.email}`}
                        className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors text-footer text-sm font-medium"
                      >
                        <FiMail className="w-5 h-5 text-primary flex-shrink-0" />
                        <span className="truncate">{provider.email}</span>
                      </a>
                    )}
                    {(provider.phone || provider.whatsapp) && (
                      <a
                        href={`https://wa.me/${(provider.phone || provider.whatsapp || '').replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-green-50 transition-colors text-footer text-sm font-medium"
                      >
                        <FiMessageCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                        <span>{provider.phone || provider.whatsapp}</span>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Share profile */}
          <div>
            <h3 className="font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-3">
              {t('providerProfile.share')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {/* WhatsApp */}
              <a
                href={`https://wa.me/?text=${encodeURIComponent(t('providerProfile.shareMessage', { name: provider.businessName, url: `${window.location.origin}/providers/detail?id=${provider.id}` }))}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-50 text-green-700 text-xs font-bold uppercase tracking-wide hover:bg-green-100 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                WhatsApp
              </a>
              {/* Facebook */}
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}/providers/detail?id=${provider.id}`)}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wide hover:bg-blue-100 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Facebook
              </a>
              {/* Twitter/X */}
              <a
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(`${window.location.origin}/providers/detail?id=${provider.id}`)}&text=${encodeURIComponent(t('providerProfile.shareMessage', { name: provider.businessName, url: '' }))}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold uppercase tracking-wide hover:bg-gray-200 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                X
              </a>
              {/* Telegram */}
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(`${window.location.origin}/providers/detail?id=${provider.id}`)}&text=${encodeURIComponent(t('providerProfile.shareMessage', { name: provider.businessName, url: '' }))}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-50 text-sky-700 text-xs font-bold uppercase tracking-wide hover:bg-sky-100 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                Telegram
              </a>
              {/* Copy link */}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/providers/detail?id=${provider.id}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cream-tan/50 text-footer/70 text-xs font-bold uppercase tracking-wide hover:bg-cream-tan transition-colors"
              >
                {copied ? <FiCheck className="w-4 h-4 text-green-600" /> : <FiLink className="w-4 h-4" />}
                {copied ? t('providerProfile.copied') : t('providerProfile.copyLink')}
              </button>
            </div>
          </div>

          {/* Own profile — edit button (only after onboarding is complete) */}
          {isOwn && !editing && provider.onboardingCompletedAt && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="w-full bg-primary text-white rounded-xl px-4 py-3 text-sm font-display font-bold uppercase tracking-wide hover:bg-primary-dark transition-colors flex items-center justify-center gap-2"
            >
              <FiEdit2 className="w-4 h-4" />
              {t('providerProfile.editProfile')}
            </button>
          )}

          {/* Own profile — delete account button (only after onboarding is complete) */}
          {isOwn && !editing && provider.onboardingCompletedAt && (
            <div className="pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => { setShowDeleteModal(true); setDeletePassword(''); setDeleteError(''); }}
                className="w-full border-2 border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm font-display font-bold uppercase tracking-wide hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
              >
                <FiTrash2 className="w-4 h-4" />
                {t('providerProfile.deleteAccount')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete account confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4" onClick={() => setShowDeleteModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <FiAlertTriangle className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="font-display font-black text-xl text-footer mb-2">
                {t('providerProfile.deleteAccount')}
              </h3>
              <p className="text-sm text-footer/60">
                {t('providerProfile.deleteAccountDescription')}
              </p>
            </div>

            {deleteError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 mb-4">
                {deleteError}
              </div>
            )}

            <label className="block text-sm font-medium text-footer/70 mb-2">
              {t('providerProfile.deleteAccountConfirm')}
            </label>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder={t('providerProfile.deleteAccountPlaceholder')}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-footer placeholder-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:border-transparent text-sm mb-6"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && deletePassword && !deleting) {
                  handleDeleteAccount();
                }
              }}
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-footer/70 text-sm font-display font-bold uppercase tracking-wide hover:bg-gray-50 transition-colors"
              >
                {t('providerProfile.deleteAccountCancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={!deletePassword || deleting}
                className="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white text-sm font-display font-bold uppercase tracking-wide hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  t('providerProfile.deleteAccountButton')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Fechar"
          >
            <FiX className="w-6 h-6" />
          </button>
          <img
            src={`${API_URL}/api/images/${lightbox}`}
            alt=""
            className="max-w-full max-h-[90vh] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
