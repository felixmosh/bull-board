import { Queue } from 'bullmq';

/**
 * The BullMQ major this project is pinned to, declared by the jest config rather than sniffed,
 * so a `moduleNameMapper` that silently stops applying fails the suite instead of quietly
 * running one major twice. `assertResolvedMajor` is what actually enforces it.
 */
export const EXPECTED_MAJOR: number = Number((globalThis as Record<string, any>).BULLMQ_MAJOR);

export const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

export const isV6 = () => EXPECTED_MAJOR >= 6;

/** Reads the major actually resolved through the `bullmq` specifier. */
export function resolvedMajor(): number {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { version } = require('bullmq/package.json') as { version: string };
  return Number(version.split('.')[0]);
}

/**
 * Guards the whole matrix. Without this a broken alias or mapper would leave both projects on
 * the same major and every version-specific expectation below would still pass.
 */
export function assertResolvedMajor(): void {
  it(`resolves bullmq@${EXPECTED_MAJOR} through the 'bullmq' specifier`, () => {
    expect(Number.isFinite(EXPECTED_MAJOR)).toBe(true);
    expect(resolvedMajor()).toBe(EXPECTED_MAJOR);
  });
}

let counter = 0;

/** A uniquely named queue, so parallel projects and workers never collide on Redis keys. */
export function uniqueName(prefix: string): string {
  return `${prefix}-v${EXPECTED_MAJOR}-${process.env.JEST_WORKER_ID}-${counter++}`;
}

export async function makeQueue(prefix: string): Promise<Queue> {
  const queue = new Queue(uniqueName(prefix), { connection });
  await queue.waitUntilReady();
  return queue;
}

export async function destroyQueue(queue: Queue | undefined): Promise<void> {
  if (!queue) return;
  await queue.obliterate({ force: true }).catch(() => undefined);
  await queue.close();
}
