import type { NotificationSettings } from '@bull-board/api/typings/app';
import type { CliConfig } from '../config/types';

export function getNotificationSettings(config: CliConfig): NotificationSettings {
  const notifications = config.notifications;
  const discord = notifications?.discord;
  const telegram = notifications?.telegram;
  // Explicitly project public fields. Never serialize provider credentials into UIConfig.
  return {
    enabled: !!notifications,
    prefixes: [...config.prefixes],
    queues: config.queueNames ? [...config.queueNames] : null,
    delivery: notifications
      ? {
          appName: notifications.appName,
          ...(notifications.boardUrl ? { boardUrl: notifications.boardUrl } : {}),
          timeoutMs: notifications.timeoutMs,
          maxAttempts: notifications.maxAttempts,
          retryDelayMs: notifications.retryDelayMs,
          maxPending: notifications.maxPending,
        }
      : null,
    discord: {
      enabled: !!discord,
      webhookConfigured: !!discord,
      ...(discord?.threadId ? { threadId: discord.threadId } : {}),
    },
    telegram: {
      enabled: !!telegram,
      botTokenConfigured: !!telegram,
      ...(telegram ? { chatId: telegram.chatId } : {}),
      ...(telegram?.messageThreadId ? { messageThreadId: telegram.messageThreadId } : {}),
    },
  };
}
