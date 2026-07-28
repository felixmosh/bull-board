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

Both times link to the job behind them when there is one to open. The next run always links, since that job is sitting in the delayed set waiting to be picked up, which is also how you can inspect its payload or promote it. The last run links only when the job it produced still exists and the dashboard can name it, which means interval schedules whose previous run has not been trimmed away by `removeOnComplete`. Naming the previous run of a cron schedule would mean parsing the pattern backwards, so those show the time alone.

Each row can be removed, which stops the schedule and its pending run together, or edited to change the cron pattern, interval, time zone, run limit or end date. Editing only rewrites the schedule: the job the scheduler produces keeps the name, data and options your application registered. Both actions respect `readOnlyMode`, and editing is unavailable on legacy Bull queues, which have no way to update a repeatable job in place.

### These are operational changes, not configuration

Most applications register their schedulers on start, and `upsertJobScheduler` overrides whatever is stored. So a schedule you edit here lasts until the next deploy or restart, at which point your application's own definition wins again, and a scheduler you remove comes back the same way. That makes the view a good place to stop a misbehaving cron or move it a few hours while you fix the job, and a poor place to make a change you expect to keep. Change the code for that.

The exception is a scheduler your application created dynamically and never re-registers, for a single tenant say. Nothing brings that one back, so removing it is permanent. bull-board cannot tell the two apart, which is why the confirmation says the runs stop until the application registers the scheduler again rather than promising either outcome.

Removing a scheduler takes its pending run with it. Completed and failed runs from the past stay where they are, and a run already being processed finishes normally.

Opening a queue that has schedulers shows a link into the same view, filtered to that queue.

## Queue info

Open any queue and click the info icon next to its name.

![Queue detail with the info icon next to the queue name](/screenshots/queue-detail-info-icon.png)

It opens a panel showing how the queue is configured: type, paused state, global concurrency, and the default job options (attempts, backoff, retention), so you don't have to dig through code.

![Queue info panel showing overview and default job options](/screenshots/queue-info-modal.png)
