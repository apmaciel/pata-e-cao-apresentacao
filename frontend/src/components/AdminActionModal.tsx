import { useTranslation } from 'react-i18next';
import type { ProviderListItem } from '../services/api';
import '../i18n.config';

interface AdminActionModalProps {
  modal: { provider: ProviderListItem; action: 'approve' | 'reject' | 'suspend' | 'unsuspend' } | null;
  reason: string;
  onReasonChange: (value: string) => void;
  loading: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function AdminActionModal({
  modal,
  reason,
  onReasonChange,
  loading,
  error,
  onConfirm,
  onCancel,
}: AdminActionModalProps) {
  const { t } = useTranslation();

  if (!modal) return null;

  const isDisabled = !reason.trim() || loading;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="font-display font-bold text-lg uppercase tracking-wide text-footer mb-2">
          {t(`admin.${modal.action}`)}
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          {modal.provider.businessName}
        </p>
        <label
          htmlFor="admin-reason"
          className="block text-[11px] font-bold uppercase tracking-wide text-footer mb-1"
        >
          {t('admin.reasonLabel')}:
        </label>
        <textarea
          id="admin-reason"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none"
          rows={3}
        />
        {error && (
          <p className="mt-2 text-xs text-red-700">{error}</p>
        )}
        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500 hover:text-gray-700"
          >
            {t('admin.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isDisabled}
            className={`px-4 py-2 rounded text-[11px] font-bold uppercase tracking-wide text-white disabled:opacity-40 ${
              modal.action === 'reject'
                ? 'bg-red-500 hover:bg-red-600'
                : modal.action === 'suspend'
                  ? 'bg-orange-500 hover:bg-orange-600'
                  : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {loading ? t('auth.loading') : t('admin.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
