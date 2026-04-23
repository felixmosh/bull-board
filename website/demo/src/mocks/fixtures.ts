import { faker } from '@faker-js/faker';
import { addMinutes, subMinutes, subSeconds } from 'date-fns';
import {
  DemoJob,
  DemoQueue,
  DemoState,
  Status,
  nextJobId,
} from './state';

faker.seed(424242);

type JobState = Exclude<Status, 'latest'>;

interface QueueSpec {
  name: string;
  displayName?: string;
  description?: string;
  type?: 'bull' | 'bullmq';
  readOnlyMode?: boolean;
  isPaused?: boolean;
  globalConcurrency?: number | null;
  jobCount: number;
  jobNames: string[];
  buildData: () => Record<string, unknown>;
  // If set, each job gets an externalUrl produced from its data.
  externalUrl?: (data: Record<string, unknown>) => DemoJob['externalUrl'];
}

const queueSpecs: QueueSpec[] = [
  {
    name: 'emails:welcome',
    displayName: 'Welcome emails',
    description: 'Triggered on signup completion — onboarding drip.',
    jobCount: 140,
    jobNames: ['send-welcome', 'send-verification', 'send-tips'],
    buildData: () => ({
      to: faker.internet.email(),
      userId: faker.string.uuid(),
      firstName: faker.person.firstName(),
      template: faker.helpers.arrayElement([
        'welcome-v2',
        'welcome-enterprise',
        'welcome-free-tier',
      ]),
      locale: faker.helpers.arrayElement(['en-US', 'fr-FR', 'de-DE', 'es-ES']),
      signedUpAt: faker.date.recent({ days: 2 }).toISOString(),
    }),
  },
  {
    name: 'emails:marketing',
    displayName: 'Marketing emails',
    description: 'Bulk campaigns and drip sequences (global concurrency 5).',
    globalConcurrency: 5,
    jobCount: 210,
    jobNames: ['campaign-send', 'digest', 'reengagement'],
    buildData: () => ({
      campaignId: faker.string.alphanumeric(10),
      segment: faker.helpers.arrayElement(['active', 'churned', 'trialing', 'vip']),
      recipients: faker.number.int({ min: 100, max: 50000 }),
      subject: faker.company.catchPhrase(),
      scheduledFor: faker.date.soon({ days: 3 }).toISOString(),
      template: faker.helpers.arrayElement(['summer-sale', 'q2-digest', 'winback-30d']),
    }),
  },
  {
    name: 'emails:transactional',
    displayName: 'Transactional',
    description: 'High-priority messages (paused for maintenance).',
    isPaused: true,
    jobCount: 70,
    jobNames: ['receipt', 'password-reset', 'order-shipped'],
    buildData: () => ({
      to: faker.internet.email(),
      orderId: faker.string.alphanumeric(12).toUpperCase(),
      amount: faker.finance.amount({ min: 5, max: 999, dec: 2, symbol: '$' }),
      trackingNumber: faker.string.alphanumeric(16).toUpperCase(),
    }),
  },
  {
    name: 'billing:invoices',
    displayName: 'Invoices',
    description: 'Scheduled every morning at 06:00 UTC. Read-only. Data formatter redacts API keys.',
    readOnlyMode: true,
    jobCount: 95,
    jobNames: ['generate-invoice', 'send-invoice', 'charge-invoice'],
    buildData: () => ({
      invoiceId: `INV-${faker.number.int({ min: 1000, max: 9999 })}`,
      customerId: faker.string.uuid(),
      customerEmail: faker.internet.email(),
      amountDue: faker.finance.amount({ min: 10, max: 5000, dec: 2 }),
      currency: faker.helpers.arrayElement(['USD', 'EUR', 'GBP']),
      // The MSW handler has a formatter registered that redacts this before
      // the job reaches the UI. See FORMATTED_QUEUES in handlers.ts.
      apiKey: `sk_live_${faker.string.alphanumeric(24)}`,
      notes: faker.lorem.sentence(),
    }),
    externalUrl: (data) => ({
      displayText: `Invoice ${data.invoiceId}`,
      href: `https://admin.example.com/billing/invoices/${data.invoiceId}`,
    }),
  },
  {
    name: 'billing:charges',
    displayName: 'Charges',
    description: 'Stripe + Adyen capture pipeline.',
    jobCount: 120,
    jobNames: ['authorize', 'capture', 'settle'],
    buildData: () => {
      const chargeId = `ch_${faker.string.alphanumeric(16)}`;
      return {
        chargeId,
        provider: faker.helpers.arrayElement(['stripe', 'adyen', 'braintree']),
        amount: faker.number.int({ min: 500, max: 100000 }),
        currency: faker.helpers.arrayElement(['USD', 'EUR']),
        customerId: `cus_${faker.string.alphanumeric(12)}`,
        last4: faker.finance.creditCardNumber('####'),
        brand: faker.helpers.arrayElement(['visa', 'mastercard', 'amex']),
      };
    },
    externalUrl: (data) => ({
      displayText: `Charge ${(data.chargeId as string).slice(0, 12)}…`,
      href: `https://dashboard.stripe.com/charges/${data.chargeId}`,
    }),
  },
  {
    name: 'billing:refunds',
    displayName: 'Refunds',
    description: 'Refund processing with approval step.',
    jobCount: 45,
    jobNames: ['process-refund', 'notify-customer'],
    buildData: () => ({
      refundId: `re_${faker.string.alphanumeric(12)}`,
      originalChargeId: `ch_${faker.string.alphanumeric(16)}`,
      reason: faker.helpers.arrayElement(['duplicate', 'fraudulent', 'requested_by_customer']),
      amount: faker.number.int({ min: 500, max: 50000 }),
      approvedBy: faker.internet.email(),
    }),
  },
  {
    name: 'reports:daily',
    displayName: 'Daily reports',
    description: 'Aggregated daily metrics per org.',
    jobCount: 180,
    jobNames: ['aggregate-metrics', 'render-pdf', 'upload-s3'],
    buildData: () => ({
      orgId: faker.string.uuid(),
      reportDate: faker.date.recent({ days: 30 }).toISOString().slice(0, 10),
      format: faker.helpers.arrayElement(['pdf', 'csv', 'xlsx']),
      metrics: faker.helpers.arrayElements(
        ['arr', 'mrr', 'churn', 'active-users', 'signups', 'nps'],
        { min: 2, max: 5 }
      ),
    }),
  },
  {
    name: 'reports:nightly',
    displayName: 'Nightly batch',
    description: 'Heavy cross-org rollups, run at 02:00 UTC.',
    jobCount: 60,
    jobNames: ['nightly-rollup', 'reconcile', 'archive'],
    buildData: () => ({
      window: '24h',
      regions: faker.helpers.arrayElements(['us', 'eu', 'apac'], { min: 1, max: 3 }),
      tables: faker.number.int({ min: 20, max: 200 }),
      checkpoint: faker.string.alphanumeric(12),
    }),
  },
  {
    name: 'reports:export',
    displayName: 'Exports',
    description: 'Ad-hoc user-requested exports (global concurrency 2).',
    globalConcurrency: 2,
    jobCount: 80,
    jobNames: ['export-csv', 'export-parquet', 'notify-ready'],
    buildData: () => ({
      userId: faker.string.uuid(),
      query: faker.hacker.phrase(),
      rowCount: faker.number.int({ min: 10, max: 5_000_000 }),
      destination: faker.helpers.arrayElement(['s3://exports/', 'gs://exports/', 'azure://blob/']),
    }),
  },
  {
    name: 'notifications:push',
    displayName: 'Push notifications',
    description: 'APNs + FCM with rate limiting (global concurrency 20).',
    globalConcurrency: 20,
    jobCount: 260,
    jobNames: ['apns-push', 'fcm-push', 'web-push'],
    buildData: () => ({
      deviceToken: faker.string.alphanumeric(64),
      platform: faker.helpers.arrayElement(['ios', 'android', 'web']),
      title: faker.lorem.sentence(4),
      body: faker.lorem.sentence(12),
      badge: faker.number.int({ min: 0, max: 20 }),
    }),
  },
  {
    name: 'notifications:sms',
    displayName: 'SMS',
    description: 'Twilio + MessageBird fallback.',
    jobCount: 110,
    jobNames: ['twilio-send', 'messagebird-send'],
    buildData: () => ({
      to: faker.phone.number({ style: 'international' }),
      body: faker.lorem.sentence(8),
      provider: faker.helpers.arrayElement(['twilio', 'messagebird']),
      country: faker.location.countryCode(),
    }),
  },
  {
    name: 'notifications:slack',
    displayName: 'Slack webhooks',
    description: 'Outbound Slack alerts and digests.',
    jobCount: 65,
    jobNames: ['slack-alert', 'slack-digest'],
    buildData: () => ({
      channel: `#${faker.helpers.arrayElement(['ops', 'alerts', 'sales', 'billing'])}`,
      text: faker.lorem.sentence(10),
      mentions: faker.helpers.arrayElements(['@channel', '@here', '@oncall'], { min: 0, max: 2 }),
      webhookId: faker.string.alphanumeric(11).toUpperCase(),
    }),
  },
  {
    name: 'scheduled:cron',
    displayName: 'Scheduled jobs',
    description: 'Repeatable jobs: cron patterns and fixed intervals.',
    jobCount: 30,
    jobNames: ['daily-digest', 'weekly-report', 'stats-rollup', 'heartbeat', 'backup-db'],
    buildData: () => ({
      job: faker.helpers.arrayElement(['digest', 'report', 'heartbeat', 'backup', 'rollup']),
      lastRunId: faker.string.alphanumeric(10),
      runCount: faker.number.int({ min: 1, max: 1500 }),
    }),
  },
];

