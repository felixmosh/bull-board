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

const parsedClusterNodes = (process.env.REDIS_CLUSTER_NODES || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [host, port] = entry.split(':');
    return { host, port: Number(port) };
  });

export const clusterNodes = parsedClusterNodes.length > 0 ? parsedClusterNodes : null;
