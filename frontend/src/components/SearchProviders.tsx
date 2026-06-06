import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ProviderCard from './ProviderCard';
import { providers as providersApi } from '../services/api';

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

function readUrlParams(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  p.forEach((v, k) => { out[k] = v; });
  return out;
}

export default function SearchProviders() {
  const { t } = useTranslation();

  const [results, setResults] = useState<Provider[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = useCallback(() => {
    const params = readUrlParams();
    setLoading(true);
    setError(null);

    providersApi.list({
      q: params.q || undefined,
      service: params.service || undefined,
      acceptsDogs: params.acceptsDogs != null ? params.acceptsDogs === 'true' : undefined,
      acceptsCats: params.acceptsCats != null ? params.acceptsCats === 'true' : undefined,
      acceptsNeutered: params.acceptsNeutered != null ? params.acceptsNeutered === 'true' : undefined,
      acceptsIntact: params.acceptsIntact != null ? params.acceptsIntact === 'true' : undefined,
      limit: 20,
      offset: 0,
    }).then((data) => {
      setResults(data.providers ?? []);
      setTotal(data.total ?? 0);
      setLoading(false);
    }).catch(() => {
      setError(t('search.error'));
      setResults([]);
      setLoading(false);
    });
  }, [t]);

  // Initial load
  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // Re-fetch on popstate (back/forward) AND custom search-changed event.
  useEffect(() => {
    const onSearchChanged = () => fetchResults();
    window.addEventListener('popstate', onSearchChanged);
    window.addEventListener('search-changed', onSearchChanged);
    return () => {
      window.removeEventListener('popstate', onSearchChanged);
      window.removeEventListener('search-changed', onSearchChanged);
    };
  }, [fetchResults]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
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
      {!loading && results.length > 0 && (
        <>
          <p className="text-sm text-gray-500 mb-4">
            {t('search.resultsCount', { count: total })}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {results.map((provider) => (
              <ProviderCard key={provider.id} {...provider} />
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && results.length === 0 && !error && (
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
