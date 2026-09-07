import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { admin, type ProviderListItem, type ProviderReportSummary } from '../services/api';
import { statusClass } from '../utils/adminHelpers';
import AdminActionModal from './AdminActionModal';
import ReportDetailPopover from './ReportDetailPopover';
import '../i18n.config';

interface ReportsPanelProps {
  sessionReady: boolean;
}

interface SuspendModal {
  provider: ProviderListItem;
  action: 'suspend';
}

export default function ReportsPanel({ sessionReady }: ReportsPanelProps) {
  const { t } = useTranslation();

  const [tab, setTab] = useState<'open' | 'all'>('open');
  const [summaries, setSummaries] = useState<ProviderReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailProvider, setDetailProvider] = useState<{ id: string; businessName: string } | null>(null);
  const [reviewLoading, setReviewLoading] = useState<string | null>(null);

  const [modal, setModal] = useState<SuspendModal | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!sessionReady) return;
    setLoading(true);
    try {
      setSummaries(await admin.listReports(tab === 'open' ? 'open' : undefined));
      setError(null);
    } catch {
      setError(t('admin.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [tab, t, sessionReady]);

  useEffect(() => { load(); }, [load]);

  async function handleMarkReviewed(providerId: string) {
    setReviewLoading(providerId);
    try {
      await admin.markReportsReviewed(providerId);
      await load();
    } catch {
      setError(t('admin.errors.actionFailed'));
    } finally {
      setReviewLoading(null);
    }
  }

  async function handleSuspend() {
    if (!reason.trim() || !modal) return;
    setActionLoading(true);
    try {
      await admin.suspend(modal.provider.id, reason.trim());
      setModal(null);
      setReason('');
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('admin.errors.actionFailed'));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display font-black text-3xl sm:text-4xl text-footer uppercase tracking-wide">
        {t('admin.sidebar.reports')}
      </h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <section>
        <div className="flex flex-wrap gap-2 mb-4">
          {(['open', 'all'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setTab(v)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition-colors ${
                tab === v
                  ? 'bg-primary text-white'
                  : 'bg-white text-footer/70 border border-gray-200 hover:border-primary'
              }`}
            >
              {t(v === 'open' ? 'admin.reportsOpen' : 'admin.reportsAll')}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">{t('auth.loading')}</p>
        ) : summaries.length === 0 ? (
          <p className="text-sm text-gray-500">{t('admin.reportsEmpty')}</p>
        ) : (
          <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left uppercase tracking-wide text-[11px] text-gray-500">
                <tr>
                  <th className="px-4 py-3">{t('admin.colName')}</th>
                  <th className="px-4 py-3">{t('admin.reportsCount')}</th>
                  <th className="px-4 py-3">{t('admin.colStatus')}</th>
                  <th className="px-4 py-3">{t('admin.reportsLastAt')}</th>
                  <th className="px-4 py-3 text-right">{t('admin.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summaries.map((s) => (
                  <tr key={s.providerId} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setDetailProvider({ id: s.providerId, businessName: s.businessName })}
                        className="font-medium text-primary-dark hover:text-primary hover:underline text-left"
                      >
                        {s.businessName}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold text-red-700 bg-red-50">
                        {s.reportCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusClass(s.providerStatus)}`}>
                        {t(`admin.statusLabel.${s.providerStatus}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(s.lastReportAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => handleMarkReviewed(s.providerId)}
                        disabled={reviewLoading === s.providerId}
                        className="text-[11px] font-bold uppercase tracking-wide text-green-600 hover:text-green-800 disabled:opacity-50"
                      >
                        {t('admin.reportsMarkReviewed')}
                      </button>
                      {s.providerStatus === 'approved' && (
                        <button
                          onClick={() => setModal({
                            provider: {
                              id: s.providerId,
                              businessName: s.businessName,
                              services: [],
                              avgRating: 0,
                              reviewCount: 0,
                              status: s.providerStatus,
                            },
                            action: 'suspend',
                          })}
                          className="text-[11px] font-bold uppercase tracking-wide text-orange-500 hover:text-orange-700"
                        >
                          {t('admin.suspend')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AdminActionModal
        modal={modal}
        reason={reason}
        onReasonChange={setReason}
        loading={actionLoading}
        error={error}
        onConfirm={handleSuspend}
        onCancel={() => { setModal(null); setReason(''); }}
      />

      {detailProvider && (
        <ReportDetailPopover
          providerId={detailProvider.id}
          businessName={detailProvider.businessName}
          onClose={() => setDetailProvider(null)}
          onReviewed={load}
        />
      )}
    </div>
  );
}
