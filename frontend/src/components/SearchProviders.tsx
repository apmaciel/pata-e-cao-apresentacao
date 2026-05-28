import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ProviderCard from './ProviderCard';
import { providers as providersApi } from '../services/api';
import { SERVICE_CATALOG } from '../utils/serviceCatalog';
import '../i18n.config';

interface Provider {
  id: string;
  businessName: string;
  location?: string;
  services: string[];
  logoImageId?: string;
  isVerified?: boolean;
  acceptsDogs?: boolean;
  acceptsCats?: boolean;
  acceptsNeutered?: boolean;
  acceptsIntact?: boolean;
}

// SERVICE_CATALOG provides the typed service list; the leading "all" sentinel
// has no canonical token because the API treats absence-of-filter as "all".
const SERVICE_OPTIONS = [
  { value: '', labelKey: 'search.Todos' },
  ...SERVICE_CATALOG,
];

export default function SearchProviders() {
  const { t } = useTranslation();

  // Read query params from the URL so nav links like /providers?service=training
  // pre-fill the filter and search immediately.
  const initialParams = (() => {
    if (typeof window === 'undefined') return { service: '', q: '' };
    const p = new URLSearchParams(window.location.search);
    return { service: p.get('service') || '', q: p.get('q') || '' };
  })();

  const [serviceFilter, setServiceFilter] = useState(initialParams.service);
  const [query] = useState(initialParams.q);
  const [locationFilter, setLocationFilter] = useState('');
  const [results, setResults] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    // Sync filter state to the URL so bookmarks and sharing reflect current
    // filters. Use replaceState to avoid polluting the browser history.
    const urlParams = new URLSearchParams();
    if (query) urlParams.set('q', query);
    if (serviceFilter) urlParams.set('service', serviceFilter);
    if (locationFilter) urlParams.set('location', locationFilter);
    const qs = urlParams.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);

    setLoading(true);
    setHasSearched(true);
    setError(null);

    try {
      const data = await providersApi.list({
        q: query || undefined,
        service: serviceFilter || undefined,
        location: locationFilter || undefined,
        limit: 20,
        offset: 0,
      });
      setResults(Array.isArray(data) ? data : (data as any).providers ?? []);
    } catch {
      setError(t('search.error'));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, serviceFilter, locationFilter, t]);

  // Initial load
  useEffect(() => {
    search();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    search();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-primary-dark mb-2">
          {t('providers.pageTitle')}
        </h1>
        <p className="text-gray-600">
          {t('providers.pageSubtitle')}
        </p>
      </div>

      {/* Search form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-md p-6 mb-10 flex flex-col sm:flex-row gap-4"
      >
        {/* Service type */}
        <div className="flex-1">
          <label htmlFor="service-filter" className="block text-sm font-medium text-gray-700 mb-1.5">
            {t('search.serviceType')}
          </label>
          <select
            id="service-filter"
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent transition-colors duration-200"
          >
            {SERVICE_OPTIONS.map(({ value, labelKey }) => (
              <option key={value} value={value}>
                {t(labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Location */}
        <div className="flex-1">
          <label htmlFor="location-filter" className="block text-sm font-medium text-gray-700 mb-1.5">
            {t('search.location')}
          </label>
          <input
            id="location-filter"
            type="text"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            placeholder={t('search.locationPlaceholder')}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 placeholder-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent transition-colors duration-200"
          />
        </div>

        {/* Submit */}
        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto btn-primary px-8 py-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('search.searching')}
              </span>
            ) : (
              t('search.button')
            )}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-6 py-4 mb-8">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="skeleton w-14 h-14 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="skeleton h-6 w-20 rounded-full" />
                <div className="skeleton h-6 w-16 rounded-full" />
              </div>
              <div className="skeleton h-4 w-1/3 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && hasSearched && results.length > 0 && (
        <>
          <p className="text-sm text-gray-500 mb-4">
            {t('search.resultsCount', { count: results.length })}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {results.map((provider) => (
              <ProviderCard key={provider.id} {...provider} />
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && hasSearched && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            {t('search.noResults')}
          </h3>
          <p className="text-gray-500 max-w-md">
            {t('search.noResultsHint')}
          </p>
        </div>
      )}
    </div>
  );
}
