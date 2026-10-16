import { resolveConfig } from '../src/config/resolve';

const discord = {
  BULL_BOARD_NOTIFICATIONS_ENABLED: 'true',
  BULL_BOARD_DISCORD_ENABLED: 'true',
  BULL_BOARD_DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/secret',
};
const resolve = (env: NodeJS.ProcessEnv) => resolveConfig({ flags: {}, env, file: {} });

describe('notification environment configuration', () => {
  it('is opt-in and ignores stale credentials while disabled', () => {
    expect(resolve({}).notifications).toBeNull();
    expect(
      resolve({ ...discord, BULL_BOARD_NOTIFICATIONS_ENABLED: 'false' }).notifications
    ).toBeNull();
  });

  it('resolves enabled channels and bounded delivery defaults', () => {
    expect(resolve(discord).notifications).toEqual({
      appName: 'bull-board',
      timeoutMs: 10000,
      maxAttempts: 3,
      retryDelayMs: 1000,
      maxPending: 200,
      discord: { webhookUrl: discord.BULL_BOARD_DISCORD_WEBHOOK_URL },
      telegram: null,
    });
  });

  it('supports both channels, negative chat IDs and threads', () => {
    expect(
      resolve({
        ...discord,
        BULL_BOARD_DISCORD_THREAD_ID: '123',
        BULL_BOARD_TELEGRAM_ENABLED: '1',
        BULL_BOARD_TELEGRAM_BOT_TOKEN: '123:secret',
        BULL_BOARD_TELEGRAM_CHAT_ID: '-100123',
        BULL_BOARD_TELEGRAM_MESSAGE_THREAD_ID: '42',
        BULL_BOARD_NOTIFICATION_APP_NAME: 'Production',
        BULL_BOARD_NOTIFICATION_MAX_PENDING: '10',
        BULL_BOARD_NOTIFICATION_TIMEOUT_MS: '500',
        BULL_BOARD_NOTIFICATION_MAX_ATTEMPTS: '2',
        BULL_BOARD_NOTIFICATION_RETRY_DELAY_MS: '50',
      }).notifications
    ).toMatchObject({
      appName: 'Production',
      maxPending: 10,
      timeoutMs: 500,
      maxAttempts: 2,
      retryDelayMs: 50,
      discord: { threadId: '123' },
      telegram: { botToken: '123:secret', chatId: '-100123', messageThreadId: 42 },
    });
  });

  it('normalizes a public board URL including a reverse-proxy base path', () => {
    expect(
      resolve({
        ...discord,
        BULL_BOARD_NOTIFICATION_BOARD_URL: ' https://queues.example.com/ops/board/ ',
      }).notifications
    ).toMatchObject({ boardUrl: 'https://queues.example.com/ops/board' });
    expect(
      resolve({ ...discord, BULL_BOARD_NOTIFICATION_BOARD_URL: '' }).notifications?.boardUrl
    ).toBeUndefined();
  });

  it.each([
    'javascript:alert(1)',
    'https://queues.example.com/board?',
    'https://queues.example.com/board#',
    'ftp://queues.example.com',
    'https://admin:secret@queues.example.com',
    'https://queues.example.com/?token=secret',
    'https://queues.example.com/#secret',
    'https://queues.example.com/' + 'x'.repeat(1500),
  ])('rejects unsafe board URLs without echoing their values', (url) => {
    expect(() => resolve({ ...discord, BULL_BOARD_NOTIFICATION_BOARD_URL: url })).toThrow(
      'BULL_BOARD_NOTIFICATION_BOARD_URL'
    );
    try {
      resolve({ ...discord, BULL_BOARD_NOTIFICATION_BOARD_URL: url });
    } catch (e) {
      expect((e as Error).message).not.toMatch(/secret|queues\.example/);
    }
  });

  it.each([
    { BULL_BOARD_NOTIFICATIONS_ENABLED: 'yes' },
    { ...discord, BULL_BOARD_DISCORD_ENABLED: 'typo' },
    { BULL_BOARD_NOTIFICATIONS_ENABLED: 'true' },
    { ...discord, BULL_BOARD_DISCORD_WEBHOOK_URL: '' },
    { ...discord, BULL_BOARD_DISCORD_WEBHOOK_URL: 'http://discord.com/api/webhooks/123/secret' },
    { ...discord, BULL_BOARD_DISCORD_WEBHOOK_URL: 'https://evil.example/api/webhooks/123/secret' },
    { ...discord, BULL_BOARD_DISCORD_WEBHOOK_URL: 'https://discord.com/other' },
    { ...discord, BULL_BOARD_TELEGRAM_ENABLED: 'true' },
    { ...discord, BULL_BOARD_NOTIFICATION_MAX_PENDING: '0' },
    { ...discord, BULL_BOARD_NOTIFICATION_MAX_PENDING: '100001' },
    { ...discord, BULL_BOARD_NOTIFICATION_MAX_ATTEMPTS: '1.5' },
    { ...discord, BULL_BOARD_NOTIFICATION_TIMEOUT_MS: 'NaN' },
    {
      ...discord,
      BULL_BOARD_TELEGRAM_ENABLED: 'true',
      BULL_BOARD_TELEGRAM_BOT_TOKEN: '123:secret',
      BULL_BOARD_TELEGRAM_CHAT_ID: '-123',
      BULL_BOARD_TELEGRAM_MESSAGE_THREAD_ID: '-1',
    },
  ])('rejects invalid settings without echoing secrets', (env) => {
    expect(() => resolve(env)).toThrow(/BULL_BOARD_/);
    try {
      resolve(env);
    } catch (error) {
      expect((error as Error).message).not.toMatch(/secret|evil\.example/);
    }
  });
});