const stateWeights: Record<JobState, number> = {
  completed: 12,
  waiting: 3,
  active: 2,
  delayed: 2,
  failed: 2,
  prioritized: 1,
  paused: 0,
  'waiting-children': 0,
};

function pickState(isPaused: boolean): JobState {
  if (isPaused) {
    return faker.helpers.weightedArrayElement([
      { value: 'paused', weight: 8 },
      { value: 'waiting', weight: 1 },
      { value: 'completed', weight: 3 },
      { value: 'failed', weight: 1 },
    ]);
  }

  const entries = Object.entries(stateWeights).filter(([, w]) => w > 0) as [JobState, number][];
  return faker.helpers.weightedArrayElement(
    entries.map(([value, weight]) => ({ value, weight }))
  );
}

const ERROR_TYPES = [
  {
    name: 'TimeoutError',
    msg: () => `Request timed out after ${faker.number.int({ min: 5000, max: 30000 })}ms`,
    frames: () => [
      `    at runWithTimeout (/app/src/utils/timeout.ts:${faker.number.int({ min: 10, max: 120 })}:${faker.number.int({ min: 4, max: 40 })})`,
      `    at Worker.processJob (/app/src/worker.ts:${faker.number.int({ min: 10, max: 120 })}:${faker.number.int({ min: 4, max: 40 })})`,
      `    at processTicksAndRejections (node:internal/process/task_queues:96:5)`,
      `    at async Object.<anonymous> (/app/src/queues/handlers.ts:${faker.number.int({ min: 10, max: 200 })}:${faker.number.int({ min: 4, max: 40 })})`,
    ],
  },
  {
    name: 'SyntaxError',
    msg: () =>
      `Unexpected token '<' in JSON at position ${faker.number.int({ min: 0, max: 200 })} — upstream returned HTML`,
    frames: () => [
      `    at JSON.parse (<anonymous>)`,
      `    at parseRemoteResponse (/app/src/clients/http.ts:${faker.number.int({ min: 10, max: 100 })}:${faker.number.int({ min: 4, max: 40 })})`,
      `    at AxiosResponseInterceptor (/app/node_modules/axios/lib/core/Axios.js:${faker.number.int({ min: 10, max: 200 })}:${faker.number.int({ min: 4, max: 40 })})`,
    ],
  },
  {
    name: 'Error',
    msg: () =>
      faker.helpers.arrayElement([
        'ECONNREFUSED 10.0.0.42:5432',
        'connect ETIMEDOUT 203.0.113.10:443',
        'getaddrinfo ENOTFOUND internal-api.example.com',
        'socket hang up',
      ]),
    frames: () => [
      `    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:${faker.number.int({ min: 1000, max: 1600 })}:16)`,
      `    at new Promise (<anonymous>)`,
      `    at connect (/app/src/clients/pg.ts:${faker.number.int({ min: 10, max: 120 })}:${faker.number.int({ min: 4, max: 40 })})`,
      `    at Runner.runTask (/app/src/queues/runner.ts:${faker.number.int({ min: 50, max: 180 })}:${faker.number.int({ min: 4, max: 40 })})`,
    ],
  },
  {
    name: 'ValidationError',
    msg: () => {
      const field = faker.helpers.arrayElement(['email', 'amount', 'customerId', 'orderId']);
      const detail = faker.helpers.arrayElement([
        'must be positive',
        'must be a non-empty string',
        'failed schema validation',
        'out of range',
      ]);
      return `Field "${field}" ${detail}: received ${JSON.stringify(faker.helpers.arrayElement([null, '', -50, 'abc']))}`;
    },
    frames: () => [
      `    at validatePayload (/app/src/schemas/validator.ts:${faker.number.int({ min: 10, max: 100 })}:${faker.number.int({ min: 4, max: 40 })})`,
      `    at Handler.run (/app/src/handlers/base.ts:${faker.number.int({ min: 10, max: 120 })}:${faker.number.int({ min: 4, max: 40 })})`,
      `    at processTicksAndRejections (node:internal/process/task_queues:96:5)`,
    ],
  },
  {
    name: 'RateLimitError',
    msg: () =>
      `429 Too Many Requests from ${faker.helpers.arrayElement([
        'api.stripe.com',
        'fcm.googleapis.com',
        'api.twilio.com',
        'hooks.slack.com',
      ])} (retry-after ${faker.number.int({ min: 5, max: 120 })}s)`,
    frames: () => [
      `    at throwIfRateLimited (/app/src/clients/http.ts:${faker.number.int({ min: 40, max: 120 })}:${faker.number.int({ min: 4, max: 40 })})`,
      `    at Runner.runTask (/app/src/queues/runner.ts:${faker.number.int({ min: 50, max: 180 })}:${faker.number.int({ min: 4, max: 40 })})`,
    ],
  },
];

