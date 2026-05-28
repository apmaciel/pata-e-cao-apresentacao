import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import '../i18n.config';
import { providers, uploadImage, type ProviderDetail, type SocialLinks, type GalleryImage } from '../services/api';
import { API_URL } from '../utils/config';
import {
  FiCamera, FiEdit2, FiCheck, FiX, FiSave, FiArrowLeft,
  FiLinkedin, FiInstagram, FiGlobe, FiPlus, FiTrash2, FiAlertCircle,
} from 'react-icons/fi';

const SOCIAL_PLATFORMS: { key: string; icon: typeof FiLinkedin; placeholder: string; prefix: string }[] = [
  { key: 'linkedin', icon: FiLinkedin, placeholder: 'https://linkedin.com/in/...', prefix: '' },
  { key: 'instagram', icon: FiInstagram, placeholder: 'https://instagram.com/...', prefix: '' },
  { key: 'facebook', icon: FiGlobe, placeholder: 'https://facebook.com/...', prefix: '' },
  { key: 'twitter', icon: FiGlobe, placeholder: 'https://twitter.com/...', prefix: '' },
  { key: 'website', icon: FiGlobe, placeholder: 'https://...', prefix: '' },
];

const MAX_GALLERY = 15;

interface Props {
  provider: ProviderDetail;
  onSaved: (updated: ProviderDetail) => void;
  onCancel: () => void;
}

