import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import th from './locales/th.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      th: { translation: th },
    },
    lng: localStorage.getItem('i18n_lng') || 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
