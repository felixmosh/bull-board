import i18n from 'i18next';
import HttpBackend from 'i18next-http-backend';
import * as process from 'process';
import { initReactI18next } from 'react-i18next';

export let dateFnsLocale = undefined;

async function setDateFnsLocale(lng: string) {
  dateFnsLocale = await import(`date-fns/locale/${lng}/index.js`).catch((e) => console.error(e));
}

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

  i18nextInstance.on('languageChanged', (lng) => setDateFnsLocale(lng));
  await setDateFnsLocale(lng);

  return i18nextInstance.init({
    lng,
    fallbackLng: 'en-US',
    defaultNS: 'messages',
    ns: 'messages',
    load: 'currentOnly',
    backend: {
      loadPath: `${basePath}static/locales/{{lng}}/{{ns}}.json`,
      queryParams: { v: process.env.APP_VERSION },
    },
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });
}
