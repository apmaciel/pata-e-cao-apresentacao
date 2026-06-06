import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FiSearch, FiFilter, FiMapPin } from 'react-icons/fi';
import { search, AutocompleteSuggestion } from '../services/api';
import { API_URL } from '../utils/config';

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

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Debounced autocomplete fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedIndex(-1);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await search.autocomplete(trimmed);
        setSuggestions(result.suggestions);
        setShowSuggestions(result.suggestions.length > 0);
        setSelectedIndex(-1);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync query from URL when navigating back/forward
  useEffect(() => {
    const onPop = () => setQuery(readUrlParam('q'));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigateToProvider = useCallback((id: string) => {
    setShowSuggestions(false);
    setQuery('');
    window.location.href = `/providers/detail?id=${id}`;
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
    setShowSuggestions(false);

    // If a suggestion is selected via keyboard, navigate to it
    if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
      navigateToProvider(suggestions[selectedIndex].id);
      return;
    }

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;
      case 'Enter':
        if (selectedIndex >= 0) {
          e.preventDefault();
          navigateToProvider(suggestions[selectedIndex].id);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  function toggleAccepts(current: boolean | null, setter: (v: boolean | null) => void) {
    if (current === null) setter(true);
    else if (current === true) setter(false);
    else setter(null);
  }

  const filterLabel = (key: string) => t(`search.${key}` as any);

  // Service badge color helper
  const serviceBadgeClass = (service: string) => {
    switch (service) {
      case 'walking': return 'bg-blue-100 text-blue-700';
      case 'training': return 'bg-amber-100 text-amber-700';
      case 'boarding': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <section className="bg-cream pt-8 pb-10 px-4">
      <div className="max-w-2xl mx-auto">
        <form onSubmit={handleSubmit}>
          {/* Main search row */}
          <div className="relative flex items-center bg-white rounded-full shadow-md border border-gray-200 px-5 py-4 gap-3">
            <FiSearch className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (suggestions.length > 0 && query.trim().length >= 2) {
                  setShowSuggestions(true);
                }
              }}
              placeholder={t('search.placeholder')}
              className="flex-1 bg-transparent text-gray-700 placeholder-gray-400 text-sm outline-none focus-visible:outline-none"
              autoComplete="off"
              role="combobox"
              aria-expanded={showSuggestions}
              aria-autocomplete="list"
              aria-controls="search-suggestions"
              aria-activedescendant={selectedIndex >= 0 ? `suggestion-${selectedIndex}` : undefined}
            />
            {/* Loading spinner */}
            {isLoading && (
              <div className="flex-shrink-0 w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            )}
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

            {/* Autocomplete dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                id="search-suggestions"
                role="listbox"
                className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50"
              >
                {suggestions.map((s, i) => (
                  <button
                    key={s.id}
                    id={`suggestion-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === selectedIndex}
                    onClick={() => navigateToProvider(s.id)}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                      i === selectedIndex
                        ? 'bg-primary/5 border-l-2 border-primary'
                        : 'border-l-2 border-transparent hover:bg-gray-50'
                    } ${i > 0 ? 'border-t border-gray-100' : ''}`}
                  >
                    {/* Logo or initial */}
                    {s.logoImageId ? (
                      <img
                        src={`${API_URL}/api/images/${s.logoImageId}`}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold">
                          {s.businessName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {s.businessName}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {s.location && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <FiMapPin className="w-3 h-3" />
                            <span className="truncate">{s.location}</span>
                          </span>
                        )}
                        {s.services.map((svc) => (
                          <span
                            key={svc}
                            className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${serviceBadgeClass(svc)}`}
                          >
                            {t(`services.catalog.${svc}` as any, svc)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
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
