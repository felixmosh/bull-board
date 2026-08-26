// Each Jest worker owns one logical database, so the namespace-wide SCAN and the shared
// `__global__` rollup that several specs assert on cannot be seen by another worker.
// Database 0 is left alone: it is where a developer's dev board keeps its history.
const TEST_DBS = 15;

const worker = Number(process.env.JEST_WORKER_ID ?? 1);

if (worker > TEST_DBS) {
  throw new Error(
    `JEST_WORKER_ID ${worker} exceeds the ${TEST_DBS} Redis databases this suite reserves. ` +
      `Keep maxWorkers at or below ${TEST_DBS}.`
  );
}

export const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
  db: process.env.REDIS_TEST_DB ? +process.env.REDIS_TEST_DB : TEST_DBS + 1 - worker,
};
