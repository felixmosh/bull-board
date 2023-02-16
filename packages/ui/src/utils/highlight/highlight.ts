import { nanoid } from 'nanoid';

const isWebworkerSupported = typeof window.Worker !== 'undefined';
let highlightWorker: Worker | null = null;
const messageQueue = new Map<string, { resolve: any; reject: any }>();

export async function asyncHighlight(code: string, language: string): Promise<string> {
  if (isWebworkerSupported) {
    if (!highlightWorker) {
      highlightWorker = new Worker(
        /* webpackChunkName: "highlight-worker" */ new URL('./worker.ts', import.meta.url)
      );
      highlightWorker.onmessage = ({ data }) => {
        const { id, code } = data;
        if (messageQueue.has(id)) {
          const { resolve } = messageQueue.get(id) as any;
          resolve(code);
        }
      };
    }

    return new Promise((resolve, reject) => {
      const messageId = nanoid(5);
      highlightWorker?.postMessage({ id: messageId, code, language });
      messageQueue.set(messageId, {
        resolve: (formattedCode: string) => {
          messageQueue.delete(messageId);
          resolve(formattedCode);
        },
        reject: () => {
          messageQueue.delete(messageId);
          reject();
        },
      });
      setTimeout(() => reject(), 60 * 1000);
    });
  } else {
    const { highlighter } = await import(
      /* webpackChunkName: "highlight" */
      /* webpackMode: "lazy-once" */
      /* webpackPreload: true */
      './config'
    );

    return highlighter.highlightAuto(code, [language]).value || '';
  }
}
