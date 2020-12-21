"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queuesHandler = void 0;
const redis_info_1 = require("redis-info");
const metrics = [
    'redis_version',
    'used_memory',
    'mem_fragmentation_ratio',
    'connected_clients',
    'blocked_clients',
];
const getStats = async ({ queue, }) => {
    const redisClient = await queue.client;
    const redisInfoRaw = await redisClient.info();
    const redisInfo = redis_info_1.parse(redisInfoRaw);
    const validMetrics = metrics.reduce((acc, metric) => {
        if (redisInfo[metric]) {
            acc[metric] = redisInfo[metric];
        }
        return acc;
    }, {});
    validMetrics.total_system_memory =
        redisInfo.total_system_memory || redisInfo.maxmemory;
    return validMetrics;
};
const formatJob = (dataFormatter = (d) => d) => {
    return (job) => {
        const jobProps = job.toJSON();
        return {
            id: jobProps.id,
            timestamp: jobProps.timestamp,
            processedOn: jobProps.processedOn,
            finishedOn: jobProps.finishedOn,
            progress: jobProps.progress,
            attempts: jobProps.attemptsMade,
            delay: job.opts.delay,
            failedReason: jobProps.failedReason,
            stacktrace: jobProps.stacktrace,
            opts: jobProps.opts,
            data: dataFormatter(jobProps.data),
            name: jobProps.name,
            returnValue: jobProps.returnvalue,
        };
    };
};
const statuses = [
    'active',
    'completed',
    'delayed',
    'failed',
    'paused',
    'waiting',
];
const getDataForQueues = async (bullBoardQueues, req) => {
    const query = req.query || {};
    const pairs = Object.entries(bullBoardQueues);
    if (pairs.length == 0) {
        return {
            stats: {},
            queues: [],
        };
    }
    const queues = await Promise.all(pairs.map(async ([name, { queue }]) => {
        var _a;
        const counts = await queue.getJobCounts(...statuses);
        const status = query[name] === 'latest' ? statuses : query[name];
        const jobs = await queue.getJobs(status, 0, 10);
        const formatter = formatJob((_a = queue.options) === null || _a === void 0 ? void 0 : _a.dataFormatter);
        return {
            name,
            counts: counts,
            jobs: jobs.map(formatter),
        };
    }));
    const stats = await getStats(pairs[0][1]);
    return {
        stats,
        queues,
    };
};
const queuesHandler = async (req, res) => {
    const { bullBoardQueues } = req.app.locals;
    res.json(await getDataForQueues(bullBoardQueues, req));
};
exports.queuesHandler = queuesHandler;
//# sourceMappingURL=queues.js.map