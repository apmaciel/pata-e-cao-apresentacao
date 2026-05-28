import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiUsers, FiGrid, FiCalendar, FiHeart, FiTrendingUp } from 'react-icons/fi';
import { admin, type AdminStats, type ProviderGrowthResponse, type PetSpeciesPoint, type PetAgePoint } from '../services/api';
import LineChart from './LineChart';
import '../i18n.config';

interface DashboardPanelProps {
  sessionReady: boolean;
}

const STAT_CARDS = [
  { key: 'totalUsers', icon: FiUsers, color: 'text-blue-600 bg-blue-50' },
  { key: 'totalProviders', icon: FiGrid, color: 'text-teal-600 bg-teal-50' },
  { key: 'totalPets', icon: FiHeart, color: 'text-pink-600 bg-pink-50' },
  { key: 'totalBookings', icon: FiCalendar, color: 'text-purple-600 bg-purple-50' },
] as const;

const RANGE_OPTIONS = [
  { value: '30d', labelKey: 'admin.stats.range30d' },
  { value: '60d', labelKey: 'admin.stats.range60d' },
  { value: '90d', labelKey: 'admin.stats.range90d' },
  { value: 'ytd', labelKey: 'admin.stats.rangeYtd' },
  { value: 'all', labelKey: 'admin.stats.rangeAll' },
] as const;

const SERVICE_COLORS: Record<string, string> = {
  boarding: '#3B82F6',
  training: '#8B5CF6',
  walking: '#10B981',
};

const SPECIES_COLORS: Record<string, string> = {
  dog: '#3B82F6',
  cat: '#EC4899',
  bird: '#F59E0B',
  fish: '#10B981',
  rodent: '#8B5CF6',
  reptile: '#00BFA5',
  other: '#6B7280',
};

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function formatDateLabel(date: string, interval: string): string {
  if (interval === 'month') {
    const [y, m] = date.split('-');
    return `${m}/${y.slice(2)}`;
  }
  if (interval === 'week') {
    return date.slice(5); // MM-DD
  }
  return date.slice(5); // MM-DD for day too
}

