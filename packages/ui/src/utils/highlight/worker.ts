import { highlighter } from './config';

self.onmessage = ({ data = {} }) => {
  const { id = '', code = '', language = '' } = data;
  if (!id || !code || !language) {
    return;
  }

  const resp = highlighter.highlightAuto(code, [language]);

  self.postMessage({ code: resp.value, id });
};
