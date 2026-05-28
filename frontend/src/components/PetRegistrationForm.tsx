import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { pets, authReady, uploadImage, petImages, type CreatePetData, type UpdatePetData } from '../services/api';
import { FiArrowLeft, FiArrowRight, FiCamera, FiCheck, FiHeart, FiPlus } from 'react-icons/fi';

type Step = 1 | 2;

interface Vaccination {
  id: number; // local key for React lists; stripped before submit
  name: string;
  dateAdministered: string;
  expiresAt: string;
}

let vaccinationId = 0;
function nextVaccinationId(): number {
  return ++vaccinationId;
}

interface FormState {
  name: string;
  species: string;
  breed: string;
  birthDate: string;
  color: string;
  weightKg: string;
  heightCm: string;
  size: 'small' | 'medium' | 'large';
  // Health fields
  allergies: string;
  medications: string;
  isNeutered: string; // 'yes' | 'no' | ''
  isSensitive: string; // 'yes' | 'no' | ''
  vaccinations: Vaccination[];
  behaviorNotes: string;
  specialNeeds: string;
  vetName: string;
  vetPhone: string;
  vetEmail: string;
}

interface FieldErrors {
  name?: string;
  species?: string;
  [key: string]: string | undefined;
}

const EMPTY_FORM: FormState = {
  name: '',
  species: '',
  breed: '',
  birthDate: '',
  color: '',
  weightKg: '',
  heightCm: '',
  size: 'medium',
  allergies: '',
  medications: '',
  isNeutered: '',
  isSensitive: '',
  vaccinations: [],
  behaviorNotes: '',
  specialNeeds: '',
  vetName: '',
  vetPhone: '',
  vetEmail: '',
};

const SPECIES_OPTIONS = ['dog', 'cat', 'bird', 'fish', 'rodent', 'reptile', 'other'] as const;
const SIZE_OPTIONS = ['small', 'medium', 'large'] as const;

// Compute age in full years from a YYYY-MM-DD birth date.
function computeAge(birthDate: string): number | undefined {
  if (!birthDate) return undefined;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) {
    years--;
  }
  return Math.max(0, years);
}

const inputClass = (hasError: boolean) =>
  `w-full px-4 py-3 rounded-xl bg-white text-gray-900 border text-sm ${
    hasError ? 'border-red-400 ring-1 ring-red-200' : 'border-gray-200'
  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent transition-shadow`;

const labelClass = 'block font-display font-bold text-xs uppercase tracking-wider text-footer/80 mb-1.5';

