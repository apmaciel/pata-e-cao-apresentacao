import { useTranslation } from 'react-i18next';
import { FiShield, FiHeart, FiStar, FiCalendar } from 'react-icons/fi';

interface Feature {
  key: string;
  icon: JSX.Element;
}

const iconClass = 'w-8 h-8';

const FEATURES: Feature[] = [
  { key: 'verified', icon: <FiShield className={iconClass} /> },
  { key: 'healthRecords', icon: <FiHeart className={iconClass} /> },
  { key: 'trust', icon: <FiStar className={iconClass} /> },
  { key: 'booking', icon: <FiCalendar className={iconClass} /> },
];

const ICON_COLORS = [
  'text-primary bg-primary/10',
  'text-rose-500 bg-rose-50',
  'text-amber-500 bg-amber-50',
  'text-blue-500 bg-blue-50',
];

export default function FeatureCards() {
  const { t } = useTranslation();

  return (
    <section className="bg-white py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary-dark">
            {t('features.title')}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map(({ key, icon }, idx) => (
            <div
              key={key}
              className="card flex flex-col items-start gap-4 hover:scale-[1.02] transition-transform duration-200"
            >
              <div className={`p-3 rounded-xl ${ICON_COLORS[idx]}`}>
                {icon}
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900 mb-2">
                  {t(`features.${key}.title`)}
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {t(`features.${key}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
