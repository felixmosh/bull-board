// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import hljs from 'highlight.js/lib/core';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import json from 'highlight.js/lib/languages/json';
import { stacktraceJS } from './languages/stacktrace';

hljs.registerLanguage('json', json);
hljs.registerLanguage('stacktrace', stacktraceJS);

export const highlighter = hljs;