function buildStacktrace(): { failedReason: string; stacktrace: string[] } {
  const err = faker.helpers.arrayElement(ERROR_TYPES);
  const message = err.msg();
  const frames = err.frames();
  const header = `${err.name}: ${message}`;
  return {
    failedReason: message,
    stacktrace: [header, ...frames],
  };
}

const LOG_TEMPLATES = [
  () => `[${new Date().toISOString()}] INFO  started processing`,
  () => `[${new Date().toISOString()}] DEBUG fetching upstream ${faker.internet.url()}`,
  () =>
    `[${new Date().toISOString()}] INFO  cache hit=${faker.datatype.boolean()} lookup=${faker.number.int(
      { min: 1, max: 80 }
    )}ms`,
  () =>
    `[${new Date().toISOString()}] DEBUG db query took ${faker.number.int({ min: 2, max: 250 })}ms`,
  () => `[${new Date().toISOString()}] INFO  step ${faker.number.int({ min: 1, max: 9 })}/9 done`,
  () =>
    `[${new Date().toISOString()}] INFO  published event ${faker.hacker.noun()}.${faker.hacker.verb()}`,
  () =>
    `[${new Date().toISOString()}] WARN  rate-limit remaining=${faker.number.int({ min: 0, max: 500 })}`,
  () => `[${new Date().toISOString()}] WARN  retry attempt ${faker.number.int({ min: 1, max: 3 })}`,
];

