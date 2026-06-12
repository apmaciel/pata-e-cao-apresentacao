import { useEffect, useState, useMemo, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import '../i18n.config';
import { providerOnboarding, uploadImage, type OnboardingCompletePayload } from '../services/api';
import { evaluatePassword } from '../utils/password';
import { formatPhone } from '../utils/validation';
import { FiArrowLeft, FiArrowRight, FiCamera, FiCheck, FiX, FiPlus, FiTrash2 } from 'react-icons/fi';

type Step = 1 | 2 | 3 | 4 | 5;

interface FieldErrors {
  [key: string]: string | undefined;
}

interface GallerySlot {
  file: File | null;
  imageId: string;
  previewUrl: string;
}

const inputClass = (hasError: boolean) =>
  `w-full px-4 py-3 rounded-xl bg-white text-gray-900 border text-sm ${
    hasError ? 'border-red-400 ring-1 ring-red-200' : 'border-gray-200'
  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent transition-shadow`;

const labelClass = 'block font-display font-bold text-xs uppercase tracking-wider text-footer/80 mb-1.5';

const STEP_LABELS: Record<Step, string> = {
  1: 'step1Title',
  2: 'step2Title',
  3: 'step3Title',
  4: 'step4Title',
  5: 'step5Title',
};

export default function ProviderOnboardingForm() {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(null);
  const [needsCredentials, setNeedsCredentials] = useState(false);
  const [initialBusinessName, setInitialBusinessName] = useState('');
  const [initialEmail, setInitialEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [validating, setValidating] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string>('');

  const [step, setStep] = useState<Step>(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Step 1: Credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 2: Visual Profile
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarImageId, setAvatarImageId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [gallerySlots, setGallerySlots] = useState<GallerySlot[]>([]);

  // Step 3: Service Preferences
  const [acceptsDogs, setAcceptsDogs] = useState(false);
  const [acceptsCats, setAcceptsCats] = useState(false);
  const [acceptsNeutered, setAcceptsNeutered] = useState(false);
  const [acceptsIntact, setAcceptsIntact] = useState(false);

  // Step 4: About Business
  const [description, setDescription] = useState('');
  const [locationText, setLocationText] = useState('');

  // Step 5: Contact
  const [whatsapp, setWhatsapp] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  // Password strength (Step 1)
  const passwordStrength = useMemo(
    () => (password ? evaluatePassword(password) : null),
    [password],
  );

  const strengthLabel = (() => {
    if (!passwordStrength) return '';
    if (passwordStrength.valid) return t('password.strengthStrong');
    if (passwordStrength.score >= 2) return t('password.strengthMedium');
    return t('password.strengthWeak');
  })();

  const strengthBarColor = (() => {
    if (!passwordStrength) return 'bg-gray-200';
    if (passwordStrength.valid) return 'bg-primary';
    if (passwordStrength.score >= 2) return 'bg-yellow-400';
    return 'bg-red-400';
  })();

  // WhatsApp formatting (Step 5)
  const handleWhatsappChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWhatsapp(formatPhone(e.target.value));
  };

  // ── Token validation on mount ──────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    if (!tokenParam) {
      setTokenError(t('providerOnboarding.errors.noToken'));
      setValidating(false);
      return;
    }
    setToken(tokenParam);
    providerOnboarding.validate(tokenParam).then((result) => {
      setNeedsCredentials(result.needsCredentials);
      if (result.provider.id) setProviderId(result.provider.id);
      if (result.provider.companyName) setCompanyName(result.provider.companyName);
      if (result.provider.businessName) {
        setBusinessName(result.provider.businessName);
        setInitialBusinessName(result.provider.businessName);
      }
      if (result.provider.email) {
        setEmail(result.provider.email);
        setContactEmail(result.provider.email);
        setInitialEmail(result.provider.email);
      }
      setValidating(false);
      if (!result.needsCredentials) setStep(2);
    }).catch((err) => {
      setTokenError(err.message || t('providerOnboarding.errors.invalidToken'));
      setValidating(false);
    });
  }, [t]);

  // ── Validation ─────────────────────────────────────────────────────────
  function validateStep1(): FieldErrors {
    const errs: FieldErrors = {};
    if (!email.trim()) errs.email = t('providerOnboarding.errors.emailRequired');
    if (!password) {
      errs.password = t('providerOnboarding.errors.passwordRequired');
    } else if (password.length < 10) {
      errs.password = t('providerOnboarding.errors.passwordWeak');
    }
    if (password && password !== confirmPassword) errs.confirmPassword = t('providerOnboarding.errors.passwordsMismatch');
    return errs;
  }

  function validateStep2(): FieldErrors {
    const errs: FieldErrors = {};
    if (!businessName.trim()) errs.businessName = t('providerOnboarding.errors.businessNameRequired');
    return errs;
  }

  function validateStep3(): FieldErrors {
    return {};
  }

  function validateStep4(): FieldErrors {
    const errs: FieldErrors = {};
    if (description.length > 1000) errs.description = t('providerOnboarding.errors.descriptionTooLong');
    return errs;
  }

  function validateStep5(): FieldErrors {
    const errs: FieldErrors = {};
    if (!whatsapp.trim()) errs.whatsapp = t('providerOnboarding.errors.whatsappRequired');
    if (!contactEmail.trim()) errs.contactEmail = t('providerOnboarding.errors.emailRequired');
    return errs;
  }

  function validateCurrentStep(): FieldErrors {
    switch (step) {
      case 1: return validateStep1();
      case 2: return validateStep2();
      case 3: return validateStep3();
      case 4: return validateStep4();
      case 5: return validateStep5();
    }
  }

  // ── Image upload helpers ───────────────────────────────────────────────
  async function uploadAvatarIfNeeded(): Promise<string | undefined> {
    if (avatarImageId) return avatarImageId;
    if (!avatarFile) return undefined;
    try {
      const result = await uploadImage(avatarFile, 'provider', token!);
      setAvatarImageId(result.imageId);
      return result.imageId;
    } catch {
      setApiError(t('providerOnboarding.errors.avatarUploadFailed'));
      return undefined;
    }
  }

  async function uploadGalleryIfNeeded(): Promise<string[]> {
    const ids: string[] = [];
    for (const slot of gallerySlots) {
      if (slot.imageId) {
        ids.push(slot.imageId);
      } else if (slot.file) {
        try {
          const result = await uploadImage(slot.file, 'provider', token!);
          ids.push(result.imageId);
        } catch {
          // ignora uploads com falha
        }
      }
    }
    return ids;
  }

  // ── Gallery slot management ────────────────────────────────────────────
  function addGallerySlot(file: File) {
    if (gallerySlots.length >= 15) return;
    const previewUrl = URL.createObjectURL(file);
    setGallerySlots((prev) => [...prev, { file, imageId: '', previewUrl }]);
  }

  function removeGallerySlot(index: number) {
    setGallerySlots((prev) => {
      const next = [...prev];
      if (next[index].previewUrl) URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
  }

  // ── Step navigation ────────────────────────────────────────────────────
  function handleNext(e: FormEvent) {
    e.preventDefault();
    setApiError(null);
    const errs = validateCurrentStep();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setStep((s) => Math.min(5, s + 1) as Step);
  }

  function handleBack() {
    setApiError(null);
    setErrors({});
    setStep((s) => Math.max(needsCredentials ? 1 : 2, s - 1) as Step);
  }

  // ── Final submit ───────────────────────────────────────────────────────
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);
    const errs = validateCurrentStep();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      const avatarId = await uploadAvatarIfNeeded();
      if (avatarFile && !avatarId) {
        setLoading(false);
        return;
      }

      const galleryIds = await uploadGalleryIfNeeded();

      const payload: OnboardingCompletePayload = {
        avatarImageId: avatarId || undefined,
        businessName: businessName.trim(),
        galleryImageIds: galleryIds.length > 0 ? galleryIds : undefined,
        acceptsDogs,
        acceptsCats,
        acceptsNeutered,
        acceptsIntact,
        description: description.trim(),
        location: locationText.trim(),
        whatsapp: whatsapp.trim(),
        email: contactEmail.trim(),
      };

      await providerOnboarding.complete(token!, payload);
      setSuccess(true);
    } catch (err: any) {
      setApiError(err.message || t('providerOnboarding.errors.submitFailed'));
    } finally {
      setLoading(false);
    }
  }

  // ── Render: loading / validating state ─────────────────────────────────
  if (validating) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-footer/60 font-medium">{t('providerOnboarding.validating')}</p>
      </div>
    );
  }

  // ── Render: token error ────────────────────────────────────────────────
  if (tokenError) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 px-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <FiX className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="font-display font-black text-xl text-footer mb-2">
          {t('providerOnboarding.errorTitle')}
        </h2>
        <p className="text-footer/60 mb-6">{tokenError}</p>
        <a href="/" className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-display font-bold text-sm uppercase tracking-wide px-6 py-3 rounded-xl transition-colors">
          {t('providerOnboarding.backToHome')}
        </a>
      </div>
    );
  }

  // ── Render: success ────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 px-4">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <FiCheck className="w-10 h-10 text-primary" />
        </div>
        <h2 className="font-display font-black text-2xl text-footer mb-3">
          {t('providerOnboarding.successTitle')}
        </h2>
        <p className="text-footer/60 mb-8">{t('providerOnboarding.successMessage')}</p>
        <a href={`/providers/detail?id=${providerId}`} className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-display font-bold text-sm uppercase tracking-wide px-8 py-3.5 rounded-xl transition-colors">
          {t('providerOnboarding.successCta')}
        </a>
      </div>
    );
  }

  // ── Effective steps for step indicator ─────────────────────────────────
  const displaySteps: Step[] = needsCredentials ? [1, 2, 3, 4, 5] : [2, 3, 4, 5];

  // ── Render: form ───────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">
      {/* Page header */}
      <div className="text-center mb-8">
        <h1 className="font-display font-black text-2xl sm:text-3xl text-footer mb-2">
          {t('providerOnboarding.pageTitle')}
        </h1>
        <p className="text-footer/60">{t('providerOnboarding.pageSubtitle')}</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-0 mb-10">
        {displaySteps.map((s, idx) => (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-sm transition-all duration-300 ${
                  s < step
                    ? 'bg-primary text-white shadow-md shadow-primary/25'
                    : s === step
                      ? 'bg-primary text-white shadow-md shadow-primary/25 ring-4 ring-primary/20'
                      : 'bg-cream-tan/50 text-footer/30'
                }`}
              >
                {s < step ? <FiCheck className="w-5 h-5" /> : s}
              </div>
              <span
                className={`mt-2 font-display font-bold text-[11px] uppercase tracking-wider whitespace-nowrap ${
                  s <= step ? 'text-footer' : 'text-footer/25'
                }`}
              >
                {t(`providerOnboarding.${STEP_LABELS[s]}`)}
              </span>
            </div>
            {idx < displaySteps.length - 1 && (
              <div className="w-12 sm:w-20 mx-1 mt-[-1.25rem]">
                <div
                  className={`h-0.5 rounded transition-colors duration-500 ${
                    step > s ? 'bg-primary' : 'bg-cream-tan/50'
                  }`}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Form card */}
      <div className="bg-cream rounded-3xl shadow-xl overflow-hidden">
        <div className="bg-primary/5 border-b border-cream-tan/30 px-6 sm:px-10 py-4">
          <p className="font-display font-bold text-xs uppercase tracking-wider text-footer/60">
            {t('providerOnboarding.step')} {step} {t('providerOnboarding.of')} {displaySteps.length} — {t(`providerOnboarding.${STEP_LABELS[step]}`)}
          </p>
        </div>

        <div className="px-6 py-6 sm:px-10 sm:py-8">
          <form onSubmit={step === 5 ? handleSubmit : handleNext} noValidate>
            {/* ── STEP 1: Credentials (conditional) ──────────────────────── */}
            {step === 1 && (
              <fieldset>
                <legend className="font-display font-bold text-sm uppercase tracking-wide text-footer mb-4">
                  {t('providerOnboarding.step1Description')}
                </legend>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="onb-email" className={labelClass}>{t('providerOnboarding.emailLabel')}</label>
                    <input id="onb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      readOnly={!!initialEmail} className={inputClass(!!errors.email) + (initialEmail ? ' bg-gray-100 text-gray-500' : '')} />
                    {initialEmail && <p className="mt-1 text-xs text-footer/40">{t('providerOnboarding.emailReadOnlyHint')}</p>}
                    {errors.email && <p className="mt-1 text-xs text-red-600 font-medium">{errors.email}</p>}
                  </div>
                  <div>
                    <label htmlFor="onb-password" className={labelClass}>{t('providerOnboarding.passwordLabel')}</label>
                    <input id="onb-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass(!!errors.password)} />
                    {password && (
                      <div className="mt-1.5">
                        <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${strengthBarColor}`}
                            style={{ width: `${((passwordStrength?.score ?? 0) / 4) * 100}%` }}
                          />
                        </div>
                        <p className={`text-xs mt-0.5 font-medium ${passwordStrength?.valid ? 'text-primary' : passwordStrength && passwordStrength.score >= 2 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {strengthLabel}
                        </p>
                      </div>
                    )}
                    {errors.password && <p className="mt-1 text-xs text-red-600 font-medium">{errors.password}</p>}
                  </div>
                  <div>
                    <label htmlFor="onb-confirm" className={labelClass}>{t('providerOnboarding.confirmPasswordLabel')}</label>
                    <input id="onb-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass(!!errors.confirmPassword)} />
                    {errors.confirmPassword && <p className="mt-1 text-xs text-red-600 font-medium">{errors.confirmPassword}</p>}
                  </div>
                </div>
              </fieldset>
            )}

            {/* ── STEP 2: Visual Profile ────────────────────────────────── */}
            {step === 2 && (
              <fieldset>
                <legend className="font-display font-bold text-sm uppercase tracking-wide text-footer mb-4">
                  {t('providerOnboarding.step2Description')}
                </legend>
                <div className="space-y-6">
                  {/* Avatar */}
                  <div>
                    <span className={labelClass}>{t('providerOnboarding.avatarLabel')}</span>
                    <label className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-white border cursor-pointer hover:border-primary/50 transition-colors ${avatarFile || avatarImageId ? 'border-primary/50 bg-primary-light/10' : 'border-gray-200'}`}>
                      <FiCamera className={`w-5 h-5 ${avatarFile || avatarImageId ? 'text-primary' : 'text-gray-400'}`} />
                      <span className={`text-sm truncate flex-1 ${avatarFile || avatarImageId ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                        {avatarFile ? avatarFile.name : avatarImageId ? t('providerOnboarding.avatarUploaded') : t('providerOnboarding.uploadAvatar')}
                      </span>
                      <input type="file" accept="image/jpeg,image/png" onChange={(e) => setAvatarFile(e.target.files?.[0] || null)} className="hidden" />
                    </label>
                  </div>

                  {/* Company name (read-only reference) */}
                  {companyName && (
                    <div>
                      <span className={labelClass}>{t('providerOnboarding.companyNameLabel')}</span>
                      <div className="px-4 py-3 rounded-xl bg-gray-100 border border-gray-200 text-sm text-gray-500">
                        {companyName}
                      </div>
                      <p className="mt-1 text-xs text-footer/40">{t('providerOnboarding.companyNameHint')}</p>
                    </div>
                  )}

                  {/* Business name */}
                  <div>
                    <label htmlFor="onb-bizname" className={labelClass}>{t('providerOnboarding.businessNameLabel')}</label>
                    <input id="onb-bizname" type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                      placeholder={initialBusinessName || ''} className={inputClass(!!errors.businessName)} />
                    {errors.businessName && <p className="mt-1 text-xs text-red-600 font-medium">{errors.businessName}</p>}
                  </div>

                  {/* Gallery */}
                  <div>
                    <span className={labelClass}>{t('providerOnboarding.galleryLabel')}</span>
                    <div className="grid grid-cols-3 gap-3">
                      {gallerySlots.map((slot, i) => (
                        <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-white border border-gray-200 group">
                          <img src={slot.previewUrl} alt="" className="w-full h-full object-cover" />
                          <button type="button" onClick={() => removeGallerySlot(i)}
                            className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <FiTrash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {gallerySlots.length < 15 && (
                        <label className="aspect-square rounded-xl bg-white border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                          <FiPlus className="w-6 h-6 text-gray-400" />
                          <span className="text-[10px] text-gray-400 mt-1">{t('providerOnboarding.addGalleryPhoto')}</span>
                          <input type="file" accept="image/jpeg,image/png" onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) addGallerySlot(f);
                          }} className="hidden" />
                        </label>
                      )}
                    </div>
                    {gallerySlots.length >= 15 && (
                      <p className="mt-1 text-xs text-amber-600 font-medium">{t('providerOnboarding.galleryMaxError')}</p>
                    )}
                  </div>
                </div>
              </fieldset>
            )}

            {/* ── STEP 3: Service Preferences ────────────────────────────── */}
            {step === 3 && (
              <fieldset>
                <legend className="font-display font-bold text-sm uppercase tracking-wide text-footer mb-4">
                  {t('providerOnboarding.step3Description')}
                </legend>
                <div className="space-y-4">
                  {([
                    ['acceptsDogs', acceptsDogs, setAcceptsDogs, t('providerOnboarding.acceptsDogsLabel')],
                    ['acceptsCats', acceptsCats, setAcceptsCats, t('providerOnboarding.acceptsCatsLabel')],
                    ['acceptsNeutered', acceptsNeutered, setAcceptsNeutered, t('providerOnboarding.acceptsNeuteredLabel')],
                    ['acceptsIntact', acceptsIntact, setAcceptsIntact, t('providerOnboarding.acceptsIntactLabel')],
                  ] as const).map(([, value, setter, label]) => (
                    <div key={label}>
                      <span className={labelClass}>{label}</span>
                      <div className="flex gap-2 mt-1">
                        {[
                          [true, t('providerOnboarding.yes')],
                          [false, t('providerOnboarding.no')],
                        ].map(([val, display]) => (
                          <button
                            key={String(val)}
                            type="button"
                            onClick={() => setter(val as boolean)}
                            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wide transition-all duration-200 ${
                              value === val
                                ? 'bg-primary text-white shadow-md shadow-primary/25'
                                : 'bg-white border border-gray-200 text-gray-400 hover:border-gray-300'
                            }`}
                          >
                            {display as string}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>
            )}

            {/* ── STEP 4: About Business ─────────────────────────────────── */}
            {step === 4 && (
              <fieldset>
                <legend className="font-display font-bold text-sm uppercase tracking-wide text-footer mb-4">
                  {t('providerOnboarding.step4Description')}
                </legend>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="onb-desc" className={labelClass}>{t('providerOnboarding.descriptionLabel')}</label>
                    <textarea id="onb-desc" rows={5} value={description} onChange={(e) => setDescription(e.target.value)}
                      placeholder={t('providerOnboarding.descriptionPlaceholder')}
                      className={inputClass(!!errors.description) + ' resize-none'} />
                    <div className="flex justify-between mt-1">
                      {errors.description ? (
                        <p className="text-xs text-red-600 font-medium">{errors.description}</p>
                      ) : <span />}
                      <span className={`text-xs ${description.length > 1000 ? 'text-red-500 font-bold' : 'text-footer/50'}`}>
                        {description.length}/1000
                      </span>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="onb-location" className={labelClass}>{t('providerOnboarding.locationLabel')}</label>
                    <input id="onb-location" type="text" value={locationText} onChange={(e) => setLocationText(e.target.value)}
                      placeholder={t('providerOnboarding.locationPlaceholder')} className={inputClass(false)} />
                  </div>
                </div>
              </fieldset>
            )}

            {/* ── STEP 5: Contact ─────────────────────────────────────────── */}
            {step === 5 && (
              <fieldset>
                <legend className="font-display font-bold text-sm uppercase tracking-wide text-footer mb-4">
                  {t('providerOnboarding.step5Description')}
                </legend>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="onb-whatsapp" className={labelClass}>{t('providerOnboarding.whatsappLabel')}</label>
                    <input id="onb-whatsapp" type="tel" value={whatsapp} onChange={handleWhatsappChange}
                      placeholder={t('providerOnboarding.whatsappPlaceholder')} className={inputClass(!!errors.whatsapp)} />
                    {errors.whatsapp && <p className="mt-1 text-xs text-red-600 font-medium">{errors.whatsapp}</p>}
                  </div>
                  <div>
                    <label htmlFor="onb-contact-email" className={labelClass}>{t('providerOnboarding.emailLabel')}</label>
                    <input id="onb-contact-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
                      readOnly={!!initialEmail} className={inputClass(!!errors.contactEmail) + (initialEmail ? ' bg-gray-100 text-gray-500' : '')} />
                    {errors.contactEmail && <p className="mt-1 text-xs text-red-600 font-medium">{errors.contactEmail}</p>}
                  </div>
                </div>
              </fieldset>
            )}

            {/* ── API Error ──────────────────────────────────────────────── */}
            {apiError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mt-6">
                {apiError}
              </div>
            )}

            {/* ── Navigation buttons ──────────────────────────────────────── */}
            <div className={`flex gap-3 ${step === 1 ? 'mt-0' : 'mt-8'}`}>
              {step > (needsCredentials ? 1 : 2) && (
                <button type="button" onClick={handleBack}
                  className="inline-flex items-center justify-center gap-2 bg-white border border-gray-200 text-footer/70 hover:text-footer hover:border-gray-300 font-display font-bold text-sm uppercase tracking-wide py-3.5 px-6 rounded-xl transition-colors">
                  <FiArrowLeft className="w-4 h-4" />
                  {t('providerOnboarding.back')}
                </button>
              )}
              <button type="submit" disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-display font-bold text-sm uppercase tracking-wide py-3.5 rounded-xl transition-colors">
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : step === 5 ? (
                  t('providerOnboarding.submit')
                ) : (
                  <>
                    {t('providerOnboarding.next')}
                    <FiArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