export default function ProviderProfileEdit({ provider, onSaved, onCancel }: Props) {
  const { t } = useTranslation();

  // Form state.
  const [businessName, setBusinessName] = useState(provider.businessName);
  const [bio, setBio] = useState(provider.bio || '');
  const [location, setLocation] = useState(provider.location || '');
  const [whatsapp, setWhatsapp] = useState(provider.whatsapp || '');
  const [acceptsDogs, setAcceptsDogs] = useState(provider.acceptsDogs ?? false);
  const [acceptsCats, setAcceptsCats] = useState(provider.acceptsCats ?? false);
  const [acceptsNeutered, setAcceptsNeutered] = useState(provider.acceptsNeutered ?? false);
  const [acceptsIntact, setAcceptsIntact] = useState(provider.acceptsIntact ?? false);
  const [formLogoId, setFormLogoId] = useState<string | undefined>(provider.logoImageId);
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(provider.socialLinks || {});
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>(provider.galleryImages || []);

  // UI state.
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Logo upload.
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadImage(file, 'provider');
      setFormLogoId(result.imageId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
    } finally {
      setUploading(false);
    }
  }

  // Gallery add.
  async function handleGalleryAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (galleryImages.length >= MAX_GALLERY) {
      setError(t('providerProfile.galleryFull', { max: MAX_GALLERY }));
      return;
    }
    setUploading(true);
    try {
      const result = await uploadImage(file, 'provider');
      const resp = await providers.addGalleryImage(result.imageId);
      setGalleryImages(resp.galleryImages);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
    } finally {
      setUploading(false);
    }
    // Reset input.
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  }

  // Gallery remove.
  async function handleGalleryRemove(imageId: string) {
    try {
      await providers.removeGalleryImage(imageId);
      setGalleryImages((prev) => prev.filter((g) => g.imageId !== imageId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
    }
  }

  // Social links.
  function updateSocialLink(key: string, value: string) {
    setSocialLinks((prev) => {
      const next = { ...prev };
      if (value.trim()) {
        next[key] = value.trim();
      } else {
        delete next[key];
      }
      return next;
    });
  }

  // Save.
  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const updated = await providers.update({
        businessName,
        bio: bio || undefined,
        location: location || undefined,
        logoImageId: formLogoId,
        whatsapp: whatsapp || undefined,
        acceptsDogs,
        acceptsCats,
        acceptsNeutered,
        acceptsIntact,
        socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
      });
      setSuccessMsg(t('providerProfile.saved'));
      onSaved(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.errors.generic');
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const businessChanged = businessName !== provider.businessName;
  const logoChanged = formLogoId !== provider.logoImageId;
  const servicesChanged =
    acceptsDogs !== (provider.acceptsDogs ?? false) ||
    acceptsCats !== (provider.acceptsCats ?? false) ||
    acceptsNeutered !== (provider.acceptsNeutered ?? false) ||
    acceptsIntact !== (provider.acceptsIntact ?? false);

  const initialChar = provider.businessName?.charAt(0)?.toUpperCase() || '?';

  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* Back link */}
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-2 text-footer/50 hover:text-footer text-sm mb-6 transition-colors"
      >
        <FiArrowLeft className="w-4 h-4" />
        {t('providerProfile.backToProfile')}
      </button>

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
        {/* Header banner */}
        <div className="bg-gradient-to-r from-primary to-primary-dark px-6 sm:px-10 py-8">
          <div className="flex items-center gap-5">
            {/* Logo */}
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-white/30">
                {formLogoId ? (
                  <img src={`${API_URL}/api/images/${formLogoId}`} alt={businessName} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display font-black text-3xl text-white">{initialChar}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white text-primary flex items-center justify-center shadow-md hover:bg-gray-50 transition-colors"
                aria-label={t('providerProfile.changeLogo')}
              >
                {uploading ? (
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <FiCamera className="w-4 h-4" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={handleLogoUpload}
              />
              {formLogoId && formLogoId !== provider.logoImageId && (
                <button
                  type="button"
                  onClick={() => setFormLogoId(undefined)}
                  className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                  aria-label={t('providerProfile.removeLogo')}
                >
                  <FiX className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full font-display font-black text-2xl sm:text-3xl bg-transparent border-b-2 border-white/30 text-white placeholder-white/50 focus:outline-none focus:border-white/70 pb-1"
                placeholder={t('providerProfile.businessNamePlaceholder')}
                maxLength={100}
              />
            </div>
          </div>
          {businessChanged && (
            <p className="mt-2 text-xs text-amber-300 flex items-center gap-1">
              <FiAlertCircle className="w-3 h-3" />
              {t('providerProfile.rateLimitNotice')}
            </p>
          )}
          {logoChanged && (
            <p className="mt-1 text-xs text-amber-300 flex items-center gap-1">
              <FiAlertCircle className="w-3 h-3" />
              {t('providerProfile.rateLimitNotice')}
            </p>
          )}
        </div>

        {/* Edit body */}
        <div className="px-6 py-8 sm:px-10 space-y-8">
          {/* Error / Success */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
              <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {successMsg && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700 flex items-center gap-2">
              <FiCheck className="w-4 h-4 flex-shrink-0" />
              {successMsg}
            </div>
          )}

          {/* Bio */}
          <div>
            <label className="block font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-2">
              {t('providerProfile.about')}
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              maxLength={1000}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-footer focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
              placeholder={t('providerProfile.bioPlaceholder')}
            />
            <p className="text-xs text-footer/40 mt-1 text-right">{bio.length}/1000</p>
          </div>

          {/* Location */}
          <div>
            <label className="block font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-2">
              {t('providerProfile.location')}
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={200}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-footer focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder={t('providerProfile.locationPlaceholder')}
            />
          </div>

          {/* WhatsApp */}
          <div>
            <label className="block font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-2">
              WhatsApp
            </label>
            <input
              type="text"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              maxLength={20}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-footer focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="(11) 99999-9999"
            />
          </div>

          {/* Service preferences */}
          <div>
            <label className="block font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-3">
              {t('providerProfile.servicePreferences')}
            </label>
            {servicesChanged && (
              <p className="mb-2 text-xs text-amber-600 flex items-center gap-1">
                <FiAlertCircle className="w-3 h-3" />
                {t('providerProfile.rateLimitNotice')}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'dogs', label: t('providerProfile.acceptsDogs'), value: acceptsDogs, setter: setAcceptsDogs },
                { key: 'cats', label: t('providerProfile.acceptsCats'), value: acceptsCats, setter: setAcceptsCats },
                { key: 'neutered', label: t('providerProfile.acceptsNeutered'), value: acceptsNeutered, setter: setAcceptsNeutered },
                { key: 'intact', label: t('providerProfile.acceptsIntact'), value: acceptsIntact, setter: setAcceptsIntact },
              ].map(({ key, label, value, setter }) => (
                <label
                  key={key}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors text-sm ${
                    value
                      ? 'bg-primary/5 border-primary text-primary font-medium'
                      : 'border-gray-200 text-footer/60 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => setter(e.target.checked)}
                    className="sr-only"
                  />
                  {value ? <FiCheck className="w-4 h-4 flex-shrink-0" /> : <div className="w-4 h-4 border-2 border-gray-300 rounded flex-shrink-0" />}
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Social links */}
          <div>
            <label className="block font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-3">
              {t('providerProfile.socialLinks')}
            </label>
            <div className="space-y-3">
              {SOCIAL_PLATFORMS.map(({ key, icon: Icon, placeholder }) => (
                <div key={key} className="flex items-center gap-3">
                  <Icon className="w-5 h-5 text-footer/40 flex-shrink-0" />
                  <input
                    type="url"
                    value={socialLinks[key] || ''}
                    onChange={(e) => updateSocialLink(key, e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-footer focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  {socialLinks[key] && (
                    <button
                      type="button"
                      onClick={() => updateSocialLink(key, '')}
                      className="p-1 text-gray-400 hover:text-red-500"
                      aria-label={t('providerProfile.removeLink')}
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Gallery */}
          <div>
            <label className="block font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-3">
              {t('providerProfile.gallery')} ({galleryImages.length}/{MAX_GALLERY})
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {galleryImages.map((img) => (
                <div key={img.imageId} className="relative group rounded-xl overflow-hidden bg-gray-100 aspect-[4/3]">
                  <img
                    src={`${API_URL}/api/images/${img.imageId}`}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    onClick={() => handleGalleryRemove(img.imageId)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                    aria-label={t('providerProfile.removeImage')}
                  >
                    <FiTrash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {galleryImages.length < MAX_GALLERY && (
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={uploading}
                  className="aspect-[4/3] rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-primary hover:text-primary transition-colors"
                  aria-label={t('providerProfile.addImage')}
                >
                  {uploading ? (
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <FiPlus className="w-6 h-6" />
                      <span className="text-xs">{t('providerProfile.addImage')}</span>
                    </>
                  )}
                </button>
              )}
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={handleGalleryAdd}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 px-6 rounded-xl border border-gray-200 font-display font-bold text-sm uppercase tracking-wide text-footer/60 hover:bg-gray-50 transition-colors"
            >
              {t('providerProfile.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !businessName.trim()}
              className="flex-1 py-3 px-6 rounded-xl bg-primary text-white font-display font-bold text-sm uppercase tracking-wide hover:bg-primary-dark disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <FiSave className="w-4 h-4" />
              )}
              {t('providerProfile.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
