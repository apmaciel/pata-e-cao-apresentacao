import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';
import { admin, type ProviderListItem } from '../services/api';
import { statusClass, serviceLabel } from '../utils/adminHelpers';
import AdminActionModal from './AdminActionModal';
import ProviderDetailPopover from './ProviderDetailPopover';
import '../i18n.config';

interface ActionModal {
  provider: ProviderListItem;
  action: 'approve' | 'reject' | 'suspend' | 'unsuspend';
}

interface ApplicationsPanelProps {
  sessionReady: boolean;
}

export default function ApplicationsPanel({ sessionReady }: ApplicationsPanelProps) {
  const { t } = useTranslation();

  const [pending, setPending] = useState<ProviderListItem[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);

  const [modal, setModal] = useState<ActionModal | null>(null);
  const [detailProvider, setDetailProvider] = useState<ProviderListItem | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    if (!sessionReady) return;
    setPendingLoading(true);
    try {
      setPending(await admin.getPending());
    } catch {
      setError(t('admin.errors.loadFailed'));
    } finally {
      setPendingLoading(false);
    }
  }, [t, sessionReady]);

  useEffect(() => { loadPending(); }, [loadPending]);

  const handleAction = async (id: string, fn: () => Promise<void>) => {
    setActionLoading(true);
    setError(null);
    try {
      await fn();
      loadPending();
      setModal(null);
      setReason('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('admin.errors.actionFailed'));
    } finally {
      setActionLoading(false);
    }
  };

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

      {/* Pending queue */}
      <section>
        <h2 className="font-display font-black text-xl text-footer uppercase tracking-wide mb-4">
          {t('admin.pendingQueue')} ({pending.length})
        </h2>
        {pendingLoading ? (
          <p className="text-sm text-gray-500">{t('auth.loading')}</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-gray-500">{t('admin.noPending')}</p>
        ) : (
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
                {pending.map((p) => (
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
          onApprove={(p) => setModal({ provider: p, action: 'approve' })}
          onReject={(p) => setModal({ provider: p, action: 'reject' })}
        />
      )}
    </div>
  );
}
