import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ProviderCard from './ProviderCard';
import { providers as providersApi, type ProviderListItem } from '../services/api';
import '../i18n.config';

const CARD_WIDTH_REM = 16; // w-64
const GAP_REM = 1;         // gap-4
const LIMIT = 15;
const REFRESH_INTERVAL_MS = 30_000;

function randomOffset(max: number) {
  return Math.floor(Math.random() * Math.max(1, max));
}

export default function ProviderCarousel() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<ProviderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const fetchProviders = useCallback(() => {
    // Request a random page so the carousel stays fresh.
    const offset = randomOffset(60);
    providersApi.list({ limit: LIMIT, offset }).then((data) => {
      const list = Array.isArray(data) ? data : ((data as any).providers ?? []);
      // Filter to providers with at least one service.
      const filtered = list.filter((p: ProviderListItem) =>
        (p.services || []).length > 0
      );
      setProviders(filtered);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchProviders();
    const timer = setInterval(fetchProviders, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchProviders]);

  // Nothing to show.
  if (!loading && providers.length === 0) return null;

  // Duplicate the list so the infinite-scroll loop is seamless.
  const track = [...providers, ...providers];

  // Width of one full copy of the list in rem.
  const setWidth = providers.length > 0
    ? providers.length * (CARD_WIDTH_REM + GAP_REM)
    : 0;

  return (
    <section className="bg-cream-tan py-12 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4">
        {/* Section heading */}

        {/* Carousel container with fade edges */}
        <div
          className="relative"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Left fade */}
          <div
            aria-hidden="true"
            className="absolute left-0 top-0 bottom-0 w-16 sm:w-24 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to right, #E8DFD3 0%, transparent 100%)' }}
          />
          {/* Right fade */}
          <div
            aria-hidden="true"
            className="absolute right-0 top-0 bottom-0 w-16 sm:w-24 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to left, #E8DFD3 0%, transparent 100%)' }}
          />

          {/* Scrolling track */}
          {loading ? (
            <div className="flex gap-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="w-64 flex-shrink-0 card flex flex-col gap-4">
                  <div className="skeleton w-full aspect-square rounded-xl" />
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                  <div className="flex gap-2">
                    <div className="skeleton h-6 w-16 rounded-full" />
                    <div className="skeleton h-6 w-12 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden">
              <div
                ref={trackRef}
                className="flex gap-4"
                style={{
                  width: `${setWidth * 2}rem`,
                  animation: paused ? 'none' : `scroll-carousel ${providers.length * 2.5}s linear infinite`,
                }}
              >
                {track.map((p, i) => (
                  <div key={`${p.id}-${i}`} className="w-64 flex-shrink-0">
                    <ProviderCard {...p} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes scroll-carousel {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-${setWidth}rem); }
        }
      `}</style>
    </section>
  );
}
