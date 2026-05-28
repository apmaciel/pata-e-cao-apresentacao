import { useTranslation } from 'react-i18next';
import '../i18n.config';

export default function CTASection() {
  const { t } = useTranslation();

  return (
    <section className="bg-primary-dark py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Owner CTA */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 flex flex-col gap-4 border border-white/20">
            <div className="text-4xl">🐶</div>
            <h2 className="text-2xl font-bold text-white">
              {t('cta.owner.title')}
            </h2>
            <p className="text-green-100 leading-relaxed flex-1">
              {t('cta.owner.description')}
            </p>
            <a
              href="/auth/signup?role=owner"
              className="mt-2 inline-flex items-center justify-center px-6 py-3 bg-accent text-gray-900 font-bold rounded-lg transition-colors duration-200 hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-primary-dark"
            >
              {t('cta.owner.button')}
            </a>
          </div>

          {/* Provider CTA */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 flex flex-col gap-4 border border-white/20">
            <div className="text-4xl">👩‍⚕️</div>
            <h2 className="text-2xl font-bold text-white">
              {t('cta.provider.title')}
            </h2>
            <p className="text-green-100 leading-relaxed flex-1">
              {t('cta.provider.description')}
            </p>
            <a
              href="/auth/signup?role=provider"
              className="mt-2 inline-flex items-center justify-center px-6 py-3 bg-white text-primary-dark font-bold rounded-lg transition-colors duration-200 hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-dark"
            >
              {t('cta.provider.button')}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
