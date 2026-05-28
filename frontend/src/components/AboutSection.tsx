import { useTranslation } from 'react-i18next';
import '../i18n.config';

export default function AboutSection() {
  const { t } = useTranslation();

  return (
    <section id="sobre" className="bg-cream py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <h2 className="font-display font-black text-4xl uppercase tracking-widest text-center text-gray-900 mb-10">
          {t('about.title')}
        </h2>

        <div className="bg-cream-tan/60 rounded-3xl p-8 md:p-12">
          <h3 className="font-display font-bold text-xl text-gray-900 mb-6 text-center">
            {t('about.subtitle')}
          </h3>
          <div className="space-y-5 text-gray-800 leading-relaxed text-base">
            <p>{t('about.p1')}</p>
            <p>{t('about.p2')}</p>
            <p>{t('about.p3')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
