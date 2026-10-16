import type { NotificationConfig } from './config';
import { discordPayload, telegramPayload, type FailureMessage } from './format';

export type Channel = 'discord' | 'telegram';
export type SendResult =
  | { kind: 'sent' }
  | { kind: 'permanent'; code: string }
  | { kind: 'retryable'; code: string; retryAfterMs?: number };

class ResponseTooLarge extends Error {}

async function readBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) throw new ResponseTooLarge();
      chunks.push(value);
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function seconds(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  return value !== null && value !== '' && Number.isFinite(number) && number >= 0
    ? number * 1000
    : undefined;
}

export async function sendNotification(
  config: NotificationConfig,
  channel: Channel,
  message: FailureMessage,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch
): Promise<SendResult> {
  let url: string;
  let body: object;
  if (channel === 'discord' && config.discord) {
    const target = new URL(config.discord.webhookUrl);
    target.searchParams.set('wait', 'true');
    if (config.discord.threadId) target.searchParams.set('thread_id', config.discord.threadId);
    url = target.toString();
    body = discordPayload(message);
  } else if (channel === 'telegram' && config.telegram) {
    url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
    body = {
      chat_id: config.telegram.chatId,
      ...telegramPayload(message),
      ...(config.telegram.messageThreadId
        ? { message_thread_id: config.telegram.messageThreadId }
        : {}),
    };
  } else {
    return { kind: 'permanent', code: 'CHANNEL_DISABLED' };
  }

  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
      redirect: 'error',
    });
  } catch {
    return { kind: 'retryable', code: signal.aborted ? 'ABORTED' : 'NETWORK_ERROR' };
  }
  let data: {
    ok?: boolean;
    error_code?: number;
    retry_after?: number;
    parameters?: { retry_after?: number };
  } = {};
  try {
    const text = await readBody(response);
    if (text) {
      try {
        data = JSON.parse(text) ?? {};
      } catch {
        /* Non-JSON error bodies are classified by status. */
      }
    }
  } catch (error) {
    return error instanceof ResponseTooLarge
      ? { kind: 'permanent', code: 'INVALID_RESPONSE' }
      : { kind: 'retryable', code: signal.aborted ? 'ABORTED' : 'NETWORK_ERROR' };
  }
  const status =
    channel === 'telegram' && data.ok === false && Number.isInteger(data.error_code)
      ? data.error_code!
      : response.status;
  if (status === 429) {
    const header = response.headers.get('retry-after');
    const headerDelay =
      header === null
        ? undefined
        : (seconds(header) ?? Math.max(0, Date.parse(header) - Date.now()));
    const hints = [
      headerDelay,
      seconds(data.retry_after),
      seconds(data.parameters?.retry_after),
    ].filter((value): value is number => value !== undefined && Number.isFinite(value));
    return {
      kind: 'retryable',
      code: 'HTTP_429',
      ...(hints.length ? { retryAfterMs: Math.max(...hints) } : {}),
    };
  }
  if (status >= 500) return { kind: 'retryable', code: `HTTP_${status}` };
  if (status < 200 || status >= 300) return { kind: 'permanent', code: `HTTP_${status}` };
  if (channel === 'telegram' && data.ok !== true)
    return { kind: 'permanent', code: 'INVALID_RESPONSE' };
  return { kind: 'sent' };
}
