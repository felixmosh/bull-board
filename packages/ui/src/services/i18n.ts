import i18n from 'i18next';
import HttpBackend from 'i18next-http-backend';
import * as process from 'process';
import { initReactI18next } from 'react-i18next';

export let dateFnsLocale = undefined;

export async function initI18n({ lng, basePath }: { lng: string; basePath: string }) {
  const i18nextInstance = i18n
    .use(initReactI18next) // passes i18n down to react-i18next
    .use(HttpBackend);

  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { HMRPlugin } = require('i18next-hmr/plugin');
    i18nextInstance.use(new HMRPlugin({ webpack: { client: true } }));
    (window as any).testI18n = (lng = 'cimode') => i18nextInstance.changeLanguage(lng);
  }
  const locale = lng === 'en' ? 'en-US' : lng;
  dateFnsLocale = await import(`date-fns/locale/${locale}/index.js`).catch((e) => console.error(e));
  return i18nextInstance.init({
    lng,
    fallbackLng: 'en',
    defaultNS: 'messages',
    ns: 'messages',
    backend: {
      loadPath: `${basePath}static/locales/{{lng}}/{{ns}}.json`,
      queryParams: { v: process.env.APP_VERSION },
    },
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });
}
