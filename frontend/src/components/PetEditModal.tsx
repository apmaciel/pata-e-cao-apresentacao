import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { pets, type Pet, type PetHealthRecord, type UpdatePetData, type UpdateHealthData } from '../services/api';
import { FiX, FiCheck } from 'react-icons/fi';

type EditTab = 'info' | 'health';

interface Vaccination {
  id: number;
  name: string;
  dateAdministered: string;
  expiresAt: string;
}

let vaccinationId = 0;
function nextVaccinationId(): number {
  return ++vaccinationId;
}

interface PetEditModalProps {
  pet: Pet;
  open: boolean;
  onClose: () => void;
  onSaved: (pet: Pet) => void;
}

interface EditForm {
  name: string;
  breed: string;
  color: string;
  weightKg: string;
  heightCm: string;
  size: 'small' | 'medium' | 'large';
}

interface HealthForm {
  allergies: string;
  medications: string;
  isNeutered: string;
  isSensitive: string;
  vaccinations: Vaccination[];
  behaviorNotes: string;
  specialNeeds: string;
  vetName: string;
  vetPhone: string;
  vetEmail: string;
}

interface FieldErrors {
  name?: string;
  [key: string]: string | undefined;
}

const SIZE_OPTIONS = ['small', 'medium', 'large'] as const;

const inputClass = (hasError: boolean) =>
  `w-full px-4 py-3 rounded-xl bg-white text-gray-900 border text-sm ${
    hasError ? 'border-red-400 ring-1 ring-red-200' : 'border-gray-200'
  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent transition-shadow`;

const labelClass = 'block font-display font-bold text-xs uppercase tracking-wider text-footer/80 mb-1.5';

const readonlyClass = 'w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 text-sm';

