import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pets, type Pet } from '../services/api';
import { FiX, FiAlertTriangle } from 'react-icons/fi';

interface Props {
  pet: Pet | null;
  open: boolean;
  onClose: () => void;
}

export default function DeletePetModal({ pet, open, onClose }: Props) {
  const { t } = useTranslation();
  const [nameInput, setNameInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setNameInput('');
      setDateInput('');
      setError(null);
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => firstFieldRef.current?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open || !pet) return null;

  const expectedName = pet.name.trim().toLowerCase();
  const expectedDate = pet.birthDate
    ? new Date(pet.birthDate).toLocaleDateString()
    : '';

  const nameMatch = nameInput.trim().toLowerCase() === expectedName;
  const dateMatch = expectedDate ? dateInput.trim() === expectedDate : true;
  const canDelete = nameMatch && dateMatch && expectedName.length > 0;

  const handleDelete = async () => {
    if (!canDelete) return;
    setLoading(true);
    setError(null);
    try {
      await pets.delete(pet.id);
      window.location.href = '/pets';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
      setLoading(false);
    }
  };

  const titleId = 'delete-pet-modal-title';
  const labelClass = 'block font-display font-bold text-xs uppercase tracking-wider text-footer/80 mb-1.5';
  const inputClass = (match: boolean) =>
    `w-full px-4 py-3 rounded-xl border text-sm ${
      nameInput.length > 0
        ? match ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-800'
        : 'bg-white border-gray-200 text-gray-900'
    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent transition-all`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[110] flex items-start sm:items-center justify-center overflow-y-auto"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-md mx-4 my-8 bg-white rounded-2xl shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('auth.close')}
          className="absolute top-3 right-3 p-2 rounded-full text-gray-400 hover:text-gray-600 transition-colors z-10"
        >
          <FiX className="w-5 h-5" />
        </button>

        <div className="px-6 pt-8 pb-6 sm:px-10 sm:pt-10 sm:pb-8">
          {/* Warning icon */}
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FiAlertTriangle className="w-7 h-7 text-red-600" />
          </div>

          <h2 id={titleId} className="font-display font-black text-xl text-center text-footer uppercase tracking-wide mb-2">
            {t('pets.deleteTitle')}
          </h2>
          <p className="text-footer/50 text-sm text-center mb-6 font-sans leading-relaxed">
            {t('pets.deleteConfirmation', { name: pet.name })}
          </p>

          <div className="space-y-4">
            {/* Pet name confirmation */}
            <div>
              <label htmlFor="del-name" className={labelClass}>
                {t('pets.deleteTypeName')}
              </label>
              <input
                ref={firstFieldRef}
                id="del-name"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder={pet.name}
                className={inputClass(nameMatch)}
                autoComplete="off"
              />
            </div>

            {/* Birth date confirmation (only if pet has a birth date) */}
            {expectedDate && (
              <div>
                <label htmlFor="del-date" className={labelClass}>
                  {t('pets.deleteTypeBirthDate')}
                </label>
                <input
                  id="del-date"
                  type="text"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  placeholder={expectedDate}
                  className={inputClass(dateMatch)}
                  autoComplete="off"
                />
                <p className="mt-1 text-xs text-footer/40 font-sans">
                  {t('pets.deleteBirthDateHint', { date: expectedDate })}
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-display font-bold text-sm uppercase tracking-wide py-3.5 rounded-xl transition-colors"
              >
                {t('pets.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canDelete || loading}
                className="flex-[2] inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-display font-bold text-sm uppercase tracking-wide py-3.5 rounded-xl transition-colors duration-200 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : null}
                {loading ? t('auth.loading') : t('pets.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
