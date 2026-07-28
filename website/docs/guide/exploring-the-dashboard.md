# Exploring the dashboard

A tour of how the dashboard is laid out and the controls you'll use day to day: grouped queues, the collapsible sidebar, search, and the per-queue info panel.

## Grouping queues by category

When a queue name contains a delimiter, bull-board splits it into a path. A queue named `Emails.Transactional.Welcome` registered with `{ delimiter: '.' }` becomes `Emails › Transactional › Welcome`. The sidebar has always shown this as a tree; the main overview can now show the same structure.

![Grouped overview with category sections and per-group counts](/screenshots/grouped-overview.png)

Each category header rolls up the job counts of every queue beneath it, so you can read the health of a whole domain — say, all of `Payments` — without expanding it. Queues with no delimiter stay as plain cards.

Switch between the flat card grid and the grouped view from **Settings → Queues → Group queues by category**. Expand or collapse every section at once with the chevrons in the overview toolbar, and pause or resume a whole category from its header.

To make grouped the starting view for everyone, set it in `UIConfig`. This is only the default: once a user switches it in Settings, their choice is remembered and overrides the config on the next load.

```ts
createBullBoard({
  queues: [
    new BullMQAdapter(welcomeEmails, { delimiter: '.' }),
    new BullMQAdapter(receiptEmails, { delimiter: '.' }),
  ],
  serverAdapter,
  options: {
    uiConfig: {
      overview: { groupByDelimiter: true },
    },
  },
});
```

Each view remembers which sections you collapsed, independently of the sidebar.

## Collapsing the sidebar

The toggle in the top-left of the header hides the sidebar and gives the content the full width — handy on smaller screens or when you're working inside a single queue. The state is saved to your browser, so the dashboard reopens the way you left it.

![Overview with the sidebar collapsed](/screenshots/sidebar-collapsed.png)

## Searching

The filter box at the top of the sidebar matches queues by name and drives both the sidebar tree and the overview at once. Press `⌘K` (or `Ctrl K`) anywhere to jump straight to it — if the sidebar is collapsed, it opens first.

## Schedulers

Queues that register job schedulers get a **Schedulers** entry in the sidebar. It lists every scheduler the board can see, across all queues, with its cron pattern or interval, when it fires next, when it last ran, and how many times it has run.

![Schedulers view listing schedulers from several queues with their schedule, next run and last run](/screenshots/schedulers-page.png)

Last run is not something BullMQ stores. It is read from the pending run of each schedule, which the worker creates as the previous run starts, so a scheduler that has never fired leaves the column empty.

Each row can be removed, which stops the schedule and its pending run together, or edited to change the cron pattern, interval, time zone, run limit or end date. Editing only rewrites the schedule: the job the scheduler produces keeps the name, data and options your application registered. Both actions respect `readOnlyMode`, and editing is unavailable on legacy Bull queues, which have no way to update a repeatable job in place.

Opening a queue that has schedulers shows a link into the same view, filtered to that queue.

## Queue info

Open any queue and click the info icon next to its name.

![Queue detail with the info icon next to the queue name](/screenshots/queue-detail-info-icon.png)

It opens a panel showing how the queue is configured: type, paused state, global concurrency, and the default job options (attempts, backoff, retention), so you don't have to dig through code.

![Queue info panel showing overview and default job options](/screenshots/queue-info-modal.png)