export default function PetRegistrationForm() {
  const { t } = useTranslation();
  const [authChecked, setAuthChecked] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [createdPet, setCreatedPet] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authReady().then((u) => {
      if (cancelled) return;
      if (!u) window.location.href = '/';
      else setAuthChecked(true);
    });
    return () => { cancelled = true; };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleNeutered = (val: string) => {
    setForm((prev) => ({ ...prev, isNeutered: val }));
  };

  const handleSensitive = (val: string) => {
    setForm((prev) => ({ ...prev, isSensitive: val }));
  };

  const handleAddVaccination = () => {
    setForm((prev) => ({
      ...prev,
      vaccinations: [...prev.vaccinations, { id: nextVaccinationId(), name: '', dateAdministered: '', expiresAt: '' }],
    }));
  };

  const handleRemoveVaccination = (id: number) => {
    setForm((prev) => ({
      ...prev,
      vaccinations: prev.vaccinations.filter((v) => v.id !== id),
    }));
  };

  const handleVaccinationChange = (id: number, field: keyof Omit<Vaccination, 'id'>, value: string) => {
    setForm((prev) => ({
      ...prev,
      vaccinations: prev.vaccinations.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    }));
  };

  const validateStep1 = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (!form.name.trim()) errs.name = t('pets.errors.nameRequired');
    if (!form.species) errs.species = t('pets.errors.speciesRequired');
    return errs;
  };

  const handleStep1 = (e: FormEvent) => {
    e.preventDefault();
    setApiError(null);
    const errs = validateStep1();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setApiError(null);
    setLoading(true);
    try {
      const petData: CreatePetData = {
        name: form.name.trim(),
        species: form.species,
        breed: form.breed.trim() || undefined,
        birthDate: form.birthDate || undefined,
        color: form.color.trim() || undefined,
        weightKg: form.weightKg ? parseFloat(form.weightKg) : undefined,
        heightCm: form.heightCm ? parseFloat(form.heightCm) : undefined,
        size: form.size,
        ageYears: computeAge(form.birthDate),
      };
      const pet = await pets.create(petData);

      const allergies = form.allergies
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const medications = form.medications
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const vaccinations = form.vaccinations
        .filter((v) => v.name.trim())
        .map(({ name, dateAdministered, expiresAt }) => ({ name: name.trim(), dateAdministered: dateAdministered || undefined, expiresAt: expiresAt || undefined }));

      await pets.updateHealth(pet.id, {
        allergies,
        medications,
        vaccinations: vaccinations.length ? vaccinations : undefined,
        specialNeeds: form.specialNeeds.trim() || undefined,
        isNeutered: form.isNeutered === 'yes' ? true : form.isNeutered === 'no' ? false : undefined,
        isSensitive: form.isSensitive === 'yes' ? true : form.isSensitive === 'no' ? false : undefined,
        behaviorNotes: form.behaviorNotes.trim() || undefined,
        vetName: form.vetName.trim() || undefined,
        vetPhone: form.vetPhone.trim() || undefined,
        vetEmail: form.vetEmail.trim() || undefined,
      });

      // Upload profile photo if selected.
      if (photoFile) {
        try {
          const uploaded = await uploadImage(photoFile, 'pet');
          await petImages.add(pet.id, uploaded.imageId);
          await pets.update(pet.id, { photoImageId: uploaded.imageId } as UpdatePetData);
        } catch { /* photo upload is best-effort; don't block registration */ }
      }

      setCreatedPet(pet.name);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.errors.generic');
      setApiError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Auth check spinner ────────────────────────────────────────────────────────

  if (!authChecked) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-footer/50 font-display font-bold text-xs uppercase tracking-wider">
            {t('auth.loading')}
          </p>
        </div>
      </div>
    );
  }

  // ── Success state ─────────────────────────────────────────────────────────────

  if (createdPet) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-cream rounded-3xl shadow-xl p-8 sm:p-10 text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-5">
            <FiHeart className="w-10 h-10 text-primary" />
          </div>
          <h2 className="font-display font-black text-2xl sm:text-3xl text-footer uppercase tracking-wide mb-3">
            {t('pets.successTitle')}
          </h2>
          <p className="text-footer/60 text-sm leading-relaxed mb-8">
            {t('pets.successMessage', { name: createdPet })}
          </p>
          <div className="flex flex-col gap-3">
            <a
              href="/pets/add"
              className="inline-flex items-center justify-center gap-2 w-full bg-primary hover:bg-primary-dark text-white font-display font-bold text-sm uppercase tracking-wide py-3.5 rounded-xl transition-colors duration-200"
            >
              <FiPlus className="w-5 h-5" />
              {t('pets.addAnotherPet')}
            </a>
            <a
              href="/pets"
              className="inline-flex items-center justify-center gap-2 w-full bg-cream-tan/50 hover:bg-cream-tan/80 text-footer font-display font-bold text-sm uppercase tracking-wide py-3.5 rounded-xl transition-colors duration-200"
            >
              {t('pets.viewMyPets')}
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[70vh] px-4 py-8 sm:py-12">
      <div className="max-w-2xl mx-auto">
        {/* Page title */}
        <div className="text-center mb-8">
          <h1 className="font-display font-black text-3xl sm:text-4xl text-footer uppercase tracking-wide">
            {t('pets.registerTitle')}
          </h1>
          <p className="text-footer/50 text-sm mt-2 font-sans">
            {step === 1
              ? t('pets.stepAboutPetDescription')
              : t('pets.stepHealthDescription')}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-0 mb-10">
          {([1, 2] as Step[]).map((s) => (
            <div key={s} className="flex items-center">
              {/* Step circle */}
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
                  {s === 1 ? t('pets.stepAboutPet') : t('pets.stepHealth')}
                </span>
              </div>
              {/* Connector line */}
              {s < 2 && (
                <div className="w-16 sm:w-24 mx-2 mt-[-1.25rem]">
                  <div
                    className={`h-0.5 rounded transition-colors duration-500 ${
                      step > 1 ? 'bg-primary' : 'bg-cream-tan/50'
                    }`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Form card */}
        <div className="bg-cream rounded-3xl shadow-xl overflow-hidden">
          {/* Card header bar */}
          <div className="bg-primary/5 border-b border-cream-tan/30 px-6 sm:px-10 py-4">
            <p className="font-display font-bold text-xs uppercase tracking-wider text-footer/60">
              {step === 1
                ? `${t('pets.step')} 1 ${t('pets.of')} 2 — ${t('pets.stepAboutPet')}`
                : `${t('pets.step')} 2 ${t('pets.of')} 2 — ${t('pets.stepHealth')}`}
            </p>
          </div>

          <div className="px-6 py-6 sm:px-10 sm:py-8">
            {/* ── STEP 1: About the Pet ─────────────────────────────────── */}
            {step === 1 ? (
              <form onSubmit={handleStep1} noValidate>
                {/* Basic information section */}
                <fieldset className="mb-6">
                  <legend className="font-display font-bold text-sm uppercase tracking-wide text-footer mb-4">
                    {t('pets.sectionBasicInfo')}
                  </legend>
                  <div className="space-y-4">
                    {/* Name + Species row */}
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                      <div className="sm:col-span-3">
                        <label htmlFor="pet-name" className={labelClass}>{t('pets.nameLabel')}</label>
                        <input id="pet-name" name="name" type="text" value={form.name} onChange={handleChange} placeholder={t('pets.namePlaceholder')} className={inputClass(!!errors.name)} />
                        {errors.name && <p className="mt-1 text-xs text-red-600 font-medium">{errors.name}</p>}
                      </div>
                      <div className="sm:col-span-2">
                        <label htmlFor="pet-species" className={labelClass}>{t('pets.speciesLabel')}</label>
                        <select id="pet-species" name="species" value={form.species} onChange={handleChange} className={inputClass(!!errors.species)}>
                          <option value="">{t('pets.selectSpecies')}</option>
                          {SPECIES_OPTIONS.map((s) => (
                            <option key={s} value={s}>{t(`pets.species.${s}`)}</option>
                          ))}
                        </select>
                        {errors.species && <p className="mt-1 text-xs text-red-600 font-medium">{errors.species}</p>}
                      </div>
                    </div>

                    {/* Breed + Birth date row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="pet-breed" className={labelClass}>{t('pets.breedLabel')}</label>
                        <input id="pet-breed" name="breed" type="text" value={form.breed} onChange={handleChange} placeholder={t('pets.breedPlaceholder')} className={inputClass(false)} />
                      </div>
                      <div>
                        <label htmlFor="pet-birthDate" className={labelClass}>{t('pets.birthDateLabel')}</label>
                        <input id="pet-birthDate" name="birthDate" type="date" value={form.birthDate} onChange={handleChange} className={inputClass(false)} />
                      </div>
                    </div>
                  </div>
                </fieldset>

                {/* Physical traits section */}
                <fieldset className="mb-6">
                  <legend className="font-display font-bold text-sm uppercase tracking-wide text-footer mb-4">
                    {t('pets.sectionPhysicalTraits')}
                  </legend>
                  <div className="space-y-4">
                    {/* Color + Size */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="pet-color" className={labelClass}>{t('pets.colorLabel')}</label>
                        <input id="pet-color" name="color" type="text" value={form.color} onChange={handleChange} placeholder={t('pets.colorPlaceholder')} className={inputClass(false)} />
                      </div>
                      <div>
                        <label htmlFor="pet-size" className={labelClass}>{t('pets.sizeLabel')}</label>
                        <select id="pet-size" name="size" value={form.size} onChange={handleChange} className={inputClass(false)}>
                          {SIZE_OPTIONS.map((s) => (
                            <option key={s} value={s}>{t(`pets.size.${s}`)}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Weight + Height + Age row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="pet-weightKg" className={labelClass}>{t('pets.weightLabel')}</label>
                        <input id="pet-weightKg" name="weightKg" type="number" step="0.1" min="0" value={form.weightKg} onChange={handleChange} placeholder="0.0" className={inputClass(false)} />
                      </div>
                      <div>
                        <label htmlFor="pet-heightCm" className={labelClass}>{t('pets.heightLabel')}</label>
                        <input id="pet-heightCm" name="heightCm" type="number" step="0.1" min="0" value={form.heightCm} onChange={handleChange} placeholder="0.0" className={inputClass(false)} />
                      </div>
                      <div>
                        <label className={labelClass}>{t('pets.ageYearsLabel')}</label>
                        <div className={`flex items-center px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm ${form.birthDate ? 'text-gray-900' : 'text-gray-400'}`}>
                          {form.birthDate
                            ? `${computeAge(form.birthDate)} ${computeAge(form.birthDate) === 1 ? t('pets.yearSingular') : t('pets.yearPlural')}`
                            : t('pets.ageFromBirthDate')}
                        </div>
                      </div>
                    </div>
                  </div>
                </fieldset>

                {/* Profile photo (optional) */}
                <div>
                  <span className={labelClass}>{t('pets.photoLabel')}</span>
                  <label className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-gray-200 cursor-pointer hover:border-primary/50 transition-colors ${photoFile ? 'border-primary/50 bg-primary-light/10' : ''}`}>
                    <FiCamera className={`w-5 h-5 ${photoFile ? 'text-primary' : 'text-gray-400'}`} />
                    <span className={`text-sm truncate flex-1 ${photoFile ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                      {photoFile ? photoFile.name : t('pets.uploadPhoto')}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>

                {apiError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-6">
                    {apiError}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-display font-bold text-sm uppercase tracking-wide py-3.5 rounded-xl transition-colors duration-200"
                >
                  {t('pets.continueToHealth')}
                  <FiArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              /* ── STEP 2: Health & Safety ─────────────────────────────── */
              <form onSubmit={handleSubmit} noValidate>
                {/* Health section */}
                <fieldset className="mb-6">
                  <legend className="font-display font-bold text-sm uppercase tracking-wide text-footer mb-4">
                    {t('pets.sectionHealth')}
                  </legend>
                  <div className="space-y-4">
                    {/* Allergies + Medications row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="pet-allergies" className={labelClass}>{t('pets.allergiesLabel')}</label>
                        <input id="pet-allergies" name="allergies" type="text" value={form.allergies} onChange={handleChange} placeholder={t('pets.allergiesHint')} className={inputClass(false)} />
                      </div>
                      <div>
                        <label htmlFor="pet-medications" className={labelClass}>{t('pets.medicationsLabel')}</label>
                        <input id="pet-medications" name="medications" type="text" value={form.medications} onChange={handleChange} placeholder={t('pets.medicationsHint')} className={inputClass(false)} />
                      </div>
                    </div>

                    {/* Is neutered */}
                    <div>
                      <span className={labelClass}>{t('pets.isNeuteredLabel')}</span>
                      <div className="flex gap-2 mt-1">
                        {[
                          ['yes', t('pets.yes')],
                          ['no', t('pets.no')],
                          ['', t('pets.preferNotToSay')],
                        ].map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => handleNeutered(val)}
                            className={`flex-1 py-2.5 px-4 rounded-xl font-display font-bold text-xs uppercase tracking-wide transition-all duration-200 ${
                              form.isNeutered === val
                                ? 'bg-primary text-white shadow-md shadow-primary/20'
                                : 'bg-white text-footer/50 hover:text-footer hover:bg-white/80 border border-gray-200'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Health sensitivities */}
                    <div>
                      <span className={labelClass}>{t('pets.isSensitiveLabel')}</span>
                      <div className="flex gap-2 mt-1">
                        {[
                          ['yes', t('pets.yes')],
                          ['no', t('pets.no')],
                          ['', t('pets.preferNotToSay')],
                        ].map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => handleSensitive(val)}
                            className={`flex-1 py-2.5 px-4 rounded-xl font-display font-bold text-xs uppercase tracking-wide transition-all duration-200 ${
                              form.isSensitive === val
                                ? 'bg-primary text-white shadow-md shadow-primary/20'
                                : 'bg-white text-footer/50 hover:text-footer hover:bg-white/80 border border-gray-200'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Vaccinations */}
                    <div>
                      <span className={labelClass}>{t('pets.vaccinationsLabel')}</span>
                      <div className="space-y-2">
                        {form.vaccinations.map((v) => {
                          const expired = v.expiresAt && new Date(v.expiresAt) < new Date();
                          return (
                            <div key={v.id} className={`flex flex-col sm:flex-row gap-2 p-3 rounded-xl border ${expired ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
                              <input
                                type="text"
                                value={v.name}
                                onChange={(e) => handleVaccinationChange(v.id, 'name', e.target.value)}
                                placeholder={t('pets.vaccinationName')}
                                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              />
                              <input
                                type="date"
                                value={v.dateAdministered}
                                onChange={(e) => handleVaccinationChange(v.id, 'dateAdministered', e.target.value)}
                                title={t('pets.vaccinationDateAdministered')}
                                className="w-36 px-3 py-2 rounded-lg border border-gray-200 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              />
                              <input
                                type="date"
                                value={v.expiresAt}
                                onChange={(e) => handleVaccinationChange(v.id, 'expiresAt', e.target.value)}
                                title={t('pets.vaccinationExpiresAt')}
                                className="w-36 px-3 py-2 rounded-lg border border-gray-200 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveVaccination(v.id)}
                                aria-label={t('pets.removeVaccination')}
                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors self-end sm:self-center"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                              </button>
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          onClick={handleAddVaccination}
                          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary hover:text-primary-dark transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                          {t('pets.addVaccination')}
                        </button>
                      </div>
                    </div>

                    {/* Behavior notes */}
                    <div>
                      <label htmlFor="pet-behaviorNotes" className={labelClass}>{t('pets.behaviorNotesLabel')}</label>
                      <textarea id="pet-behaviorNotes" name="behaviorNotes" rows={2} value={form.behaviorNotes} onChange={handleChange} placeholder={t('pets.behaviorNotesPlaceholder')} className={inputClass(false)} />
                    </div>

                    {/* Special needs */}
                    <div>
                      <label htmlFor="pet-specialNeeds" className={labelClass}>{t('pets.specialNeedsLabel')}</label>
                      <textarea id="pet-specialNeeds" name="specialNeeds" rows={2} value={form.specialNeeds} onChange={handleChange} placeholder={t('pets.specialNeedsPlaceholder')} className={inputClass(false)} />
                    </div>
                  </div>
                </fieldset>

                {/* Vet info section */}
                <fieldset className="mb-6 bg-white/50 rounded-2xl border border-cream-tan/40 p-5">
                  <legend className="font-display font-bold text-sm uppercase tracking-wide text-footer/60 px-2">
                    {t('pets.vetInfoLabel')}
                  </legend>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="pet-vetName" className={labelClass}>{t('pets.vetNameLabel')}</label>
                      <input id="pet-vetName" name="vetName" type="text" value={form.vetName} onChange={handleChange} className={inputClass(false)} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="pet-vetPhone" className={labelClass}>{t('pets.vetPhoneLabel')}</label>
                        <input id="pet-vetPhone" name="vetPhone" type="tel" value={form.vetPhone} onChange={handleChange} className={inputClass(false)} />
                      </div>
                      <div>
                        <label htmlFor="pet-vetEmail" className={labelClass}>{t('pets.vetEmailLabel')}</label>
                        <input id="pet-vetEmail" name="vetEmail" type="email" value={form.vetEmail} onChange={handleChange} className={inputClass(false)} />
                      </div>
                    </div>
                  </div>
                </fieldset>

                {apiError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-6">
                    {apiError}
                  </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => { setStep(1); setApiError(null); }}
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-white hover:bg-cream-tan/40 text-footer font-display font-bold text-sm uppercase tracking-wide py-3.5 rounded-xl border border-gray-200 transition-colors duration-200"
                  >
                    <FiArrowLeft className="w-4 h-4" />
                    {t('pets.back')}
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-[2] inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-display font-bold text-sm uppercase tracking-wide py-3.5 rounded-xl transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <FiCheck className="w-5 h-5" />
                    )}
                    {loading ? t('auth.loading') : t('pets.savePet')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
