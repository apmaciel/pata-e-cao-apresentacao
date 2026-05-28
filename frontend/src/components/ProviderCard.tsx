import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiMapPin, FiCheckCircle, FiMail, FiMessageCircle, FiExternalLink } from 'react-icons/fi';
import { serviceLabel } from '../utils/adminHelpers';
import { API_URL } from '../utils/config';
import '../i18n.config';

interface ProviderCardProps {
  id: string;
  businessName: string;
  location?: string;
  services: string[];
  logoImageId?: string;
  isVerified?: boolean;
  acceptsDogs?: boolean;
  acceptsCats?: boolean;
  acceptsNeutered?: boolean;
  acceptsIntact?: boolean;
  email?: string;
  phone?: string;
  whatsapp?: string;
}

export default function ProviderCard({
  id,
  businessName,
  location,
  services,
  logoImageId,
  isVerified = false,
  acceptsDogs,
  acceptsCats,
  acceptsNeutered,
  acceptsIntact,
  email,
  phone,
  whatsapp,
}: ProviderCardProps) {
  const { t } = useTranslation();
  const [contactOpen, setContactOpen] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);
  const hasContact = !!(email || phone || whatsapp);

  const handleContactToggle = () => {
    if (!contactOpen) {
      setTimeout(() => {
        const handler = (e: MouseEvent) => {
          if (!contactRef.current || !contactRef.current.contains(e.target as Node)) {
            setContactOpen(false);
            document.removeEventListener('mousedown', handler);
          }
        };
        document.addEventListener('mousedown', handler);
      }, 0);
    }
    setContactOpen((v) => !v);
  };

  return (
    <div className="card flex flex-col gap-4 group hover:border-primary border border-transparent transition-all duration-200">
      {/* Logo / Header */}
      <a href={`/providers/detail?id=${id}`} className="no-underline">
        <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
          {logoImageId ? (
            <img
              src={`${API_URL}/api/images/${logoImageId}`}
              alt={businessName}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary font-bold text-xl">
              {businessName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900 truncate group-hover:text-primary-dark transition-colors duration-200">
              {businessName}
            </h3>
            {isVerified && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary-dark flex-shrink-0">
                <FiCheckCircle className="w-3 h-3" />
                {t('providers.verified')}
              </span>
            )}
          </div>

          {location && (
            <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
              <FiMapPin className="w-3.5 h-3.5" />
              {location}
            </p>
          )}
        </div>
      </div>
      </a>

      {/* Services */}
      {services && services.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {services.slice(0, 4).map((service) => (
            <span
              key={service}
              className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full"
            >
              {t(serviceLabel(service))}
            </span>
          ))}
          {services.length > 4 && (
            <span className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">
              +{services.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Pet acceptance tags */}
      {(acceptsDogs || acceptsCats || acceptsNeutered || acceptsIntact) && (
        <div className="flex flex-wrap gap-1.5">
          {acceptsDogs && (
            <span className="px-2.5 py-1 text-xs font-semibold bg-tag-dogs text-white rounded-full">
              🐕 {t('providerProfile.dogs')}
            </span>
          )}
          {acceptsCats && (
            <span className="px-2.5 py-1 text-xs font-semibold bg-tag-cats text-white rounded-full">
              🐈 {t('providerProfile.cats')}
            </span>
          )}
          {acceptsNeutered && (
            <span className="px-2.5 py-1 text-xs font-semibold bg-tag-castrated text-white rounded-full">
              {t('providerProfile.neutered')}
            </span>
          )}
          {acceptsIntact && (
            <span className="px-2.5 py-1 text-xs font-semibold bg-tag-notCastrated text-white rounded-full">
              {t('providerProfile.intact')}
            </span>
          )}
        </div>
      )}

      {/* Verified badge */}
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">
          <FiCheckCircle className="w-3.5 h-3.5" />
          {t('providers.verified')}
        </span>
      </div>

      {/* Action buttons — inferior part of the card */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        {hasContact && (
          <div className="relative" ref={contactRef}>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); handleContactToggle(); }}
              className="flex-1 px-3 py-2 text-xs font-display font-bold uppercase tracking-wide bg-primary/10 text-primary-dark rounded-lg hover:bg-primary/20 transition-colors"
            >
              {t('providerProfile.getInTouch')}
            </button>
            {contactOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
                <div className="p-1.5 space-y-0.5">
                  {email && (
                    <a
                      href={`mailto:${email}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-footer text-xs font-medium"
                    >
                      <FiMail className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="truncate">{email}</span>
                    </a>
                  )}
                  {(phone || whatsapp) && (
                    <a
                      href={`https://wa.me/${(phone || whatsapp || '').replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-green-50 transition-colors text-footer text-xs font-medium"
                    >
                      <FiMessageCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span>{phone || whatsapp}</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <a
          href={`/providers/detail?id=${id}`}
          className="flex-1 px-3 py-2 text-xs font-display font-bold uppercase tracking-wide bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-center"
        >
          <FiExternalLink className="w-3.5 h-3.5 inline mr-1.5" />
          {t('providerProfile.seeDetails')}
        </a>
      </div>
    </div>
  );
}
