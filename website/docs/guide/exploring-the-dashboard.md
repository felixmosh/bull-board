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

It opens a panel showing how the queue is configured: type, paused state, global concurrency, how many workers are connected, and the default job options (attempts, backoff, retention), so you don't have to dig through code.

![Queue info panel showing the queue overview, including its worker count](/screenshots/queue-info-modal.png)

## Connected workers

A queue with a growing waiting count looks the same whether it is simply busy or whether every worker consuming it has died. The dashboard tells the two apart.

Nothing appears while a queue is healthy. A badge shows up only once a queue has no workers connected and is not paused, on its overview card and beside the status tabs on its own page, so the only thing the dashboard ever spends room on is the case worth acting on. A paused queue is meant to have nothing consuming it, so it never warns.

![Overview cards with one queue reporting no workers](/screenshots/queue-workers-overview.png)

On the queue page it sits with the status tabs, next to the backlog it explains.

![Queue page header showing a backlog of waiting jobs and a no workers warning](/screenshots/queue-workers-queue-page.png)

Who is actually connected lives in the queue info panel, under **Connected workers**, with the count beside global concurrency in the overview. Open it from the info icon next to the queue name, or by clicking the badge, which drops you straight onto that section.

![Queue info panel opened on the connected workers section](/screenshots/queue-workers-modal.png)

Each worker leads with whatever identifies it, which is the name you gave it (`new Worker(queueName, processor, { name: 'mailer-1' })`) or its address when you gave it none, and carries the address and how long it has been connected underneath. The badge only exists while something is wrong, so this panel is how you check on a queue that looks fine.

The list comes from Redis `CLIENT LIST`, which is how both Bull and BullMQ implement `getWorkers()`. Some hosted Redis providers block that command, Google Memorystore among them. There the dashboard says nothing about workers at all, in the badge or the info panel, rather than reporting a queue as having none.

Reporting workers costs one `CLIENT LIST` per queue on every poll. That is cheap on a handful of queues and less so on a board with dozens, so it can be switched off wholesale with `showWorkers: false` in [UIConfig](../configuration/ui-config.md), which stops the requests rather than just hiding the badge.
