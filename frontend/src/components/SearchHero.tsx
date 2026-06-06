import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiSearch, FiFilter } from 'react-icons/fi';

interface SearchHeroProps {
  /** "redirect" navigates to /providers?... (home page).
   *  "inline" updates the URL in-place (providers page). */
  mode?: 'redirect' | 'inline';
  /** Called when filters change in inline mode. */
  onSearch?: (params: URLSearchParams) => void;
}

function readUrlParam(key: string): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(key) || '';
}

export default function SearchHero({ mode = 'redirect', onSearch }: SearchHeroProps) {
  const { t } = useTranslation();

  const [query, setQuery] = useState(() => readUrlParam('q'));
  const [showFilters, setShowFilters] = useState(false);
  const [acceptsDogs, setAcceptsDogs] = useState<boolean | null>(() => {
    const v = readUrlParam('acceptsDogs');
    return v === 'true' ? true : v === 'false' ? false : null;
  });
  const [acceptsCats, setAcceptsCats] = useState<boolean | null>(() => {
    const v = readUrlParam('acceptsCats');
    return v === 'true' ? true : v === 'false' ? false : null;
  });
  const [acceptsNeutered, setAcceptsNeutered] = useState<boolean | null>(() => {
    const v = readUrlParam('acceptsNeutered');
    return v === 'true' ? true : v === 'false' ? false : null;
  });
  const [acceptsIntact, setAcceptsIntact] = useState<boolean | null>(() => {
    const v = readUrlParam('acceptsIntact');
    return v === 'true' ? true : v === 'false' ? false : null;
  });

  // Sync query from URL when navigating back/forward
  useEffect(() => {
    const onPop = () => setQuery(readUrlParam('q'));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function buildParams(): URLSearchParams {
    const params = new URLSearchParams();
    // Preserve existing URL params we don't manage (e.g. service from nav links)
    if (typeof window !== 'undefined') {
      const current = new URLSearchParams(window.location.search);
      const svc = current.get('service');
      if (svc) params.set('service', svc);
    }
    if (query.trim()) params.set('q', query.trim());
    if (acceptsDogs != null) params.set('acceptsDogs', String(acceptsDogs));
    if (acceptsCats != null) params.set('acceptsCats', String(acceptsCats));
    if (acceptsNeutered != null) params.set('acceptsNeutered', String(acceptsNeutered));
    if (acceptsIntact != null) params.set('acceptsIntact', String(acceptsIntact));
    return params;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = buildParams();
    const qs = params.toString();

    if (mode === 'redirect') {
      window.location.href = `/providers${qs ? `?${qs}` : ''}`;
    } else {
      const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.pushState(null, '', newUrl);
      window.dispatchEvent(new CustomEvent('search-changed', { detail: params }));
      onSearch?.(params);
    }
  };

  function toggleAccepts(current: boolean | null, setter: (v: boolean | null) => void) {
    if (current === null) setter(true);
    else if (current === true) setter(false);
    else setter(null);
  }

  const filterLabel = (key: string) => t(`search.${key}` as any);

  return (
    <section className="bg-cream pt-8 pb-10 px-4">
      <div className="max-w-2xl mx-auto">
        <form onSubmit={handleSubmit}>
          {/* Main search row */}
          <div className="flex items-center bg-white rounded-full shadow-md border border-gray-200 px-5 py-4 gap-3">
            <FiSearch className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              className="flex-1 bg-transparent text-gray-700 placeholder-gray-400 text-sm outline-none focus-visible:outline-none"
            />
            {/* Filter toggle */}
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors flex-shrink-0 ${
                showFilters
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400'
              }`}
              title={t('search.filters')}
            >
              <FiFilter className="w-4 h-4" />
            </button>
            <button
              type="submit"
              className="hidden sm:block bg-primary text-white font-display font-bold text-sm uppercase tracking-wide px-6 py-2 rounded-full hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors duration-200 flex-shrink-0"
            >
              {t('search.button')}
            </button>
          </div>

          {/* Acceptance criteria filters (collapsible) */}
          {showFilters && (
            <div className="mt-3 bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {t('search.filters')}
              </p>
              <div className="flex flex-wrap gap-2">
                {([
                  ['acceptsDogs', acceptsDogs, setAcceptsDogs] as const,
                  ['acceptsCats', acceptsCats, setAcceptsCats] as const,
                  ['acceptsNeutered', acceptsNeutered, setAcceptsNeutered] as const,
                  ['acceptsIntact', acceptsIntact, setAcceptsIntact] as const,
                ]).map(([key, value, setter]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleAccepts(value, setter)}
                    className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                      value === true
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : value === false
                        ? 'border-red-300 bg-red-50 text-red-500 line-through'
                        : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {filterLabel(key)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mobile submit button */}
          <button
            type="submit"
            className="sm:hidden w-full mt-4 bg-primary text-white font-display font-bold text-sm uppercase tracking-wide px-6 py-3 rounded-full hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors duration-200"
          >
            {t('search.button')}
          </button>
        </form>
      </div>
    </section>
  );
}
