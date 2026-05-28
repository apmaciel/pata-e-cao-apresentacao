import { useTranslation } from 'react-i18next';
import '../i18n.config';

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="bg-footer py-8 px-4">
      <div className="max-w-4xl mx-auto text-center space-y-2">
        <p className="text-white/90 text-sm">
          {t('footer.copyright')}
        </p>
        <p className="text-white/70 text-sm">
          {t('footer.contact')}
        </p>
      </div>
    </footer>
  );
}
