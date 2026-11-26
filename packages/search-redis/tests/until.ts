export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function until(condition: () => Promise<boolean> | boolean, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`condition not met within ${timeoutMs} ms`);
    await sleep(20);
  }
}