export default function PetEditModal({ pet, open, onClose, onSaved }: PetEditModalProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<EditTab>('info');
  const [form, setForm] = useState<EditForm>({
    name: '', breed: '', color: '', weightKg: '', heightCm: '', size: 'medium',
  });
  const [healthForm, setHealthForm] = useState<HealthForm>({
    allergies: '', medications: '', isNeutered: '', isSensitive: '', vaccinations: [], behaviorNotes: '', specialNeeds: '',
    vetName: '', vetPhone: '', vetEmail: '',
  });
  const [healthLoading, setHealthLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Populate form + fetch health when modal opens.
  useEffect(() => {
    if (open && pet) {
      setTab('info');
      setForm({
        name: pet.name || '',
        breed: pet.breed || '',
        color: pet.color || '',
        weightKg: pet.weightKg != null ? String(pet.weightKg) : '',
        heightCm: pet.heightCm != null ? String(pet.heightCm) : '',
        size: pet.size || 'medium',
      });
      setHealthForm({ allergies: '', medications: '', isNeutered: '', isSensitive: '', vaccinations: [], behaviorNotes: '', specialNeeds: '', vetName: '', vetPhone: '', vetEmail: '' });
      setErrors({});
      setApiError(null);
      setLoading(false);

      // Fetch health record.
      setHealthLoading(true);
      pets.getHealth(pet.id)
        .then((h: PetHealthRecord) => {
          let parsedVaccinations: Vaccination[] = [];
          try {
            const raw = h.vaccinations;
            if (Array.isArray(raw)) {
              parsedVaccinations = raw.map((v: Record<string, unknown>) => ({
                id: nextVaccinationId(),
                name: typeof v.name === 'string' ? v.name : '',
                dateAdministered: typeof v.dateAdministered === 'string' ? v.dateAdministered : '',
                expiresAt: typeof v.expiresAt === 'string' ? v.expiresAt : '',
              }));
            }
          } catch { /* keep empty */ }

          setHealthForm({
            allergies: (h.allergies || []).join(', '),
            medications: (h.medications || []).join(', '),
            isNeutered: h.isNeutered === true ? 'yes' : h.isNeutered === false ? 'no' : '',
            isSensitive: h.isSensitive === true ? 'yes' : h.isSensitive === false ? 'no' : '',
            vaccinations: parsedVaccinations,
            behaviorNotes: h.behaviorNotes || '',
            specialNeeds: h.specialNeeds || '',
            vetName: h.vetName || '',
            vetPhone: h.vetPhone || '',
            vetEmail: h.vetEmail || '',
          });
        })
        .catch(() => { /* keep defaults */ })
        .finally(() => setHealthLoading(false));
    }
  }, [open, pet]);

  // Escape key + body scroll lock.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => firstFieldRef.current?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  if (!open || !pet) return null;

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (tab === 'info' && !form.name.trim()) errs.name = t('pets.errors.nameRequired');
    return errs;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleHealthChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setHealthForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddVaccination = () => {
    setHealthForm((prev) => ({
      ...prev,
      vaccinations: [...prev.vaccinations, { id: nextVaccinationId(), name: '', dateAdministered: '', expiresAt: '' }],
    }));
  };

  const handleRemoveVaccination = (id: number) => {
    setHealthForm((prev) => ({
      ...prev,
      vaccinations: prev.vaccinations.filter((v) => v.id !== id),
    }));
  };

  const handleVaccinationChange = (id: number, field: keyof Omit<Vaccination, 'id'>, value: string) => {
    setHealthForm((prev) => ({
      ...prev,
      vaccinations: prev.vaccinations.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    }));
  };

  const computeAge = (bd: string): number | undefined => {
    if (!bd) return undefined;
    const birth = new Date(bd);
    if (isNaN(birth.getTime())) return undefined;
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) years--;
    return Math.max(0, years);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (tab === 'info') {
      const errs = validate();
      if (Object.keys(errs).length > 0) { setErrors(errs); return; }
      setLoading(true);
      try {
        const data: UpdatePetData = {
          name: form.name.trim(),
          breed: form.breed.trim() || undefined,
          color: form.color.trim() || undefined,
          weightKg: form.weightKg ? parseFloat(form.weightKg) : undefined,
          heightCm: form.heightCm ? parseFloat(form.heightCm) : undefined,
          size: form.size,
        };
        const updated = await pets.update(pet.id, data);
        onSaved(updated);
        onClose();
      } catch (err: unknown) {
        setApiError(err instanceof Error ? err.message : t('auth.errors.generic'));
      } finally {
        setLoading(false);
      }
    } else {
      // Health tab — save health data.
      setLoading(true);
      try {
        const vaccinations = healthForm.vaccinations
          .filter((v) => v.name.trim())
          .map(({ name, dateAdministered, expiresAt }) => ({ name: name.trim(), dateAdministered: dateAdministered || undefined, expiresAt: expiresAt || undefined }));

        const healthData: UpdateHealthData = {
          allergies: healthForm.allergies.split(',').map(s => s.trim()).filter(Boolean),
          medications: healthForm.medications.split(',').map(s => s.trim()).filter(Boolean),
          vaccinations: vaccinations.length ? vaccinations : undefined,
          isNeutered: healthForm.isNeutered === 'yes' ? true : healthForm.isNeutered === 'no' ? false : undefined,
          isSensitive: healthForm.isSensitive === 'yes' ? true : healthForm.isSensitive === 'no' ? false : undefined,
          behaviorNotes: healthForm.behaviorNotes.trim() || undefined,
          specialNeeds: healthForm.specialNeeds.trim() || undefined,
          vetName: healthForm.vetName.trim() || undefined,
          vetPhone: healthForm.vetPhone.trim() || undefined,
          vetEmail: healthForm.vetEmail.trim() || undefined,
        };
        await pets.updateHealth(pet.id, healthData);
        onClose();
      } catch (err: unknown) {
        setApiError(err instanceof Error ? err.message : t('auth.errors.generic'));
      } finally {
        setLoading(false);
      }
    }
  };

  const titleId = 'pet-edit-modal-title';
  const age = pet.birthDate ? computeAge(pet.birthDate) : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-lg mx-4 my-8 bg-cream rounded-2xl shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('auth.close')}
          className="absolute top-3 right-3 p-2 rounded-full text-primary-dark hover:bg-black/5 transition-colors z-10"
        >
          <FiX className="w-5 h-5" />
        </button>

        <div className="px-6 pt-8 pb-6 sm:px-10 sm:pt-10 sm:pb-8">
          <h2 id={titleId} className="font-display font-black text-2xl sm:text-3xl text-center text-footer tracking-wide uppercase mb-6">
            {t('pets.editTitle')}
          </h2>

          {/* Tabs */}
          <div className="flex gap-1 mb-5 p-1 bg-cream-tan/30 rounded-xl" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'info'}
              onClick={() => { setTab('info'); setErrors({}); setApiError(null); }}
              className={`flex-1 py-2.5 px-3 rounded-lg font-display font-bold text-xs uppercase tracking-wide transition-all ${
                tab === 'info' ? 'bg-primary text-white shadow-sm' : 'text-footer/60 hover:text-footer'
              }`}
            >
              {t('pets.tabBasicInfo')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'health'}
              onClick={() => { setTab('health'); setErrors({}); setApiError(null); }}
              className={`flex-1 py-2.5 px-3 rounded-lg font-display font-bold text-xs uppercase tracking-wide transition-all ${
                tab === 'health' ? 'bg-primary text-white shadow-sm' : 'text-footer/60 hover:text-footer'
              }`}
            >
              {t('pets.tabHealth')}
            </button>
          </div>

          {/* Read-only fields (shown on both tabs) */}
          <div className="bg-cream-tan/20 rounded-2xl px-5 py-4 space-y-3 mb-5">
            <p className="font-display font-bold text-[11px] uppercase tracking-wider text-footer/50 text-center">
              {t('pets.readOnlyFields')}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={labelClass}>{t('pets.speciesLabel')}</span>
                <div className={readonlyClass}>{t(`pets.species.${pet.species}`)}</div>
              </div>
              <div>
                <span className={labelClass}>{t('pets.birthDateLabel')}</span>
                <div className={readonlyClass}>
                  {pet.birthDate
                    ? `${new Date(pet.birthDate).toLocaleDateString()}${age != null ? ` (${age} ${age === 1 ? t('pets.yearSingular') : t('pets.yearPlural')})` : ''}`
                    : '—'}
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {tab === 'info' ? (
              <>
                <div>
                  <label htmlFor="em-name" className={labelClass}>{t('pets.nameLabel')}</label>
                  <input ref={firstFieldRef} id="em-name" name="name" type="text" value={form.name} onChange={handleChange} className={inputClass(!!errors.name)} />
                  {errors.name && <p className="mt-1 text-xs text-red-700">{errors.name}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="em-breed" className={labelClass}>{t('pets.breedLabel')}</label>
                    <input id="em-breed" name="breed" type="text" value={form.breed} onChange={handleChange} className={inputClass(false)} />
                  </div>
                  <div>
                    <label htmlFor="em-color" className={labelClass}>{t('pets.colorLabel')}</label>
                    <input id="em-color" name="color" type="text" value={form.color} onChange={handleChange} className={inputClass(false)} />
                  </div>
                </div>
                <div>
                  <label htmlFor="em-size" className={labelClass}>{t('pets.sizeLabel')}</label>
                  <select id="em-size" name="size" value={form.size} onChange={handleChange} className={inputClass(false)}>
                    {SIZE_OPTIONS.map((s) => (<option key={s} value={s}>{t(`pets.size.${s}`)}</option>))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="em-weightKg" className={labelClass}>{t('pets.weightLabel')}</label>
                    <input id="em-weightKg" name="weightKg" type="number" step="0.1" min="0" value={form.weightKg} onChange={handleChange} className={inputClass(false)} />
                  </div>
                  <div>
                    <label htmlFor="em-heightCm" className={labelClass}>{t('pets.heightLabel')}</label>
                    <input id="em-heightCm" name="heightCm" type="number" step="0.1" min="0" value={form.heightCm} onChange={handleChange} className={inputClass(false)} />
                  </div>
                </div>
              </>
            ) : healthLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="em-allergies" className={labelClass}>{t('pets.allergiesLabel')}</label>
                    <input id="em-allergies" name="allergies" type="text" value={healthForm.allergies} onChange={handleHealthChange} placeholder={t('pets.allergiesHint')} className={inputClass(false)} />
                  </div>
                  <div>
                    <label htmlFor="em-medications" className={labelClass}>{t('pets.medicationsLabel')}</label>
                    <input id="em-medications" name="medications" type="text" value={healthForm.medications} onChange={handleHealthChange} placeholder={t('pets.medicationsHint')} className={inputClass(false)} />
                  </div>
                </div>
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
                        onClick={() => setHealthForm(p => ({ ...p, isNeutered: val }))}
                        className={`flex-1 py-2.5 px-3 rounded-lg font-display font-bold text-xs uppercase tracking-wide transition-all ${
                          healthForm.isNeutered === val
                            ? 'bg-primary text-white shadow-sm'
                            : 'bg-white text-footer/60 hover:text-footer border border-gray-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
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
                        onClick={() => setHealthForm(p => ({ ...p, isSensitive: val }))}
                        className={`flex-1 py-2.5 px-3 rounded-lg font-display font-bold text-xs uppercase tracking-wide transition-all ${
                          healthForm.isSensitive === val
                            ? 'bg-primary text-white shadow-sm'
                            : 'bg-white text-footer/60 hover:text-footer border border-gray-200'
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
                    {healthForm.vaccinations.map((v) => {
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

                <div>
                  <label htmlFor="em-behaviorNotes" className={labelClass}>{t('pets.behaviorNotesLabel')}</label>
                  <textarea id="em-behaviorNotes" name="behaviorNotes" rows={2} value={healthForm.behaviorNotes} onChange={handleHealthChange} className={inputClass(false)} />
                </div>
                <div>
                  <label htmlFor="em-specialNeeds" className={labelClass}>{t('pets.specialNeedsLabel')}</label>
                  <textarea id="em-specialNeeds" name="specialNeeds" rows={2} value={healthForm.specialNeeds} onChange={handleHealthChange} className={inputClass(false)} />
                </div>
                <fieldset className="bg-white/50 rounded-2xl border border-cream-tan/40 p-5 mt-2">
                  <legend className="font-display font-bold text-sm uppercase tracking-wide text-footer/60 px-2">
                    {t('pets.vetInfoLabel')}
                  </legend>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="em-vetName" className={labelClass}>{t('pets.vetNameLabel')}</label>
                      <input id="em-vetName" name="vetName" type="text" value={healthForm.vetName} onChange={handleHealthChange} className={inputClass(false)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="em-vetPhone" className={labelClass}>{t('pets.vetPhoneLabel')}</label>
                        <input id="em-vetPhone" name="vetPhone" type="tel" value={healthForm.vetPhone} onChange={handleHealthChange} className={inputClass(false)} />
                      </div>
                      <div>
                        <label htmlFor="em-vetEmail" className={labelClass}>{t('pets.vetEmailLabel')}</label>
                        <input id="em-vetEmail" name="vetEmail" type="email" value={healthForm.vetEmail} onChange={handleHealthChange} className={inputClass(false)} />
                      </div>
                    </div>
                  </div>
                </fieldset>
              </>
            )}

            {apiError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{apiError}</div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-white hover:bg-cream-tan/40 text-footer font-display font-bold text-sm uppercase tracking-wide py-3.5 rounded-xl border border-gray-200 transition-colors"
              >
                {t('pets.cancel')}
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
                {loading ? t('auth.loading') : tab === 'info' ? t('pets.saveChanges') : t('pets.saveHealth')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
