import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiSearch } from 'react-icons/fi';

export default function SearchHero() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      window.location.href = `/providers?q=${encodeURIComponent(query.trim())}`;
    }
  };

  return (
    <section className="bg-cream pt-8 pb-10 px-4">
      <div className="max-w-2xl mx-auto">
        <form onSubmit={handleSearch} className="relative">
          <div className="flex items-center bg-white rounded-full shadow-md border border-gray-200 px-5 py-4 gap-3">
            {/* Search icon */}
            <FiSearch className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              className="flex-1 bg-transparent text-gray-700 placeholder-gray-400 text-sm outline-none focus-visible:outline-none"
            />
            <button
              type="submit"
              className="hidden sm:block bg-primary text-white font-display font-bold text-sm uppercase tracking-wide px-6 py-2 rounded-full hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors duration-200 flex-shrink-0"
            >
              {t('search.button')}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