function buildLogs(count: number): string[] {
  return Array.from({ length: count }, () => faker.helpers.arrayElement(LOG_TEMPLATES)());
}

// Richer per-step log timeline: a connected narrative across 30+ lines.
function buildRichLogs(): string[] {
  const start = faker.date.recent({ days: 1 });
  const lines: string[] = [];
  const tick = (ms: number) =>
    new Date(start.getTime() + ms).toISOString();
  let t = 0;
  lines.push(`[${tick(t)}] INFO  Starting batch 1 of 50`);
  t += 333;
  lines.push(`[${tick(t)}] DEBUG Connecting to upstream ${faker.internet.url()}`);
  t += 545;
  lines.push(`[${tick(t)}] INFO  Connected (ping ${faker.number.int({ min: 12, max: 180 })}ms)`);
  for (let batch = 1; batch <= 10; batch++) {
    t += faker.number.int({ min: 300, max: 900 });
    lines.push(
      `[${tick(t)}] INFO  Batch ${batch}/10 fetched ${faker.number.int({ min: 100, max: 1000 })} records in ${faker.number.int({ min: 40, max: 220 })}ms`
    );
    t += faker.number.int({ min: 150, max: 500 });
    lines.push(
      `[${tick(t)}] DEBUG Transforming batch ${batch}/10 (${faker.number.int({ min: 2, max: 40 })}ms)`
    );
    if (batch === 4) {
      t += 200;
      lines.push(`[${tick(t)}] WARN  Retry after rate limit, waiting 5s`);
      t += 5000;
      lines.push(`[${tick(t)}] INFO  Resumed`);
    }
    t += faker.number.int({ min: 50, max: 200 });
    lines.push(
      `[${tick(t)}] DEBUG Uploaded to s3://exports/batch-${batch}.csv (${faker.number.int({ min: 512, max: 40000 })}KB)`
    );
  }
  t += 400;
  lines.push(
    `[${tick(t)}] INFO  Finished ${faker.number.int({ min: 5000, max: 30000 })} rows in ${faker.number.int({ min: 2000, max: 120000 })}ms`
  );
  t += 50;
  lines.push(`[${tick(t)}] INFO  Notifying downstream`);
  t += 60;
  lines.push(`[${tick(t)}] INFO  Done`);
  return lines;
}

