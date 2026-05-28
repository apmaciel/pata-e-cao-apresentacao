import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { pets, petImages, authReady, uploadImage, type Pet, type PetHealthRecord, type PetImage } from '../services/api';
import { API_URL } from '../utils/config';
import { FiArrowLeft, FiEdit2, FiCamera, FiMaximize2, FiStar, FiTrash2, FiX } from 'react-icons/fi';
import PetEditModal from './PetEditModal';
import DeletePetModal from './DeletePetModal';

function computeAge(birthDate: string): number | undefined {
  if (!birthDate) return undefined;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) years--;
  return Math.max(0, years);
}

export default function PetDetailPage() {
  const { t } = useTranslation();
  const petId = new URLSearchParams(window.location.search).get('petId') || '';
  const [pet, setPet] = useState<Pet | null>(null);
  const [health, setHealth] = useState<PetHealthRecord | null>(null);
  const [images, setImages] = useState<PetImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [p, imgs, h] = await Promise.all([
        pets.get(petId),
        petImages.list(petId).catch(() => [] as PetImage[]),
        pets.getHealth(petId).catch(() => null as PetHealthRecord | null),
      ]);
      setPet(p);
      setImages(imgs);
      setHealth(h);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [petId, t]);

  useEffect(() => {
    let cancelled = false;
    authReady().then((u) => {
      if (cancelled) return;
      if (!u) { window.location.href = '/'; return; }
      fetchData();
    });
    return () => { cancelled = true; };
  }, [fetchData]);

  const syncPhotoImageId = async (imageId: string) => {
    try { await pets.update(petId, { photoImageId: imageId }); } catch { /* best-effort */ }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadImage(file, 'pet');
      const img = await petImages.add(petId, uploaded.imageId);
      setImages((prev) => [...prev, img]);
      // Sync profile photo if this is the first image (auto-primary).
      if (img.isPrimary) await syncPhotoImageId(img.imageId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    try {
      await petImages.remove(petId, imageId);
      setImages((prev) => prev.filter((i) => i.imageId !== imageId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
    }
  };

  const handleSetPrimary = async (imageId: string) => {
    try {
      await petImages.setPrimary(petId, imageId);
      setImages((prev) =>
        prev.map((i) => ({ ...i, isPrimary: i.imageId === imageId })),
      );
      await syncPhotoImageId(imageId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
    }
  };

  const handleSaved = (updated: Pet) => {
    setPet(updated);
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-footer/50 font-display font-bold text-xs uppercase tracking-wider">{t('auth.loading')}</p>
        </div>
      </div>
    );
  }

  if (!petId) {
    window.location.href = '/pets';
    return null;
  }

  if (error && !pet) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="bg-red-50 border border-red-200 rounded-2xl px-6 py-5">
          <p className="text-red-700 text-sm font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!pet) return null;

  const primaryImage = images.find((i) => i.isPrimary);
  const otherImages = images.filter((i) => !i.isPrimary);
  const age = pet.birthDate ? computeAge(pet.birthDate) : undefined;

  // Avoid service-worker Cache API errors on image loads.
  const imgUrl = (imageId: string) => `${API_URL}/api/images/${encodeURIComponent(imageId)}?nocache`;

  const labelClass = 'block font-display font-bold text-[11px] uppercase tracking-wider text-footer/50 mb-1';
  const valueClass = 'text-footer text-sm font-medium';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      {/* Back link */}
      <a
        href="/pets"
        className="inline-flex items-center gap-2 text-footer/50 hover:text-footer font-display font-bold text-xs uppercase tracking-wide mb-6 transition-colors"
      >
        <FiArrowLeft className="w-4 h-4" />
        {t('pets.backToDashboard')}
      </a>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display font-black text-3xl sm:text-4xl text-footer uppercase tracking-wide">
            {pet.name}
          </h1>
          <p className="text-footer/40 text-sm mt-1 font-sans">
            {pet.breed ? `${t(`pets.species.${pet.species}`)} · ${pet.breed}` : t(`pets.species.${pet.species}`)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-display font-bold text-sm uppercase tracking-wide px-6 py-3 rounded-xl transition-colors duration-200 shadow-md shadow-primary/15"
          >
            <FiEdit2 className="w-4 h-4" />
            {t('pets.editPet')}
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center gap-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 font-display font-bold text-sm uppercase tracking-wide px-5 py-3 rounded-xl transition-colors duration-200"
          >
            <FiTrash2 className="w-4 h-4" />
            {t('pets.deletePet')}
          </button>
        </div>
      </div>

      {/* Photo gallery */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-sm uppercase tracking-wide text-footer">
            {t('pets.photoGallery')}
          </h2>
          {images.length < 10 && (
            <label className="inline-flex items-center gap-2 bg-cream-tan/40 hover:bg-cream-tan/60 text-footer font-display font-bold text-xs uppercase tracking-wide px-4 py-2 rounded-lg cursor-pointer transition-colors">
              <FiCamera className="w-4 h-4" />
              {uploading ? t('auth.loading') : t('pets.addPhoto')}
              <input type="file" accept="image/jpeg,image/png" onChange={handlePhotoUpload} className="hidden" disabled={uploading} />
            </label>
          )}
        </div>
        {images.length === 0 ? (
          <div className="bg-cream rounded-2xl p-8 text-center">
            <FiCamera className="w-8 h-8 text-cream-tan mx-auto mb-2" />
            <p className="text-footer/40 text-sm font-sans">{t('pets.noPhotosYet')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Primary photo */}
            {primaryImage && (
              <div className="relative bg-cream rounded-2xl overflow-hidden group cursor-pointer" onClick={() => setLightbox(primaryImage.imageId)}>
                <img
                  src={imgUrl(primaryImage.imageId)}
                  alt={pet.name}
                  className="w-full max-h-[50vh] object-contain bg-gray-100 group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <FiMaximize2 className="w-8 h-8 text-white" />
                </div>
                <span className="absolute top-3 left-3 bg-primary text-white font-display font-bold text-[10px] uppercase tracking-wide px-3 py-1 rounded-full shadow-md">
                  {t('pets.primaryPhoto')}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDeleteImage(primaryImage.imageId); }}
                  className="absolute top-3 right-3 p-2 bg-white/90 hover:bg-white rounded-full text-red-500 shadow-md transition-colors"
                  aria-label={t('pets.removePhoto')}
                >
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            {/* Additional photos grid */}
            {otherImages.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {otherImages.map((img) => (
                  <div key={img.id} className="relative group bg-cream rounded-xl overflow-hidden aspect-square">
                    <img
                      src={imgUrl(img.imageId)}
                      alt=""
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setLightbox(img.imageId)}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => handleSetPrimary(img.imageId)}
                        className="p-2 bg-white rounded-full text-primary hover:text-primary-dark transition-colors"
                        aria-label={t('pets.setAsPrimary')}
                        title={t('pets.setAsPrimary')}
                      >
                        <FiStar className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setLightbox(img.imageId)}
                        className="p-2 bg-white rounded-full text-gray-600 hover:text-gray-800 transition-colors"
                        aria-label={t('pets.enlargePhoto')}
                        title={t('pets.enlargePhoto')}
                      >
                        <FiMaximize2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteImage(img.imageId)}
                        className="p-2 bg-white rounded-full text-red-500 hover:text-red-700 transition-colors"
                        aria-label={t('pets.removePhoto')}
                        title={t('pets.removePhoto')}
                      >
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
        {/* Pet info card */}
        <div className="bg-cream rounded-2xl p-5 sm:p-6">
          <h2 className="font-display font-bold text-sm uppercase tracking-wide text-footer mb-4">
            {t('pets.sectionBasicInfo')}
          </h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <span className={labelClass}>{t('pets.speciesLabel')}</span>
              <p className={valueClass}>{t(`pets.species.${pet.species}`)}</p>
            </div>
            {pet.breed && (
              <div>
                <span className={labelClass}>{t('pets.breedLabel')}</span>
                <p className={valueClass}>{pet.breed}</p>
              </div>
            )}
            <div>
              <span className={labelClass}>{t('pets.birthDateLabel')}</span>
              <p className={valueClass}>
                {pet.birthDate
                  ? `${new Date(pet.birthDate).toLocaleDateString()}${age != null ? ` (${age} ${age === 1 ? t('pets.yearSingular') : t('pets.yearPlural')})` : ''}`
                  : '—'}
              </p>
            </div>
            {pet.color && (
              <div>
                <span className={labelClass}>{t('pets.colorLabel')}</span>
                <p className={valueClass}>{pet.color}</p>
              </div>
            )}
            <div>
              <span className={labelClass}>{t('pets.sizeLabel')}</span>
              <p className={valueClass}>{t(`pets.size.${pet.size}`)}</p>
            </div>
            {pet.weightKg != null && (
              <div>
                <span className={labelClass}>{t('pets.weightLabel')}</span>
                <p className={valueClass}>{pet.weightKg} kg</p>
              </div>
            )}
            {pet.heightCm != null && (
              <div>
                <span className={labelClass}>{t('pets.heightLabel')}</span>
                <p className={valueClass}>{pet.heightCm} cm</p>
              </div>
            )}
          </div>
        </div>

        {/* Health card */}
        <div className="bg-cream rounded-2xl p-5 sm:p-6">
          <h2 className="font-display font-bold text-sm uppercase tracking-wide text-footer mb-4">
            {t('pets.healthInfo')}
          </h2>
          {health ? (
            <div className="space-y-3">
              {health.allergies.length > 0 && (
                <div>
                  <span className={labelClass}>{t('pets.allergiesLabel')}</span>
                  <p className={valueClass}>{health.allergies.join(', ')}</p>
                </div>
              )}
              {health.medications.length > 0 && (
                <div>
                  <span className={labelClass}>{t('pets.medicationsLabel')}</span>
                  <p className={valueClass}>{health.medications.join(', ')}</p>
                </div>
              )}
              {health.isNeutered != null && (
                <div>
                  <span className={labelClass}>{t('pets.isNeuteredLabel')}</span>
                  <p className={valueClass}>{health.isNeutered ? t('pets.yes') : t('pets.no')}</p>
                </div>
              )}
              {health.behaviorNotes && (
                <div>
                  <span className={labelClass}>{t('pets.behaviorNotesLabel')}</span>
                  <p className={valueClass}>{health.behaviorNotes}</p>
                </div>
              )}
              {health.specialNeeds && (
                <div>
                  <span className={labelClass}>{t('pets.specialNeedsLabel')}</span>
                  <p className={valueClass}>{health.specialNeeds}</p>
                </div>
              )}
              {!health.allergies.length && !health.medications.length && health.isNeutered == null && !health.behaviorNotes && !health.specialNeeds && (
                <p className="text-footer/30 text-sm font-sans italic">{t('pets.noHealthData')}</p>
              )}
            </div>
          ) : (
            <p className="text-footer/30 text-sm font-sans italic">{t('pets.noHealthData')}</p>
          )}
        </div>
      </div>

      {/* Vet info card */}
      {health && (health.vetName || health.vetPhone || health.vetEmail) && (
        <div className="bg-cream rounded-2xl p-5 sm:p-6 mb-8">
          <h2 className="font-display font-bold text-sm uppercase tracking-wide text-footer mb-4">
            {t('pets.vetInfo')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {health.vetName && (
              <div>
                <span className={labelClass}>{t('pets.vetNameLabel')}</span>
                <p className={valueClass}>{health.vetName}</p>
              </div>
            )}
            {health.vetPhone && (
              <div>
                <span className={labelClass}>{t('pets.vetPhoneLabel')}</span>
                <p className={valueClass}>{health.vetPhone}</p>
              </div>
            )}
            {health.vetEmail && (
              <div>
                <span className={labelClass}>{t('pets.vetEmailLabel')}</span>
                <p className={valueClass}>{health.vetEmail}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm shadow-lg z-50 max-w-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-3 font-bold">&times;</button>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[110] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            aria-label={t('auth.close')}
          >
            <FiX className="w-6 h-6" />
          </button>
          <img
            src={imgUrl(lightbox)}
            alt={pet.name}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>'; }}
          />
        </div>
      )}

      {/* Edit modal */}
      <PetEditModal
        pet={pet}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={handleSaved}
      />

      {/* Delete confirmation modal */}
      <DeletePetModal
        pet={pet}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
