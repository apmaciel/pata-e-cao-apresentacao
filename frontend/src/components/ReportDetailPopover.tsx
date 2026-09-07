import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';
import { admin, type ProviderReport } from '../services/api';
import '../i18n.config';

interface ReportDetailPopoverProps {
  providerId: string;
  businessName: string;
  onClose: () => void;
  onReviewed: () => void;
}

export default function ReportDetailPopover({ providerId, businessName, onClose, onReviewed }: ReportDetailPopoverProps) {
  const { t } = useTranslation();
  const [log, setLog] = useState<ProviderReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    admin.getReportLog(providerId).then((entries) => {
      if (!cancelled) setLog(entries);
    }).catch(() => {
      // best-effort; silently ignore failures
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [providerId]);

  async function handleMarkReviewed() {
    setReviewing(true);
    try {
      await admin.markReportsReviewed(providerId);
      onReviewed();
      onClose();
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-display font-bold text-lg text-footer uppercase tracking-wide truncate pr-4">
            {businessName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:text-gray-600"
            aria-label={t('auth.close')}
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Report log */}
        <div className="px-6 py-4">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-3">
            {t('admin.reportsLog')}
          </h4>
          {loading ? (
            <p className="text-xs text-gray-400">{t('auth.loading')}</p>
          ) : log.length === 0 ? (
            <p className="text-xs text-gray-400">{t('admin.reportsLogEmpty')}</p>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {log.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 text-xs">
                  <span
                    className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                      entry.status === 'reviewed' ? 'bg-gray-400' : 'bg-red-500'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-gray-800">
                        {t(`providerProfile.reportReasons.${entry.reason}`)}
                      </span>
                      <span className="text-gray-400">
                        {t(entry.status === 'reviewed' ? 'admin.reportsStatusReviewed' : 'admin.reportsStatusOpen')}
                      </span>
                    </div>
                    {entry.details && (
                      <p className="text-gray-500 mt-0.5 break-all">{entry.details}</p>
                    )}
                    <p className="text-gray-400 mt-0.5">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            type="button"
            onClick={handleMarkReviewed}
            disabled={reviewing}
            className="px-4 py-2 rounded bg-primary hover:bg-primary-dark text-white text-[11px] font-bold uppercase tracking-wide disabled:opacity-50"
          >
            {reviewing ? t('auth.loading') : t('admin.reportsMarkReviewed')}
          </button>
        </div>
      </div>
    </div>
  );
}
