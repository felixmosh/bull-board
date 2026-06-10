# UIConfig

> Applies to: all adapters.

`UIConfig` controls the visual shell of the dashboard: title, logo, favicon, locale, polling, misc links. Pass it via `setUIConfig()` on the server adapter, or forward it through `createBullBoard({ options: { uiConfig } })`.

## Usage

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
  options: {
    uiConfig: {
      boardTitle: 'My Queues',
      boardLogo: {
        path: 'https://cdn.example.com/logo.png',
        width: '120px',
        height: 32,
      },
      miscLinks: [{ text: 'Logout', url: '/logout' }],
      hideRedisDetails: true,
      hideDocsLink: false,
    },
  },
});
```

`serverAdapter.setUIConfig({ ... })` directly works the same way, `createBullBoard` just forwards `options.uiConfig` to it.

## Fields

All fields are optional. Defaults are applied by `createBullBoard` where noted.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `boardTitle` | `string` | `'Bull Dashboard'` | Text in the header and `<title>` tag. |
| `boardLogo.path` | `string` | — | URL or static path to the logo image (required when `boardLogo` is set). |
| `boardLogo.width` | `number \| string` | — | Logo width (px number or CSS length). |
| `boardLogo.height` | `number \| string` | — | Logo height (px number or CSS length). |
| `miscLinks` | `Array<{ text: string; url: string }>` | `[]` | Extra links in the header menu (logout, etc.). |
| `hideDocsLink` | `boolean` | `false` | Hide the header Docs icon that links to the bull-board documentation site. |
| `queueSortOptions` | `Array<{ key: string; label: string }>` | — | Custom sort keys for the queue list. |
| `favIcon.default` | `string` | `'static/images/logo.svg'` | Favicon when the tab is inactive. |
| `favIcon.alternative` | `string` | `'static/favicon-32x32.png'` | Favicon when jobs are active. |
| `locale.lng` | `string` | — | Initial i18next language code (`'en'`, `'fr'`, `'zh_TW'`). |
| `dateFormats.short` | `string` | — | `date-fns` format string for timestamps that fall on today. |
| `dateFormats.common` | `string` | — | `date-fns` format string for timestamps in the current year. |
| `dateFormats.full` | `string` | — | `date-fns` format string for older timestamps. |
| `pollingInterval.showSetting` | `boolean` | — | Whether the polling interval selector shows in Settings. |
| `pollingInterval.forceInterval` | `number` | — | Forces a polling interval in seconds, overriding the user's choice. |
| `menu.width` | `string` | — | CSS width of the left sidebar (`'280px'`). |
| `sortQueues` | `boolean` | `false` | When `true`, sidebar and overview sort queues alphabetically, groups before standalone queues. Users can toggle this in Settings. |
| `hideRedisDetails` | `boolean` | `false` | Hides the Redis Details button in the header. |
| `environment.label` | `string` | — | Environment badge text in the header (`'production'`). |
| `environment.color` | `string` | — | Background colour of the environment badge. |
| `environment.textColor` | `string` | — | Text colour of the environment badge. |
| `environment.fontSize` | `string \| number` | — | Font size of the environment badge. |

![Header with the amber demo environment badge](/screenshots/environment-badge.png)

The demo site uses this exact configuration — `{ label: 'demo', color: '#f59f00', textColor: '#000' }`. <a href="/bull-board/demo/" target="_blank" rel="noopener">See it live ↗</a>.

## Source of truth

The authoritative type is in [`packages/api/typings/app.d.ts`](https://github.com/felixmosh/bull-board/blob/master/packages/api/typings/app.d.ts) (`UIConfig`). Defaults live in [`packages/api/src/index.ts`](https://github.com/felixmosh/bull-board/blob/master/packages/api/src/index.ts).
