import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';
import { admin, downloadDocument, type AdminAuditEntry, type ProviderListItem } from '../services/api';
import { statusClass, serviceLabel } from '../utils/adminHelpers';
import '../i18n.config';

// DocumentLink baixa um documento de identidade do prestador via API autenticada,
// cria uma URL blob e a abre em nova aba. Tags <a> comuns não podem enviar o
// header Authorization, então roteamos via fetch com o token em memória.
function DocumentLink({ imageId, label }: { imageId: string; label: string }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = await downloadDocument(imageId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // Silently fall through — the downloadDocument helper surfaces the error.
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="text-primary hover:underline break-all text-left focus-visible:outline-none disabled:opacity-50"
    >
      {loading ? `${label}...` : label}
    </button>
  );
}

interface ProviderDetailPopoverProps {
  provider: ProviderListItem;
  onClose: () => void;
  onApprove?: (provider: ProviderListItem) => void;
  onReject?: (provider: ProviderListItem) => void;
  onSuspend?: (provider: ProviderListItem) => void;
  onUnsuspend?: (provider: ProviderListItem) => void;
}

export default function ProviderDetailPopover({
  provider,
  onClose,
  onApprove,
  onReject,
  onSuspend,
  onUnsuspend,
}: ProviderDetailPopoverProps) {
  const { t } = useTranslation();
  const [auditLog, setAuditLog] = useState<AdminAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAuditLoading(true);
    setAuditLog([]);
    admin.getAuditLog(provider.id).then((entries) => {
      if (!cancelled) setAuditLog(entries);
    }).catch(() => {
      // audit log is best-effort; silently ignore failures
    }).finally(() => {
      if (!cancelled) setAuditLoading(false);
    });
    return () => { cancelled = true; };
  }, [provider.id]);

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
            {provider.businessName}
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

        {/* Body */}
        <div className="px-6 py-4 space-y-3 text-sm">
          {provider.email && (
            <DetailRow label={t('providerApply.email')} value={provider.email} />
          )}
          {provider.phone && (
            <DetailRow label={t('providerApply.phone')} value={provider.phone} />
          )}
          {provider.companyName && provider.companyName !== provider.businessName && (
            <DetailRow
              label={t('providerApply.companyName')}
              value={provider.companyName}
            />
          )}
          <DetailRow
            label={t('admin.detail.accountType')}
            value={
              provider.accountType === 'pessoa_juridica'
                ? t('providerApply.pessoaJuridica')
                : t('providerApply.pessoaFisica')
            }
          />
          {provider.accountType === 'pessoa_fisica' && provider.birthDate && (
            <DetailRow
              label={t('providerApply.birthDate')}
              value={provider.birthDate}
            />
          )}
          {provider.accountType === 'pessoa_juridica' && (
            <>
              {provider.legalRepresentativeName && (
                <DetailRow
                  label={t('providerApply.legalRepresentative')}
                  value={provider.legalRepresentativeName}
                />
              )}
              {provider.taxId && (
                <DetailRow label={t('providerApply.cnpj')} value={provider.taxId} />
              )}
            </>
          )}
          <DetailRow
            label={t('admin.colService')}
            value={provider.services?.map((s) => t(serviceLabel(s))).join(', ')}
          />
          <DetailRow
            label={t('providerApply.documentTypePlaceholder')}
            value={
              provider.documentType
                ? t(`providerApply.docTypes.${provider.documentType}`)
                : '—'
            }
          />
          {(provider.documentImageId || provider.documentFileName) && (
            <DetailRow
              label={t('providerApply.uploadDocument')}
              value={
                provider.documentImageId ? (
                  <DocumentLink
                    imageId={provider.documentImageId}
                    label={provider.documentFileName || provider.documentImageId}
                  />
                ) : (
                  provider.documentFileName || '—'
                )
              }
            />
          )}
          {provider.socialLink && (
            <DetailRow
              label={t('providerApply.socialLink')}
              value={
                <a
                  href={provider.socialLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline break-all"
                >
                  {provider.socialLink}
                </a>
              }
            />
          )}
          {provider.createdAt && (
            <DetailRow
              label={t('admin.detail.submittedAt')}
              value={new Date(provider.createdAt).toLocaleDateString()}
            />
          )}
          <DetailRow
            label={t('admin.colStatus')}
            value={
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusClass(provider.status ?? 'pending')}`}
              >
                {t(`admin.statusLabel.${provider.status ?? 'pending'}`)}
              </span>
            }
          />
        </div>

        {/* Audit log */}
        <div className="px-6 py-4 border-t border-gray-100">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-3">
            {t('admin.detail.auditLog')}
          </h4>
          {auditLoading ? (
            <p className="text-xs text-gray-400">{t('auth.loading')}</p>
          ) : auditLog.length === 0 ? (
            <p className="text-xs text-gray-400">{t('admin.detail.auditEmpty')}</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {auditLog.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 text-xs">
                  <span
                    className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                      entry.action === 'approved' && entry.previousStatus === 'suspended'
                        ? 'bg-green-400'
                        : entry.action === 'approved'
                          ? 'bg-green-500'
                          : entry.action === 'rejected'
                            ? 'bg-red-400'
                            : entry.action === 'suspended'
                              ? 'bg-orange-400'
                              : 'bg-gray-400'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-gray-800">
                        {entry.action === 'approved' && entry.previousStatus === 'suspended'
                          ? t('admin.auditAction.reinstated')
                          : t(`admin.auditAction.${entry.action}`)}
                      </span>
                      <span className="text-gray-400">{t('admin.auditBy', { email: entry.adminEmail })}</span>
                    </div>
                    {entry.notes && (
                      <p className="text-gray-500 mt-0.5 break-all">{entry.notes}</p>
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
          {onReject && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onReject(provider);
              }}
              className="text-[11px] font-bold uppercase tracking-wide text-red-500 hover:text-red-700"
            >
              {t('admin.reject')}
            </button>
          )}
          {onApprove && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onApprove(provider);
              }}
              className="px-4 py-2 rounded bg-primary hover:bg-primary-dark text-white text-[11px] font-bold uppercase tracking-wide"
            >
              {t('admin.approve')}
            </button>
          )}
          {onSuspend && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onSuspend(provider);
              }}
              className="px-4 py-2 rounded bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-bold uppercase tracking-wide"
            >
              {t('admin.suspend')}
            </button>
          )}
          {onUnsuspend && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onUnsuspend(provider);
              }}
              className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white text-[11px] font-bold uppercase tracking-wide"
            >
              {t('admin.unsuspend')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-900 text-right break-all">{value || '—'}</span>
    </div>
  );
}
