import i18n from 'i18next';
import HttpBackend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';
import { languages } from '../constants/languages';

export async function initI18n({ lng, basePath }: { lng: string; basePath: string }) {
  const fallbackLng = 'en-US';
  const supportedLanguage = languages.find((language) => language === lng) || fallbackLng;

  const i18nextInstance = i18n
    .use(initReactI18next) // passes i18n down to react-i18next
    .use(HttpBackend);

  if (process.env.NODE_ENV === 'development') {
    const { HMRPlugin } = await import('i18next-hmr/plugin');
    i18nextInstance.use(new HMRPlugin({ webpack: { client: true } }));
    (window as any).testI18n = (lng = 'cimode') => i18nextInstance.changeLanguage(lng);
  }

  return i18nextInstance.init({
    lng: supportedLanguage,
    fallbackLng,
    defaultNS: 'messages',
    ns: 'messages',
    load: 'currentOnly',
    showSupportNotice: false,
    backend: {
      loadPath: `${basePath}static/locales/{{lng}}/{{ns}}.json`,
      queryParams: { v: process.env.APP_VERSION },
    },
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });
}
