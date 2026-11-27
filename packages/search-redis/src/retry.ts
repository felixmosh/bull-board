const SLOT_MOVE = /^(TRYAGAIN|ASK|MOVED)\b|ReplyError: (TRYAGAIN|ASK|MOVED)\b|non local key/;
const BACKOFF_MS = [50, 150];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function retryOnSlotMove<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= BACKOFF_MS.length || !SLOT_MOVE.test((error as Error)?.message ?? '')) {
        throw error;
      }
      await sleep(BACKOFF_MS[attempt]);
    }
  }
}
