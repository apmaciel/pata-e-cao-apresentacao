import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiFlag, FiCheck } from 'react-icons/fi';
import { reports, type ReportReason } from '../services/api';
import '../i18n.config';

const REASONS: ReportReason[] = ['fraud', 'inappropriate_behavior', 'false_information', 'other'];

interface ReportProviderModalProps {
  providerId: string;
  businessName: string;
  onClose: () => void;
}

export default function ReportProviderModal({ providerId, businessName, onClose }: ReportProviderModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      await reports.submit(providerId, reason, details.trim() || undefined);
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('providerProfile.reportError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <FiCheck className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="font-display font-black text-xl text-footer mb-2">
              {t('providerProfile.reportSuccessTitle')}
            </h3>
            <p className="text-sm text-footer/60 mb-6">{t('providerProfile.reportSuccessBody')}</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full bg-primary text-white rounded-xl px-4 py-3 text-sm font-display font-bold uppercase tracking-wide hover:bg-primary-dark transition-colors"
            >
              {t('providerProfile.reportClose')}
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <FiFlag className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="font-display font-black text-xl text-footer mb-2">
                {t('providerProfile.reportTitle')}
              </h3>
              <p className="text-sm text-footer/60">{businessName}</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 mb-4">
                {error}
              </div>
            )}

            <label className="block text-sm font-medium text-footer/70 mb-2">
              {t('providerProfile.reportReasonLabel')}
            </label>
            <div className="space-y-2 mb-4">
              {REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                    reason === r ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="accent-primary"
                  />
                  <span className="text-sm text-footer">{t(`providerProfile.reportReasons.${r}`)}</span>
                </label>
              ))}
            </div>

            <label htmlFor="report-details" className="block text-sm font-medium text-footer/70 mb-2">
              {t('providerProfile.reportDetailsLabel')}
            </label>
            <textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={t('providerProfile.reportDetailsPlaceholder')}
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-footer placeholder-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent text-sm mb-6 resize-none"
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-footer/70 text-sm font-display font-bold uppercase tracking-wide hover:bg-gray-50 transition-colors"
              >
                {t('providerProfile.reportCancel')}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!reason || submitting}
                className="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white text-sm font-display font-bold uppercase tracking-wide hover:bg-red-700 transition-colors disabled:opacity-40"
              >
                {submitting ? t('auth.loading') : t('providerProfile.reportSubmit')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
