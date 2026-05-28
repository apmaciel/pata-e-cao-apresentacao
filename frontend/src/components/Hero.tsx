import { useTranslation } from 'react-i18next';
import '../i18n.config';

export default function Hero() {
  const { t } = useTranslation();

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-cream via-cream to-primary-light/30 pt-24 pb-20 md:pt-32 md:pb-28">
      {/* Decorative paw prints */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <PawPrint className="absolute top-12 left-8 text-primary/10 w-16 h-16 rotate-12" />
        <PawPrint className="absolute top-32 right-16 text-accent/20 w-12 h-12 -rotate-6" />
        <PawPrint className="absolute bottom-20 left-1/4 text-primary/8 w-20 h-20 rotate-45" />
        <PawPrint className="absolute bottom-10 right-8 text-primary-light/30 w-14 h-14 -rotate-20" />
        <PawPrint className="absolute top-1/2 left-4 text-accent/10 w-10 h-10 rotate-30" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex items-center gap-2 bg-white/70 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-medium text-primary-dark mb-6 shadow-sm">
          <span>🐾</span>
          <span>PATA &amp; CÃO</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-primary-dark leading-tight tracking-tight mb-6">
          {t('hero.title')}
        </h1>

        <p className="text-lg sm:text-xl text-gray-700 max-w-2xl mx-auto mb-10 leading-relaxed">
          {t('hero.subtitle')}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="/auth/signup"
            className="w-full sm:w-auto btn-primary text-lg px-8 py-4 shadow-md hover:shadow-lg"
          >
            {t('hero.cta')}
          </a>
          <a
            href="/providers"
            className="w-full sm:w-auto btn-secondary text-lg px-8 py-4"
          >
            {t('hero.ctaSecondary')}
          </a>
        </div>

        {/* Trust indicators */}
        <div className="mt-14 flex flex-wrap justify-center gap-8 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span className="text-primary">✓</span>
            <span>Prestadores verificados</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-primary">✓</span>
            <span>Avaliações reais</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-primary">✓</span>
            <span>Agendamento online</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function PawPrint({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Paw pad */}
      <ellipse cx="50" cy="68" rx="22" ry="18" />
      {/* Toes */}
      <ellipse cx="22" cy="46" rx="10" ry="13" />
      <ellipse cx="38" cy="36" rx="10" ry="13" />
      <ellipse cx="62" cy="36" rx="10" ry="13" />
      <ellipse cx="78" cy="46" rx="10" ry="13" />
    </svg>
  );
}