function buildOpts(jobState: JobState): Record<string, unknown> {
  const opts: Record<string, unknown> = {
    attempts: faker.number.int({ min: 1, max: 5 }),
    backoff: {
      type: faker.helpers.arrayElement(['exponential', 'fixed']),
      delay: faker.number.int({ min: 500, max: 60000 }),
    },
    removeOnComplete: faker.helpers.arrayElement([true, { age: 3600 }, { count: 1000 }]),
    removeOnFail: faker.helpers.arrayElement([false, { age: 24 * 3600 }, 50]),
  };

  if (jobState === 'delayed') {
    opts.delay = faker.number.int({ min: 10000, max: 6 * 3600 * 1000 });
  }
  if (jobState === 'prioritized') {
    opts.priority = faker.number.int({ min: 1, max: 10 });
  }
  if (faker.datatype.boolean(0.2)) {
    opts.jobId = `custom-${faker.string.alphanumeric(10)}`;
  }
  return opts;
}

function buildProgress(jobState: JobState): string | boolean | number | object {
  if (jobState === 'completed') return 100;
  if (jobState === 'active') {
    return faker.helpers.arrayElement([
      faker.number.int({ min: 5, max: 95 }),
      {
        step: faker.helpers.arrayElement(['fetching', 'transforming', 'uploading', 'notifying']),
        processed: faker.number.int({ min: 100, max: 4500 }),
        total: 5000,
        eta: faker.number.int({ min: 1000, max: 60000 }),
        details: `${faker.helpers.arrayElement(['Fetching user records', 'Rendering PDF', 'Uploading chunk'])}, batch ${faker.number.int({ min: 1, max: 50 })} of 50`,
      },
      `stage-${faker.number.int({ min: 1, max: 5 })}-of-5`,
      true,
    ]);
  }
  if (jobState === 'failed') return faker.number.int({ min: 0, max: 80 });
  return 0;
}

