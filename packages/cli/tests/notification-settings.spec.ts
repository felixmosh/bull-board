import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import request from 'supertest';
import { resolveConfig } from '../src/config/resolve';
import { getNotificationSettings } from '../src/notifications/settings';
import { startServer } from '../src/server';

const resolve = (enabled = true) =>
  resolveConfig({
    flags: {},
    file: {},
    env: {
      BULL_BOARD_PORT: '0',
      BULL_BOARD_BASE_PATH: '/board',
      BULL_BOARD_PREFIX: 'bull,production',
      BULL_BOARD_QUEUES: 'emails,payments',
      BULL_BOARD_USER: 'admin',
      BULL_BOARD_PASSWORD: 'password-secret',
      BULL_BOARD_NOTIFICATIONS_ENABLED: String(enabled),
      BULL_BOARD_DISCORD_ENABLED: 'true',
      BULL_BOARD_DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/webhook-secret',
      BULL_BOARD_DISCORD_THREAD_ID: '321',
      BULL_BOARD_TELEGRAM_ENABLED: 'true',
      BULL_BOARD_TELEGRAM_BOT_TOKEN: '123:telegram-secret',
      BULL_BOARD_TELEGRAM_CHAT_ID: '-100123',
      BULL_BOARD_TELEGRAM_MESSAGE_THREAD_ID: '42',
      BULL_BOARD_NOTIFICATION_APP_NAME: 'Production',
      BULL_BOARD_NOTIFICATION_BOARD_URL: 'https://queues.example.com/board',
    },
  });

test('projects only the active non-secret notification settings', () => {
  const settings = getNotificationSettings(resolve());
  expect(settings).toEqual({
    enabled: true,
    prefixes: ['bull', 'production'],
    queues: ['emails', 'payments'],
    delivery: {
      appName: 'Production',
      boardUrl: 'https://queues.example.com/board',
      timeoutMs: 10000,
      maxAttempts: 3,
      retryDelayMs: 1000,
      maxPending: 200,
    },
    discord: { enabled: true, webhookConfigured: true, threadId: '321' },
    telegram: { enabled: true, botTokenConfigured: true, chatId: '-100123', messageThreadId: 42 },
  });
  expect(JSON.stringify(settings)).not.toMatch(
    /webhook-secret|telegram-secret|password-secret|webhooks\//
  );
});

test('reports disabled delivery without inventing active configuration', () => {
  const settings = getNotificationSettings(resolve(false));
  expect(settings).toMatchObject({
    enabled: false,
    delivery: null,
    discord: { enabled: false },
    telegram: { enabled: false },
  });
});

test('serves the safe snapshot behind existing authentication, without credentials in HTML', async () => {
  const config = resolve();
  const adapter = new ExpressAdapter();
  adapter.setBasePath(config.basePath);
  createBullBoard({
    queues: [],
    serverAdapter: adapter,
    options: {
      uiConfig: {
        ...config.uiConfig,
        notificationSettings: getNotificationSettings(config),
      },
    },
  });
  const server = await startServer(config, { serverAdapter: adapter });
  try {
    expect((await request(server.app).get('/board')).status).toBe(401);
    const response = await request(server.app).get('/board/').auth('admin', 'password-secret');
    expect(response.status).toBe(200);
    expect(response.text).toContain('notificationSettings');
    expect(response.text).toContain('Production');
    expect(response.text).not.toMatch(/webhook-secret|telegram-secret|password-secret|webhooks\//);
  } finally {
    await server.close();
  }
});
