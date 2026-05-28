import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pets, authReady, getCurrentUser, type Pet } from '../services/api';
import { API_URL } from '../utils/config';
import { FiPlus, FiChevronRight, FiHeart } from 'react-icons/fi';

// Pet avatar — first letter of name, with a species-appropriate background.
function petInitials(name: string): string {
  return (name?.trim() || '?').charAt(0).toUpperCase();
}

function petAvatarBg(species: string): string {
  switch (species) {
    case 'dog': return 'bg-amber-100 text-amber-700';
    case 'cat': return 'bg-gray-200 text-gray-700';
    case 'bird': return 'bg-sky-100 text-sky-700';
    case 'fish': return 'bg-cyan-100 text-cyan-700';
    case 'rodent': return 'bg-orange-100 text-orange-700';
    case 'reptile': return 'bg-lime-100 text-lime-700';
    default: return 'bg-primary-light text-primary-dark';
  }
}

function sizeBadge(size: string): { bg: string; text: string } {
  switch (size) {
    case 'small': return { bg: 'bg-blue-50 text-blue-700 border-blue-200', text: 'border' };
    case 'large': return { bg: 'bg-amber-50 text-amber-700 border-amber-200', text: 'border' };
    default: return { bg: 'bg-green-50 text-green-700 border-green-200', text: 'border' };
  }
}

export default function PetDashboard() {
  const { t } = useTranslation();
  const [petList, setPetList] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const user = getCurrentUser();

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const u = await authReady();
      if (cancelled) return;
      if (!u) {
        window.location.href = '/';
        return;
      }
      try {
        const list = await pets.list();
        if (!cancelled) setPetList(Array.isArray(list) ? list : []);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('auth.errors.generic'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [t]);

  // ── Loading spinner ───────────────────────────────────────────────────────────

  if (loading) {
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

  // ── Error banner ──────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <div className="bg-red-50 border border-red-200 rounded-2xl px-6 py-5 text-center">
          <p className="text-red-700 text-sm font-medium mb-3">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 bg-white hover:bg-red-50 text-red-700 font-display font-bold text-xs uppercase tracking-wide px-5 py-2.5 rounded-xl border border-red-200 transition-colors"
          >
            {t('pets.tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────────

  if ((petList?.length ?? 0) === 0) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="max-w-lg w-full text-center">
          {/* Illustration circle */}
          <div className="w-24 h-24 bg-cream rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
            <FiHeart className="w-12 h-12 text-cream-tan" />
          </div>

          <h1 className="font-display font-black text-2xl sm:text-3xl text-footer uppercase tracking-wide mb-3">
            {t('pets.dashboardTitle')}
          </h1>
          {user && (
            <p className="text-footer/50 text-sm mb-2 font-sans">
              {t('account.welcomeBack')}, <span className="font-semibold text-footer/70">{user.fullName}</span>
            </p>
          )}
          <p className="text-footer/40 text-sm leading-relaxed mb-8 max-w-sm mx-auto font-sans">
            {t('pets.noPetsDescription')}
          </p>

          <div className="flex flex-col items-center gap-4">
            <a
              href="/pets/add"
              className="inline-flex items-center gap-3 bg-primary hover:bg-primary-dark text-white font-display font-bold text-sm uppercase tracking-wide px-8 py-4 rounded-xl transition-colors duration-200 shadow-lg shadow-primary/20"
            >
              <FiPlus className="w-5 h-5" />
              {t('pets.registerYourFirstPet')}
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Pet cards grid ────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 sm:mb-10">
        <div>
          <h1 className="font-display font-black text-3xl sm:text-4xl text-footer uppercase tracking-wide">
            {t('pets.dashboardTitle')}
          </h1>
          {user && (
            <p className="text-footer/50 text-sm mt-1.5 font-sans">
              {t('account.welcomeBack')}, <span className="font-semibold text-footer/70">{user.fullName}</span>
              {(petList?.length ?? 0) > 0 && (
                <span className="text-footer/30">
                  {' '}· {petList?.length} {(petList?.length ?? 0) === 1 ? t('pets.petSingular') : t('pets.petPlural')}
                </span>
              )}
            </p>
          )}
        </div>
        <a
          href="/pets/add"
          className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-display font-bold text-sm uppercase tracking-wide px-6 py-3.5 rounded-xl transition-colors duration-200 shadow-md shadow-primary/15"
        >
          <FiPlus className="w-5 h-5" />
          {t('pets.addAnotherPet')}
        </a>
      </div>

      {/* Pet cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(petList ?? []).map((pet) => {
          const sizeStyle = sizeBadge(pet.size);
          return (
            <a
              key={pet.id}
              href={`/pets/detail?petId=${pet.id}`}
              className="group block bg-cream hover:bg-cream-tan/20 rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 overflow-hidden"
            >
              {/* Card top: avatar + info */}
              <div className="p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  {/* Avatar / photo */}
                  {pet.photoImageId ? (
                    <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-cream-tan/30">
                      <img
                        src={`${API_URL}/api/images/${encodeURIComponent(pet.photoImageId)}?nocache`}
                        alt={pet.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  ) : (
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center font-display font-black text-lg shrink-0 ${petAvatarBg(pet.species)}`}
                    >
                      {petInitials(pet.name)}
                    </div>
                  )}

                  {/* Name + species/breed */}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display font-bold text-lg text-footer truncate leading-tight">
                      {pet.name}
                    </h3>
                    <p className="text-footer/45 text-sm mt-0.5 truncate font-sans">
                      {pet.breed
                        ? `${t(`pets.species.${pet.species}`)} · ${pet.breed}`
                        : t(`pets.species.${pet.species}`)}
                    </p>
                  </div>

                  {/* Chevron */}
                  <FiChevronRight className="w-5 h-5 text-footer/20 group-hover:text-primary shrink-0 mt-2 transition-colors duration-200" />
                </div>

                {/* Tags row */}
                <div className="flex flex-wrap gap-2 mt-4">
                  {/* Size badge */}
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide border ${sizeStyle.bg} ${sizeStyle.text}`}>
                    {t(`pets.size.${pet.size}`)}
                  </span>

                  {/* Color badge */}
                  {pet.color && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/60 text-footer/60 border border-gray-200">
                      {pet.color}
                    </span>
                  )}

                  {/* Birth date badge */}
                  {pet.birthDate && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-600 border border-purple-100">
                      {new Date(pet.birthDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  )}

                  {/* Age badge */}
                  {pet.ageYears != null && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/60 text-footer/60 border border-gray-200">
                      {pet.ageYears} {pet.ageYears === 1 ? t('pets.yearSingular') : t('pets.yearPlural')}
                    </span>
                  )}
                </div>
              </div>

              {/* Card footer: subtle detail bar */}
              <div className="h-1 bg-gradient-to-r from-primary/40 via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </a>
          );
        })}
      </div>
    </div>
  );
}
