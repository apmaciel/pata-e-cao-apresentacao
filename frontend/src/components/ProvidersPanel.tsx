import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { admin, type ProviderListItem, type SearchResult } from '../services/api';
import { statusClass, serviceLabel, STATUS_TABS } from '../utils/adminHelpers';
import AdminActionModal from './AdminActionModal';
import ProviderDetailPopover from './ProviderDetailPopover';
import '../i18n.config';

type StatusTab = '' | 'pending' | 'approved' | 'suspended' | 'rejected';

interface ActionModal {
  provider: ProviderListItem;
  action: 'approve' | 'reject' | 'suspend' | 'unsuspend';
}

interface ProvidersPanelProps {
  sessionReady: boolean;
}

export default function ProvidersPanel({ sessionReady }: ProvidersPanelProps) {
  const { t } = useTranslation();

  const [tab, setTab] = useState<StatusTab>('');
  const [searchText, setSearchText] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [page, setPage] = useState(1);

  const [modal, setModal] = useState<ActionModal | null>(null);
  const [detailProvider, setDetailProvider] = useState<ProviderListItem | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce search input by 300ms.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchText(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadTable = useCallback(async () => {
    if (!sessionReady) return;
    setTableLoading(true);
    try {
      setResult(await admin.listProviders({
        status: tab || undefined,
        search: searchText || undefined,
        page,
        perPage: 15,
      }));
      setError(null);
    } catch {
      setError(t('admin.errors.loadFailed'));
    } finally {
      setTableLoading(false);
    }
  }, [tab, page, searchText, t, sessionReady]);

  useEffect(() => { loadTable(); }, [loadTable]);

  const handleAction = async (id: string, fn: () => Promise<void>) => {
    setActionLoading(true);
    setError(null);
    try {
      await fn();
      loadTable();
      setModal(null);
      setReason('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('admin.errors.actionFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.perPage)) : 1;

  return (
    <div className="space-y-8">
      <h1 className="font-display font-black text-3xl sm:text-4xl text-footer uppercase tracking-wide">
        {t('admin.title')}
      </h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* All providers table */}
      <section>
        <h2 className="font-display font-black text-xl text-footer uppercase tracking-wide mb-4">
          {t('admin.allProviders')}
        </h2>

        {/* Search + Status tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
            placeholder={t('admin.searchPlaceholder')}
            className="w-full sm:w-80 px-3 py-2 rounded-lg border border-gray-200 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map(({ value, labelKey }) => (
              <button
                key={value}
                onClick={() => { setTab(value); setPage(1); }}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition-colors ${
                  tab === value
                    ? 'bg-primary text-white'
                    : 'bg-white text-footer/70 border border-gray-200 hover:border-primary'
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>

        {tableLoading ? (
          <p className="text-sm text-gray-500">{t('auth.loading')}</p>
        ) : !result || result.providers.length === 0 ? (
          <p className="text-sm text-gray-500">{t('admin.noResults')}</p>
        ) : (
          <>
            <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left uppercase tracking-wide text-[11px] text-gray-500">
                  <tr>
                    <th className="px-4 py-3">{t('admin.colName')}</th>
                    <th className="px-4 py-3">{t('admin.colService')}</th>
                    <th className="px-4 py-3">{t('admin.colStatus')}</th>
                    <th className="px-4 py-3">{t('admin.colSubmittedAt')}</th>
                    <th className="px-4 py-3 text-right">{t('admin.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(result.providers ?? []).map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setDetailProvider(p)}
                          className="font-medium text-primary-dark hover:text-primary hover:underline text-left"
                        >
                          {p.businessName}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {p.services?.map((s) => t(serviceLabel(s))).join(', ')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusClass(p.status ?? 'pending')}`}>
                          {t(`admin.statusLabel.${p.status ?? 'pending'}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {(p.status === 'pending' || p.status === 'under_review') && (
                          <>
                            <button
                              onClick={() => setModal({ provider: p, action: 'approve' })}
                              disabled={actionLoading}
                              className="text-[11px] font-bold uppercase tracking-wide text-green-600 hover:text-green-800 disabled:opacity-50"
                            >
                              {t('admin.approve')}
                            </button>
                            <button
                              onClick={() => setModal({ provider: p, action: 'reject' })}
                              disabled={actionLoading}
                              className="text-[11px] font-bold uppercase tracking-wide text-red-500 hover:text-red-700 disabled:opacity-50"
                            >
                              {t('admin.reject')}
                            </button>
                          </>
                        )}
                        {p.status === 'approved' && (
                          <>
                            <button
                              onClick={() => setModal({ provider: p, action: 'suspend' })}
                              disabled={actionLoading}
                              className="text-[11px] font-bold uppercase tracking-wide text-orange-500 hover:text-orange-700 disabled:opacity-50"
                            >
                              {t('admin.suspend')}
                            </button>
                            {!p.onboardingCompletedAt && (
                              <button
                                onClick={async () => {
                                  try {
                                    const result = await admin.regenerateToken(p.id);
                                    const url = `${window.location.origin}/providers/setup?token=${result.onboardingToken}`;
                                    await navigator.clipboard.writeText(url);
                                    alert(t('admin.tokenCopied', { defaultValue: 'Setup URL copied to clipboard!' }));
                                  } catch (err) {
                                    alert(t('admin.tokenError', { defaultValue: 'Failed to regenerate token. Please try again.' }));
                                  }
                                }}
                                disabled={actionLoading}
                                className="text-[11px] font-bold uppercase tracking-wide text-blue-600 hover:text-blue-800 disabled:opacity-50"
                              >
                                {t('admin.regenerateToken')}
                              </button>
                            )}
                          </>
                        )}
                        {p.status === 'suspended' && (
                          <button
                            onClick={() => setModal({ provider: p, action: 'unsuspend' })}
                            disabled={actionLoading}
                            className="text-[11px] font-bold uppercase tracking-wide text-green-600 hover:text-green-800 disabled:opacity-50"
                          >
                            {t('admin.unsuspend')}
                          </button>
                        )}
                        {p.status === 'rejected' && (
                          <button
                            onClick={() => handleAction(p.id, () => admin.exclude(p.id))}
                            disabled={actionLoading}
                            className="text-[11px] font-bold uppercase tracking-wide text-red-500 hover:text-red-700 disabled:opacity-50"
                          >
                            {t('admin.exclude')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {result && result.total > result.perPage && (
              <div className="flex items-center justify-between pt-4 text-sm text-gray-500">
                <span>
                  {t('admin.showing', {
                    from: (result.page - 1) * result.perPage + 1,
                    to: Math.min(result.page * result.perPage, result.total),
                    total: result.total,
                  })}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1 rounded border border-gray-200 text-[11px] font-bold uppercase disabled:opacity-40"
                  >
                    {t('admin.prev')}
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1 rounded border border-gray-200 text-[11px] font-bold uppercase disabled:opacity-40"
                  >
                    {t('admin.next')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <AdminActionModal
        modal={modal}
        reason={reason}
        onReasonChange={setReason}
        loading={actionLoading}
        error={error}
        onConfirm={() => {
          if (!reason.trim() || !modal) return;
          let fn: () => Promise<void>;
          switch (modal.action) {
            case 'approve': fn = () => admin.approve(modal.provider.id, reason.trim()); break;
            case 'reject': fn = () => admin.reject(modal.provider.id, reason.trim()); break;
            case 'suspend': fn = () => admin.suspend(modal.provider.id, reason.trim()); break;
            case 'unsuspend': fn = () => admin.unsuspend(modal.provider.id, reason.trim()); break;
          }
          handleAction(modal.provider.id, fn);
        }}
        onCancel={() => { setModal(null); setReason(''); }}
      />

      {detailProvider && (
        <ProviderDetailPopover
          provider={detailProvider}
          onClose={() => setDetailProvider(null)}
          onApprove={detailProvider.status === 'pending' || detailProvider.status === 'under_review' ? (p) => {
            setDetailProvider(null);
            setModal({ provider: p, action: 'approve' });
          } : undefined}
          onReject={detailProvider.status === 'pending' || detailProvider.status === 'under_review' ? (p) => {
            setDetailProvider(null);
            setModal({ provider: p, action: 'reject' });
          } : undefined}
          onSuspend={detailProvider.status === 'approved' ? (p) => {
            setDetailProvider(null);
            setModal({ provider: p, action: 'suspend' });
          } : undefined}
          onUnsuspend={detailProvider.status === 'suspended' ? (p) => {
            setDetailProvider(null);
            setModal({ provider: p, action: 'unsuspend' });
          } : undefined}
        />
      )}
    </div>
  );
}
