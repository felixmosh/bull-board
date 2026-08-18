import { Redis } from 'ioredis';
import { NAMESPACE } from '../../src/keys';

export const EXPECTED_MAJOR: number = Number((globalThis as Record<string, any>).BULLMQ_MAJOR);

export const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
  db: +(process.env.REDIS_TEST_DB || 15),
};

export function resolvedMajor(): number {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { version } = require('bullmq/package.json') as { version: string };
  return Number(version.split('.')[0]);
}

/**
 * Guards the matrix: without this a broken alias or mapper would leave the project on the
 * default major and every version-specific expectation here would still pass.
 */
export function assertResolvedMajor(): void {
  it(`resolves bullmq@${EXPECTED_MAJOR} through the 'bullmq' specifier`, () => {
    expect(Number.isFinite(EXPECTED_MAJOR)).toBe(true);
    expect(resolvedMajor()).toBe(EXPECTED_MAJOR);
  });
}

let counter = 0;

export function uniqueName(prefix: string): string {
  return `${prefix}-v${EXPECTED_MAJOR}-${process.pid}-${counter++}`;
}

export async function resetHistory(redis: Redis, name: string): Promise<void> {
  const keys = await redis.keys(`${NAMESPACE}:${name}*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export async function waitFor(predicate: () => Promise<boolean>, message: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(message);
}