function buildJob(
  queueName: string,
  jobNames: string[],
  jobState: JobState,
  buildData: () => Record<string, unknown>,
  extUrl?: QueueSpec['externalUrl']
): DemoJob {
  const now = Date.now();
  const createdAt = subMinutes(now, faker.number.int({ min: 1, max: 24 * 60 })).getTime();
  const processedOn =
    jobState === 'waiting' || jobState === 'delayed' || jobState === 'paused'
      ? null
      : subSeconds(createdAt, -faker.number.int({ min: 1, max: 600 })).getTime();
  const finishedOn =
    jobState === 'completed' || jobState === 'failed'
      ? subSeconds(processedOn!, -faker.number.int({ min: 1, max: 900 })).getTime()
      : null;

  let failedReason = '';
  let stacktrace: string[] = [];
  if (jobState === 'failed') {
    const t = buildStacktrace();
    failedReason = t.failedReason;
    stacktrace = t.stacktrace;
  }

  const attempts =
    jobState === 'failed'
      ? faker.number.int({ min: 1, max: 5 })
      : jobState === 'active'
        ? faker.number.int({ min: 1, max: 2 })
        : jobState === 'completed'
          ? faker.number.int({ min: 1, max: 2 })
          : 0;

  const logCount =
    jobState === 'active'
      ? faker.number.int({ min: 8, max: 25 })
      : jobState === 'completed'
        ? faker.number.int({ min: 3, max: 12 })
        : jobState === 'failed'
          ? faker.number.int({ min: 2, max: 10 })
          : faker.number.int({ min: 0, max: 3 });

  const opts = buildOpts(jobState);
  const data = buildData();

  return {
    id: nextJobId(),
    name: faker.helpers.arrayElement(jobNames),
    timestamp: createdAt,
    processedOn,
    processedBy: processedOn
      ? `worker-${faker.number.int({ min: 1, max: 64 }).toString().padStart(2, '0')}`
      : null,
    finishedOn,
    progress: buildProgress(jobState),
    attempts,
    failedReason,
    stacktrace,
    delay: typeof opts.delay === 'number' ? (opts.delay as number) : undefined,
    opts,
    data,
    returnValue:
      jobState === 'completed'
        ? { ok: true, durationMs: faker.number.int({ min: 10, max: 30000 }) }
        : null,
    isFailed: jobState === 'failed',
    state: jobState,
    queueName,
    logs: buildLogs(logCount),
    externalUrl: extUrl ? extUrl(data) : undefined,
  };
}

