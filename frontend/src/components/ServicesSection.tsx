import { useTranslation } from 'react-i18next';
import '../i18n.config';

const serviceImages: Record<string, string> = {
  hospedagem:  '/services-hospedagem.png',
  passeadores: '/services-passeadores.png',
  adestradores: '/services-adestradores.png',
};

const serviceLinks: Record<string, string> = {
  hospedagem:  '/providers?service=boarding',
  passeadores: '/providers?service=walking',
  adestradores: '/providers?service=training',
};

function ServiceCard({ serviceKey }: { serviceKey: string }) {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">
      <h3 className="font-display font-black text-lg uppercase tracking-widest text-primary-dark text-center">
        {t(`services.${serviceKey}.title`)}
      </h3>

      <div className="w-full aspect-video rounded-xl overflow-hidden bg-gray-100">
        <img
          src={serviceImages[serviceKey]}
          alt={t(`services.${serviceKey}.title`)}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      <p className="text-sm text-gray-700 leading-relaxed flex-1">
        {t(`services.${serviceKey}.description`)}
      </p>

      <a
        href={serviceLinks[serviceKey]}
        className="block text-center bg-primary text-white font-display font-bold text-xs uppercase tracking-widest px-6 py-3 rounded-full hover:bg-primary-dark transition-colors duration-200"
      >
        {t(`services.${serviceKey}.cta`)}
      </a>
    </div>
  );
}

export default function ServicesSection() {
  const { t } = useTranslation();

  return (
    <section className="bg-white py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="font-display font-black text-4xl uppercase tracking-widest text-center text-gray-900 mb-10">
          {t('services.title')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ServiceCard serviceKey="hospedagem" />
          <ServiceCard serviceKey="passeadores" />
          <ServiceCard serviceKey="adestradores" />
        </div>
      </div>
    </section>
  );
}
