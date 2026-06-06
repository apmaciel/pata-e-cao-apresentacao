import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ptBRTranslation from './locales/pt-BR/translation.json';

i18n
  .use(initReactI18next)
  .init({
    lng: 'pt-BR',
    fallbackLng: 'pt-BR',
    ns: ['translation'],
    defaultNS: 'translation',
    resources: {
      'pt-BR': { translation: ptBRTranslation },
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