function buildQueue(spec: QueueSpec): DemoQueue {
  const isPaused = !!spec.isPaused;
  const jobs: DemoJob[] = [];
  for (let i = 0; i < spec.jobCount; i++) {
    jobs.push(
      buildJob(spec.name, spec.jobNames, pickState(isPaused), spec.buildData, spec.externalUrl)
    );
  }
  jobs.sort((a, b) => b.timestamp - a.timestamp);

  return {
    name: spec.name,
    displayName: spec.displayName,
    description: spec.description,
    type: spec.type ?? 'bullmq',
    isPaused,
    readOnlyMode: !!spec.readOnlyMode,
    allowRetries: !spec.readOnlyMode,
    allowCompletedRetries: !spec.readOnlyMode,
    globalConcurrency: spec.globalConcurrency ?? null,
    delimiter: ':',
    statuses: [
      'latest',
      'active',
      'waiting',
      'waiting-children',
      'prioritized',
      'completed',
      'failed',
      'delayed',
      'paused',
    ],
    jobs,
  };
}

function linkFlow(parent: DemoJob, child: DemoJob, parentQueueName: string): void {
  child.parentKey = `bull:${parentQueueName}:${parent.id}`;
  parent.childRefs = parent.childRefs ?? [];
  parent.childRefs.push({ queueName: child.queueName, jobId: String(child.id) });
}

function buildFlows(state: DemoState): void {
  const nightly = state.queues.find((q) => q.name === 'reports:nightly');
  const daily = state.queues.find((q) => q.name === 'reports:daily');
  const exportQ = state.queues.find((q) => q.name === 'reports:export');
  const invoices = state.queues.find((q) => q.name === 'billing:invoices');
  const charges = state.queues.find((q) => q.name === 'billing:charges');
  const slack = state.queues.find((q) => q.name === 'notifications:slack');

  if (nightly && daily && exportQ) {
    // 4-deep flow: nightly -> daily (x2) -> export -> slack notification
    const parent = nightly.jobs[0];
    parent.name = 'nightly-rollup';
    parent.state = 'waiting-children';
    const dailyChildA = daily.jobs[0];
    const dailyChildB = daily.jobs[1];
    const dailyChildC = daily.jobs[2];
    const exportGrandchild = exportQ.jobs[0];
    const exportGrandchild2 = exportQ.jobs[1];
    linkFlow(parent, dailyChildA, 'reports:nightly');
    linkFlow(parent, dailyChildB, 'reports:nightly');
    linkFlow(parent, dailyChildC, 'reports:nightly');
    dailyChildA.state = 'waiting-children';
    linkFlow(dailyChildA, exportGrandchild, 'reports:daily');
    linkFlow(dailyChildA, exportGrandchild2, 'reports:daily');
    // 4th level: a slack notification fires once an export is ready.
    if (slack) {
      exportGrandchild.state = 'waiting-children';
      const slackGG = slack.jobs[0];
      linkFlow(exportGrandchild, slackGG, 'reports:export');
    }
  }

  if (invoices && charges) {
    const parent = invoices.jobs[1];
    parent.name = 'generate-invoice-flow';
    parent.state = 'waiting-children';
    const childA = charges.jobs[0];
    const childB = charges.jobs[1];
    linkFlow(parent, childA, 'billing:invoices');
    linkFlow(parent, childB, 'billing:invoices');
  }
}

// Priority mix: inject a handful of high/low priority jobs into queues that
// support them, so the Prioritized tab has visible content.
function seedPriorityJobs(state: DemoState): void {
  const queues = ['emails:transactional', 'notifications:push'];
  for (const name of queues) {
    const q = state.queues.find((s) => s.name === name);
    if (!q) continue;
    for (let i = 0; i < 5; i++) {
      const job = buildJob(
        q.name,
        ['high-priority-send', 'vip-push', 'urgent-alert'],
        'prioritized',
        () => ({
          to: faker.internet.email(),
          tier: 'vip',
          reason: faker.helpers.arrayElement(['sla', 'enterprise-customer', 'escalation']),
        })
      );
      job.opts = { ...job.opts, priority: i < 3 ? 1 : 10 };
      q.jobs.unshift(job);
    }
  }
}