export default function DashboardPanel({ sessionReady }: DashboardPanelProps) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Provider growth chart state
  const [growth, setGrowth] = useState<ProviderGrowthResponse | null>(null);
  const [growthLoading, setGrowthLoading] = useState(false);
  const [growthRange, setGrowthRange] = useState('30d');

  useEffect(() => {
    if (!sessionReady) return;
    let cancelled = false;
    setLoading(true);
    admin.getStats().then((data) => {
      if (!cancelled) { setStats(data); setError(null); }
    }).catch(() => {
      if (!cancelled) setError(t('admin.stats.loadError'));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [sessionReady, t]);

  useEffect(() => {
    if (!sessionReady) return;
    let cancelled = false;
    setGrowthLoading(true);
    admin.getProviderGrowth(growthRange).then((data) => {
      if (!cancelled) setGrowth(data);
    }).catch(() => {
      // chart load failures are non-critical
    }).finally(() => {
      if (!cancelled) setGrowthLoading(false);
    });
    return () => { cancelled = true; };
  }, [sessionReady, growthRange]);

  // ── Pet charts state ───────────────────────────────────────────────────
  const [speciesData, setSpeciesData] = useState<PetSpeciesPoint[]>([]);
  const [ageData, setAgeData] = useState<PetAgePoint[]>([]);
  const [petChartsLoading, setPetChartsLoading] = useState(false);
  const [ageSpeciesFilter, setAgeSpeciesFilter] = useState('');

  useEffect(() => {
    if (!sessionReady) return;
    let cancelled = false;
    setPetChartsLoading(true);
    Promise.all([
      admin.getPetSpeciesDistribution(),
      admin.getPetAgeDistribution(),
    ]).then(([species, ages]) => {
      if (!cancelled) {
        setSpeciesData(species);
        setAgeData(ages);
      }
    }).catch(() => {
      // pet chart load failures are non-critical
    }).finally(() => {
      if (!cancelled) setPetChartsLoading(false);
    });
    return () => { cancelled = true; };
  }, [sessionReady]);

  useEffect(() => {
    if (!sessionReady) return;
    let cancelled = false;
    admin.getPetAgeDistribution(ageSpeciesFilter || undefined).then((data) => {
      if (!cancelled) setAgeData(data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [sessionReady, ageSpeciesFilter]);

  if (loading) return <p className="text-sm text-gray-500">{t('admin.stats.loading')}</p>;
  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!stats) return null;

  const num = (n: number) => new Intl.NumberFormat().format(n);

  const xLabels = growth?.data.map((p) => p.date) ?? [];
  const totalSeries = growth ? [{ key: 'total', label: t('admin.stats.totalProviders'), color: '#00BFA5', data: growth.data.map((p) => p.total) }] : [];
  const serviceSeries = growth
    ? Object.keys(SERVICE_COLORS)
        .map((svc) => ({
          key: svc,
          label: t(`services.catalog.${svc}`),
          color: SERVICE_COLORS[svc],
          data: growth.data.map((p) => p.byService[svc] ?? 0),
        }))
        .filter((s) => s.data.some((v) => v > 0))
    : [];

  return (
    <div className="space-y-8">
      <h1 className="font-display font-black text-3xl sm:text-4xl text-footer uppercase tracking-wide">
        {t('admin.stats.title')}
      </h1>

      {/* Top-level stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(({ key, icon: Icon, color }) => (
          <div key={key} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className={`inline-flex p-2.5 rounded-lg ${color} mb-3`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="font-display font-black text-2xl sm:text-3xl text-gray-900">{num(stats[key as keyof AdminStats] as number)}</p>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mt-1">{t(`admin.stats.${key}`)}</p>
          </div>
        ))}
      </div>

      {/* Reviews card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="inline-flex p-2.5 rounded-lg text-amber-600 bg-amber-50 mb-3">
          <FiHeart className="w-5 h-5" />
        </div>
        <p className="font-display font-black text-2xl sm:text-3xl text-gray-900">{num(stats.totalReviews)}</p>
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mt-1">{t('admin.stats.totalReviews')}</p>
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <BreakdownCard
          title={t('admin.stats.providersByStatus')}
          data={stats.providersByStatus}
        />
        <BreakdownCard
          title={t('admin.stats.usersByRole')}
          data={stats.usersByRole}
        />
        <BreakdownCard
          title={t('admin.stats.bookingsByStatus')}
          data={stats.bookingsByStatus}
        />
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="font-display font-black text-2xl text-primary-dark">{num(stats.newUsersLast30Days)}</p>
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mt-1">{t('admin.stats.newUsersLast30Days')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="font-display font-black text-2xl text-primary-dark">{num(stats.newProvidersLast30Days)}</p>
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mt-1">{t('admin.stats.newProvidersLast30Days')}</p>
        </div>
      </div>

      {/* ── Provider growth charts ────────────────────────────────────────── */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <FiTrendingUp className="w-5 h-5 text-primary-dark" />
            <h2 className="font-display font-black text-lg text-footer uppercase tracking-wide">
              {t('admin.stats.providerGrowth')}
            </h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RANGE_OPTIONS.map(({ value, labelKey }) => (
              <button
                key={value}
                onClick={() => setGrowthRange(value)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  growthRange === value
                    ? 'bg-primary text-white'
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-primary'
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Total growth chart */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-3">
              {t('admin.stats.totalProviderGrowth')}
            </h3>
            {growthLoading ? (
              <div className="flex items-center justify-center h-56">
                <p className="text-sm text-gray-400">{t('auth.loading')}</p>
              </div>
            ) : totalSeries[0]?.data.length ? (
              <LineChart
                xLabels={xLabels}
                series={totalSeries}
                height={220}
                formatXLabel={(d) => formatDateLabel(d, growth?.interval ?? 'day')}
              />
            ) : (
              <p className="text-sm text-gray-400 py-16 text-center">{t('admin.stats.noData')}</p>
            )}
          </div>

          {/* Service growth chart */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-3">
              {t('admin.stats.providerGrowthByService')}
            </h3>
            {growthLoading ? (
              <div className="flex items-center justify-center h-56">
                <p className="text-sm text-gray-400">{t('auth.loading')}</p>
              </div>
            ) : serviceSeries.length ? (
              <LineChart
                xLabels={xLabels}
                series={serviceSeries}
                height={220}
                formatXLabel={(d) => formatDateLabel(d, growth?.interval ?? 'day')}
              />
            ) : (
              <p className="text-sm text-gray-400 py-16 text-center">{t('admin.stats.noData')}</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Pet charts ───────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <FiHeart className="w-5 h-5 text-pink-600" />
          <h2 className="font-display font-black text-lg text-footer uppercase tracking-wide">
            {t('admin.stats.totalPets')}
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pet species donut chart */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-3">
              {t('admin.stats.petSpeciesDistribution')}
            </h3>
            {petChartsLoading ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-sm text-gray-400">{t('auth.loading')}</p>
              </div>
            ) : speciesData.length ? (
              <SpeciesDonutChart data={speciesData} t={t} />
            ) : (
              <p className="text-sm text-gray-400 py-16 text-center">{t('admin.stats.noData')}</p>
            )}
          </div>

          {/* Pet age distribution bar chart */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                {t('admin.stats.petAgeDistribution')}
              </h3>
              <select
                value={ageSpeciesFilter}
                onChange={(e) => setAgeSpeciesFilter(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="">{t('admin.stats.allSpecies')}</option>
                {speciesData.map((s) => (
                  <option key={s.species} value={s.species}>
                    {t(`pets.species.${s.species}`)}
                  </option>
                ))}
              </select>
            </div>
            {petChartsLoading ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-sm text-gray-400">{t('auth.loading')}</p>
              </div>
            ) : ageData.length ? (
              <AgeBarChart data={ageData} t={t} />
            ) : (
              <p className="text-sm text-gray-400 py-16 text-center">{t('admin.stats.noData')}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function BreakdownCard({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
  const total = entries.reduce((sum, [, c]) => sum + c, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-4">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">—</p>
      ) : (
        <div className="space-y-2.5">
          {entries.map(([key, count]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm text-gray-700 capitalize">{key.replace(/_/g, ' ')}</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: total > 0 ? `${(count / total) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-900 w-10 text-right">{count}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Species donut chart ──────────────────────────────────────────────────

function SpeciesDonutChart({ data, t }: { data: PetSpeciesPoint[]; t: (key: string, params?: Record<string, unknown>) => string }) {
  const total = data.reduce((s, p) => s + p.count, 0);
  const cx = 100; const cy = 100; const outerR = 80; const innerR = 50;

  let startAngle = -Math.PI / 2;
  const slices = data.map((p) => {
    const fraction = p.count / total;
    const delta = fraction * 2 * Math.PI;
    const endAngle = startAngle + delta;

    const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
    const outerEnd = polarToCartesian(cx, cy, outerR, endAngle);
    const innerStart = polarToCartesian(cx, cy, innerR, startAngle);
    const innerEnd = polarToCartesian(cx, cy, innerR, endAngle);
    const largeArc = delta > Math.PI ? 1 : 0;

    const d = [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
      `L ${innerEnd.x} ${innerEnd.y}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
      'Z',
    ].join(' ');

    const slice = { species: p.species, count: p.count, fraction, d };
    startAngle = endAngle;
    return slice;
  });

  const num = (n: number) => new Intl.NumberFormat().format(n);

  return (
    <div>
      <div className="flex items-center justify-center">
        <svg viewBox="0 0 200 200" className="w-48 h-48">
          {slices.map((s) => (
            <path
              key={s.species}
              d={s.d}
              fill={SPECIES_COLORS[s.species] ?? '#9CA3AF'}
              stroke="white"
              strokeWidth="1"
            />
          ))}
          <text x={cx} y={cy - 6} textAnchor="middle" className="font-display font-black text-lg" fill="#1F2937">
            {num(total)}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" className="text-[9px] font-bold uppercase" fill="#9CA3AF">
            {t('admin.stats.totalPets')}
          </text>
        </svg>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {slices.map((s) => (
          <div key={s.species} className="flex items-center gap-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SPECIES_COLORS[s.species] ?? '#9CA3AF' }} />
            <span className="text-gray-600 truncate">{t(`pets.species.${s.species}`)}</span>
            <span className="text-gray-400 ml-auto flex-shrink-0">{Math.round(s.fraction * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Age distribution bar chart ───────────────────────────────────────────

function AgeBarChart({ data, t }: { data: PetAgePoint[]; t: (key: string, params?: Record<string, unknown>) => string }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-2">
      {data.map((p) => {
        const label = p.age >= 10
          ? t('admin.stats.ageYearsPlus', { min: p.age })
          : t('admin.stats.ageYears', { min: p.age, max: p.age + 1 });
        const widthPct = (p.count / maxCount) * 100;

        return (
          <div key={p.age} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-16 text-right flex-shrink-0">{label}</span>
            <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${widthPct}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-700 w-8 text-right flex-shrink-0">{p.count}</span>
          </div>
        );
      })}
    </div>
  );
}
