import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import '../i18n.config';
import { auth, authReady, uploadImage, type UserProfile, type SocialLinks } from '../services/api';
import { API_URL } from '../utils/config';
import {
  FiCamera, FiEdit2, FiCheck, FiX, FiMail, FiPhone, FiMapPin,
  FiLinkedin, FiInstagram, FiGlobe, FiSave, FiArrowLeft,
} from 'react-icons/fi';

const SOCIAL_PLATFORMS: { key: string; icon: typeof FiLinkedin; placeholder: string; prefix: string }[] = [
  { key: 'linkedin', icon: FiLinkedin, placeholder: 'https://linkedin.com/in/...', prefix: '' },
  { key: 'instagram', icon: FiInstagram, placeholder: 'https://instagram.com/...', prefix: '' },
  { key: 'facebook', icon: FiGlobe, placeholder: 'https://facebook.com/...', prefix: '' },
  { key: 'twitter', icon: FiGlobe, placeholder: 'https://twitter.com/...', prefix: '' },
  { key: 'website', icon: FiGlobe, placeholder: 'https://...', prefix: '' },
];

export default function UserProfile() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [formPhone, setFormPhone] = useState('');
  const [formBio, setFormBio] = useState('');
  const [formSocialLinks, setFormSocialLinks] = useState<SocialLinks>({});
  const [formCpf, setFormCpf] = useState('');
  const [formAvatarId, setFormAvatarId] = useState<string | undefined>(undefined);
  const [successMsg, setSuccessMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    authReady().then(async (u) => {
      if (cancelled) return;
      if (!u) {
        setError(t('auth.errors.generic'));
        setLoading(false);
        return;
      }
      try {
        const p = await auth.getProfile();
        if (!cancelled) {
          setProfile(p);
          syncFormState(p);
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
  }, [t]);

  function syncFormState(p: UserProfile) {
    setFormPhone(p.phone || '');
    setFormBio(p.bio || '');
    setFormSocialLinks(p.socialLinks || {});
    setFormCpf(p.cpf || '');
    setFormAvatarId(p.avatarImageId);
  }

  function startEditing() {
    if (profile) syncFormState(profile);
    setEditing(true);
    setSuccessMsg('');
  }

  function cancelEditing() {
    if (profile) syncFormState(profile);
    setEditing(false);
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadImage(file, 'avatar');
      setFormAvatarId(result.imageId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await auth.updateProfile({
        phone: formPhone || undefined,
        bio: formBio || undefined,
        socialLinks: Object.keys(formSocialLinks).length > 0 ? formSocialLinks : undefined,
        avatarImageId: formAvatarId || undefined,
        cpf: formCpf || undefined,
      });
      setProfile(updated);
      syncFormState(updated);
      setEditing(false);
      setSuccessMsg(t('userProfile.saved'));
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
    } finally {
      setSaving(false);
    }
  }

  function updateSocialLink(key: string, value: string) {
    setFormSocialLinks((prev) => {
      const next = { ...prev };
      if (value.trim()) {
        next[key] = value.trim();
      } else {
        delete next[key];
      }
      return next;
    });
  }

  // ── Loading / Error states ──────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-footer/60 font-medium">{t('userProfile.loading')}</p>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 px-4">
        <h2 className="font-display font-black text-xl text-footer mb-2">{t('userProfile.error')}</h2>
        <p className="text-footer/60 mb-6">{error}</p>
        <a href="/" className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-display font-bold text-sm uppercase tracking-wide px-6 py-3 rounded-xl transition-colors">
          {t('userProfile.backToHome')}
        </a>
      </div>
    );
  }

  if (!profile) return null;

  const userInitial = profile.fullName?.charAt(0)?.toUpperCase() || profile.email?.charAt(0)?.toUpperCase() || '?';

  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* Back link */}
      <a href="/" className="inline-flex items-center gap-2 text-footer/50 hover:text-footer text-sm mb-6 transition-colors">
        <FiArrowLeft className="w-4 h-4" />
        {t('userProfile.backToHome')}
      </a>

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
        {/* Header banner */}
        <div className="bg-gradient-to-r from-primary to-primary-dark px-6 sm:px-10 py-8">
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-white/30">
                {formAvatarId || profile.avatarImageId ? (
                  <img
                    src={`${API_URL}/api/images/${formAvatarId || profile.avatarImageId}`}
                    alt={profile.fullName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="font-display font-black text-3xl text-white">{userInitial}</span>
                )}
              </div>
              {editing && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white text-primary flex items-center justify-center shadow-md hover:bg-gray-50 transition-colors"
                    aria-label={t('userProfile.changeAvatar')}
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
                    onChange={handleAvatarUpload}
                  />
                  {formAvatarId && formAvatarId !== profile.avatarImageId && (
                    <button
                      type="button"
                      onClick={() => setFormAvatarId(undefined)}
                      className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                      aria-label={t('userProfile.removeAvatar')}
                    >
                      <FiX className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-black text-2xl sm:text-3xl text-white mb-1 truncate">
                {profile.fullName || profile.email}
              </h1>
              <p className="text-white/70 text-sm truncate">{profile.email}</p>
            </div>
            {!editing && (
              <button
                type="button"
                onClick={startEditing}
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/20 text-white text-sm font-bold hover:bg-white/30 transition-colors"
              >
                <FiEdit2 className="w-4 h-4" />
                {t('userProfile.edit')}
              </button>
            )}
          </div>
        </div>

        {/* Profile body */}
        <div className="px-6 py-8 sm:px-10 space-y-6">
          {/* Success message */}
          {successMsg && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium text-center">
              {successMsg}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-medium text-center">
              {error}
            </div>
          )}

          {editing ? (
            /* ── Edit Mode ────────────────────────────────────── */
            <>
              {/* Phone */}
              <div>
                <label className="font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-2 block">
                  {t('userProfile.phone')}
                </label>
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-colors">
                  <FiPhone className="w-4 h-4 text-footer/40 flex-shrink-0" />
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder={t('userProfile.phonePlaceholder')}
                    className="flex-1 bg-transparent text-sm text-footer outline-none placeholder:text-footer/30"
                  />
                </div>
              </div>

              {/* CPF */}
              <div>
                <label className="font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-2 block">
                  CPF
                </label>
                <input
                  type="text"
                  value={formCpf}
                  onChange={(e) => setFormCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm text-footer outline-none border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-footer/30"
                />
              </div>

              {/* Bio */}
              <div>
                <label className="font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-2 block">
                  {t('userProfile.bio')}
                </label>
                <textarea
                  value={formBio}
                  onChange={(e) => setFormBio(e.target.value)}
                  rows={4}
                  placeholder={t('userProfile.bioPlaceholder')}
                  className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm text-footer outline-none border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-footer/30 resize-none"
                />
              </div>

              {/* Social links */}
              <div>
                <label className="font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-3 block">
                  {t('userProfile.socialLinks')}
                </label>
                <div className="space-y-2">
                  {SOCIAL_PLATFORMS.map(({ key, icon: Icon, placeholder }) => {
                    const value = formSocialLinks[key] || '';
                    return (
                      <div key={key} className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-200 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-colors">
                        <Icon className="w-4 h-4 text-footer/40 flex-shrink-0" />
                        <span className="text-xs text-footer/40 flex-shrink-0 w-20 capitalize">{key}</span>
                        <input
                          type="url"
                          value={value}
                          onChange={(e) => updateSocialLink(key, e.target.value)}
                          placeholder={placeholder}
                          className="flex-1 bg-transparent text-sm text-footer outline-none placeholder:text-footer/30"
                        />
                        {value && (
                          <button
                            type="button"
                            onClick={() => updateSocialLink(key, '')}
                            className="text-footer/30 hover:text-red-500 transition-colors"
                          >
                            <FiX className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark disabled:opacity-60 text-white font-display font-bold text-sm uppercase tracking-wide px-6 py-3 rounded-xl transition-colors"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <FiSave className="w-4 h-4" />
                  )}
                  {t('userProfile.save')}
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving}
                  className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-footer/70 font-display font-bold text-sm uppercase tracking-wide px-6 py-3 rounded-xl transition-colors"
                >
                  <FiX className="w-4 h-4" />
                  {t('userProfile.cancel')}
                </button>
              </div>
            </>
          ) : (
            /* ── View Mode ────────────────────────────────────── */
            <>
              {/* Contact info */}
              {(profile.phone || profile.email) && (
                <div className="bg-cream rounded-2xl p-6">
                  <h3 className="font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-3">
                    {t('userProfile.contactInfo')}
                  </h3>
                  <div className="space-y-3">
                    {profile.email && (
                      <div className="flex items-center gap-2">
                        <FiMail className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-footer/80 text-sm">{profile.email}</span>
                      </div>
                    )}
                    {profile.phone && (
                      <div className="flex items-center gap-2">
                        <FiPhone className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-footer/80 text-sm">{profile.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Bio */}
              {profile.bio && (
                <div>
                  <h3 className="font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-2">
                    {t('userProfile.about')}
                  </h3>
                  <p className="text-footer/80 text-sm leading-relaxed whitespace-pre-line">{profile.bio}</p>
                </div>
              )}

              {/* Social links */}
              {profile.socialLinks && Object.keys(profile.socialLinks).length > 0 && (
                <div>
                  <h3 className="font-display font-bold text-xs uppercase tracking-wider text-footer/60 mb-3">
                    {t('userProfile.socialLinks')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(profile.socialLinks).map(([key, url]) => {
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

              {/* Empty state hint */}
              {!profile.bio && !profile.phone && (!profile.socialLinks || Object.keys(profile.socialLinks).length === 0) && (
                <div className="text-center py-8">
                  <p className="text-footer/40 text-sm mb-4">{t('userProfile.emptyHint')}</p>
                  <button
                    type="button"
                    onClick={startEditing}
                    className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-display font-bold text-sm uppercase tracking-wide px-6 py-3 rounded-xl transition-colors"
                  >
                    <FiEdit2 className="w-4 h-4" />
                    {t('userProfile.completeProfile')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