// Crons: seed repeatable jobs with real repeat opts, repeatJobKey, tz, pattern.
function seedCronJobs(state: DemoState): void {
  const cron = state.queues.find((q) => q.name === 'scheduled:cron');
  if (!cron) return;

  const scheduleDefs = [
    { name: 'daily-digest', pattern: '0 0 * * *', tz: 'Asia/Jerusalem', nextInMs: 6 * 3600 * 1000 },
    { name: 'weekly-report', pattern: '0 0 * * 1', tz: 'UTC', nextInMs: 36 * 3600 * 1000 },
    { name: 'stats-rollup', pattern: '0 */6 * * *', tz: 'UTC', nextInMs: 45 * 60 * 1000 },
    { name: 'heartbeat', every: 60000, nextInMs: 30 * 1000 },
    { name: 'backup-db', pattern: '15 3 * * *', tz: 'UTC', nextInMs: 9 * 3600 * 1000 },
    { name: 'invoice-sweep', pattern: '0 6 * * *', tz: 'UTC', nextInMs: 5 * 3600 * 1000 },
    { name: 'session-expiry', every: 5 * 60_000, nextInMs: 2 * 60_000 },
    { name: 'cache-warmup', pattern: '*/15 * * * *', tz: 'UTC', nextInMs: 11 * 60_000 },
  ];

  // Replace the first N delayed jobs with explicit cron-shaped ones.
  let replaced = 0;
  for (const def of scheduleDefs) {
    const data = {
      job: def.name,
      lastRunId: faker.string.alphanumeric(10),
      runCount: faker.number.int({ min: 1, max: 1500 }),
    };
    const job = buildJob(
      cron.name,
      [def.name],
      'delayed',
      () => data
    );
    job.name = def.name;
    const repeat: Record<string, unknown> =
      'pattern' in def
        ? { pattern: def.pattern, tz: def.tz }
        : { every: def.every };
    const key =
      'pattern' in def
        ? `__default__:${def.name}:${def.pattern}:${def.tz ?? ''}`
        : `__default__:${def.name}::${def.every}`;
    job.opts = {
      ...job.opts,
      repeat,
      repeatJobKey: key,
    };
    job.delay = def.nextInMs;
    // Simulate that "delayed" means processedOn is scheduled in the future.
    job.processedOn = null;
    job.finishedOn = null;
    job.timestamp = addMinutes(new Date(), -5).getTime();
    cron.jobs.unshift(job);
    replaced++;
    if (replaced > scheduleDefs.length) break;
  }

  // Also seed some completed recent runs for historical context.
  for (let i = 0; i < 6; i++) {
    const def = faker.helpers.arrayElement(scheduleDefs);
    const data = { job: def.name, lastRunId: faker.string.alphanumeric(10) };
    const job = buildJob(cron.name, [def.name], 'completed', () => data);
    job.name = def.name;
    const repeat: Record<string, unknown> =
      'pattern' in def
        ? { pattern: def.pattern, tz: def.tz }
        : { every: def.every };
    job.opts = { ...job.opts, repeat };
    cron.jobs.unshift(job);
  }
}

// Attach richer multi-line logs to 5 active jobs spread across different queues
// so the Logs tab has something meaty to show.
function seedRichLogs(state: DemoState): void {
  const targets = ['reports:export', 'billing:charges', 'emails:marketing', 'notifications:push', 'reports:nightly'];
  for (const qName of targets) {
    const q = state.queues.find((s) => s.name === qName);
    if (!q) continue;
    const activeJob = q.jobs.find((j) => j.state === 'active') ?? q.jobs.find((j) => j.state === 'completed');
    if (activeJob) activeJob.logs = buildRichLogs();
  }
}

export function seedFixtures(target: DemoState): void {
  target.queues.length = 0;
  for (const spec of queueSpecs) {
    target.queues.push(buildQueue(spec));
  }
  seedPriorityJobs(target);
  seedCronJobs(target);
  buildFlows(target);
  seedRichLogs(target);
}

