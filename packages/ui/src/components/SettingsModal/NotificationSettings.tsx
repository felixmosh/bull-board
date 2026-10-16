import type { NotificationSettings as Settings } from '@bull-board/api/typings/app';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import s from './NotificationSettings.module.css';

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className={s.row}>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

export const NotificationSettings = ({ settings }: { settings: Settings }) => {
  const { t } = useTranslation();
  const status = (enabled: boolean) =>
    t(enabled ? 'SETTINGS.NOTIFICATIONS.ENABLED' : 'SETTINGS.NOTIFICATIONS.DISABLED');
  const credential = (configured: boolean) =>
    t(
      configured
        ? 'SETTINGS.NOTIFICATIONS.CONFIGURED_HIDDEN'
        : 'SETTINGS.NOTIFICATIONS.NOT_CONFIGURED'
    );
  const { delivery, discord, telegram } = settings;

  return (
    <div className={s.settings}>
      <p className={s.notice}>{t('SETTINGS.NOTIFICATIONS.READ_ONLY')}</p>
      {!settings.enabled && <p className={s.notice}>{t('SETTINGS.NOTIFICATIONS.INACTIVE')}</p>}
      <dl className={s.list}>
        <Row label={t('SETTINGS.NOTIFICATIONS.STATUS')}>{status(settings.enabled)}</Row>
        <Row label={t('SETTINGS.NOTIFICATIONS.TRIGGER')}>
          {t('SETTINGS.NOTIFICATIONS.FINAL_FAILURE')}
        </Row>
        <Row label={t('SETTINGS.NOTIFICATIONS.PREFIXES')}>{settings.prefixes.join(', ')}</Row>
        <Row label={t('SETTINGS.NOTIFICATIONS.QUEUES')}>
          {settings.queues?.join(', ') ?? t('SETTINGS.NOTIFICATIONS.ALL_QUEUES')}
        </Row>
      </dl>

      <h3 className={s.heading}>Discord</h3>
      <dl className={s.list}>
        <Row label={t('SETTINGS.NOTIFICATIONS.STATUS')}>{status(discord.enabled)}</Row>
        <Row label={t('SETTINGS.NOTIFICATIONS.WEBHOOK')}>
          {credential(discord.webhookConfigured)}
        </Row>
        {discord.threadId && (
          <Row label={t('SETTINGS.NOTIFICATIONS.THREAD_ID')}>{discord.threadId}</Row>
        )}
      </dl>

      <h3 className={s.heading}>Telegram</h3>
      <dl className={s.list}>
        <Row label={t('SETTINGS.NOTIFICATIONS.STATUS')}>{status(telegram.enabled)}</Row>
        <Row label={t('SETTINGS.NOTIFICATIONS.BOT_TOKEN')}>
          {credential(telegram.botTokenConfigured)}
        </Row>
        {telegram.chatId && (
          <Row label={t('SETTINGS.NOTIFICATIONS.CHAT_ID')}>{telegram.chatId}</Row>
        )}
        {telegram.messageThreadId && (
          <Row label={t('SETTINGS.NOTIFICATIONS.TOPIC_ID')}>{telegram.messageThreadId}</Row>
        )}
      </dl>

      {delivery && (
        <>
          <h3 className={s.heading}>{t('SETTINGS.NOTIFICATIONS.DELIVERY')}</h3>
          <dl className={s.list}>
            <Row label={t('SETTINGS.NOTIFICATIONS.APP_NAME')}>{delivery.appName}</Row>
            <Row label={t('SETTINGS.NOTIFICATIONS.BOARD_URL')}>
              {delivery.boardUrl ?? t('SETTINGS.NOTIFICATIONS.NOT_CONFIGURED')}
            </Row>
            <Row label={t('SETTINGS.NOTIFICATIONS.TIMEOUT')}>{delivery.timeoutMs} ms</Row>
            <Row label={t('SETTINGS.NOTIFICATIONS.MAX_ATTEMPTS')}>{delivery.maxAttempts}</Row>
            <Row label={t('SETTINGS.NOTIFICATIONS.RETRY_DELAY')}>{delivery.retryDelayMs} ms</Row>
            <Row label={t('SETTINGS.NOTIFICATIONS.MAX_PENDING')}>{delivery.maxPending}</Row>
          </dl>
        </>
      )}
    </div>
  );
};
