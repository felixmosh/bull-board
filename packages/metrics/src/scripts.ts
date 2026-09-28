import { createHash } from 'node:crypto';
import type { MetricsClient } from './connection';

const shas = new Map<string, string>();

function shaOf(script: string): string {
  let sha = shas.get(script);
  if (!sha) {
    sha = createHash('sha1').update(script).digest('hex');
    shas.set(script, sha);
  }
  return sha;
}

export async function runScript(
  redis: MetricsClient,
  script: string,
  numKeys: number,
  ...args: (string | number)[]
): Promise<unknown> {
  try {
    return await redis.evalsha(shaOf(script), numKeys, ...args);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('NOSCRIPT')) {
      throw error;
    }
    return redis.eval(script, numKeys, ...args);
  }
}
