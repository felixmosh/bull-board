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
      miscLinks: [{ text: 'Logout', url: '/logout', icon: '/static/logout.svg' }],
      hideRedisDetails: true,
      showMetrics: true,
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
| `miscLinks` | `Array<{ text: string; url: string; icon?: string }>` | `[]` | Extra links in the header menu (logout, etc.). `icon` is an optional URL or static path to an image shown before the link text; it is rendered as-is, so pick one that reads on both the light and dark dropdown background. |
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
| `overview.groupByDelimiter` | `boolean` | `false` | Sets the initial overview view. When `true`, it starts grouped: collapsible category sections derived from each queue's `delimiter`, mirroring the sidebar tree. It's only a default. Once a user picks flat or grouped in Settings, their choice is remembered and wins. See [Exploring the dashboard](../guide/exploring-the-dashboard.md). |
| `sortQueues` | `boolean` | `false` | When `true`, sidebar and overview sort queues alphabetically, groups before standalone queues. Users can toggle this in Settings. |
| `hideRedisDetails` | `boolean` | `false` | Hides the Redis Details button in the header. |
| `showMetrics` | `boolean` | `false` | Shows a per-queue throughput chart (completed/failed per minute). Relies on [BullMQ/Bull metrics collection](https://docs.bullmq.io/guide/metrics) — enable `metrics` on your workers (e.g. `metrics: { maxDataPoints: MetricsTime.ONE_WEEK }`). |
| `showWorkers` | `boolean` | `true` | Reports the workers connected to each queue, and warns when a queue that isn't paused has none. Set to `false` to drop the per-queue `CLIENT LIST` the board otherwise runs on every poll. See [Exploring the dashboard](../guide/exploring-the-dashboard.md). |
| `environment.label` | `string` | — | Environment badge text in the header (`'production'`). |
| `environment.color` | `string` | — | Background colour of the environment badge. |
| `environment.textColor` | `string` | — | Text colour of the environment badge. |
| `environment.fontSize` | `string \| number` | — | Font size of the environment badge. |
| `theme.light` | `Partial<Record<ThemeTokenName, string>>` | — | Design token overrides applied to the light theme. See [Theming](#theming). |
| `theme.dark` | `Partial<Record<ThemeTokenName, string>>` | — | Design token overrides applied to the dark theme. |

With `showMetrics` on, each queue view gains a throughput chart of completed and failed jobs per minute over the last hour.

![Per-queue throughput chart showing completed and failed jobs per minute](/screenshots/queue-metrics.png)

![Header with the amber demo environment badge](/screenshots/environment-badge.png)

The demo site uses this exact configuration — `{ label: 'demo', color: '#f59f00', textColor: '#000' }`. <a href="/bull-board/demo/" target="_blank" rel="noopener">See it live</a>.

## Theming

The dashboard is styled entirely from CSS custom properties, and `theme` lets you override
them per colour scheme without forking the UI. Token names follow the
[shadcn theme contract](https://ui.shadcn.com/themes), so palettes generated by
shadcn-compatible theme editors drop straight in.

```ts
uiConfig: {
  theme: {
    light: {
      primary: '#6d28d9',
      radius: '0.75rem',
      'font-sans': "'Inter', system-ui, sans-serif",
    },
    dark: {
      primary: '#a78bfa',
    },
  },
}
```

That is a whole rebrand. `primary` is the one token the rest of the interactive palette hangs
off: the focus ring, the sidebar's active entry and its ring all resolve to it, and hover and
selection are mixed from it at 8%, 16% and 24%. Setting it moves every one of them together.
The same holds elsewhere: `foreground` carries the text colour on cards and popovers, and the
`chart-1` to `chart-5` ramp resolves to the job status colours the board plots, so recolouring
`status-completed` recolours the completed series with it.

Each derived name is still individually overridable, and an override wins over the
derivation. Set `ring` when you want a focus ring that is not your brand colour; leave it out
when you don't.

Every key is optional, and anything you leave out keeps the shipped value. The available
tokens are the core surface and interaction set (`background`, `foreground`, `card`,
`card-foreground`, `popover`, `popover-foreground`, `primary`, `primary-foreground`,
`secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `accent`,
`accent-foreground`, `destructive`, `destructive-foreground`, `border`, `input`, `ring`,
`radius`), the typography tokens (`font-sans`, `font-mono`), the sidebar set
(`sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-primary-foreground`,
`sidebar-accent`, `sidebar-accent-foreground`, `sidebar-border`, `sidebar-ring`),
the chart ramp (`chart-1` through `chart-5`), and the job status colours
(`status-failed`, `status-completed`, `status-waiting`, `status-waiting-children`,
`status-prioritized`, `status-active`, `status-delayed`, `status-paused`).

The interaction states are tokens too: `state-hover`, `state-selected`, `state-selected-hover`
and `state-selected-foreground`, plus their `sidebar-state-*` counterparts. They are mixed from
`primary` and `sidebar-primary`, so set them only if you want a hovered or selected control to
sit somewhere other than 8%, 16% and 24% of your brand colour.

Values are plain CSS values. Unknown token names and values containing `;`, `{`, `}`, `<`
or `>` are dropped, so a theme can never inject arbitrary CSS or markup into the page.

## Source of truth

The authoritative type is in [`packages/api/typings/app.d.ts`](https://github.com/felixmosh/bull-board/blob/master/packages/api/typings/app.d.ts) (`UIConfig`). Defaults live in [`packages/api/src/index.ts`](https://github.com/felixmosh/bull-board/blob/master/packages/api/src/index.ts).
