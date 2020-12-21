"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryAll = void 0;
const retryAll = async (req, res) => {
    try {
        const { queueName } = req.params;
        const { bullBoardQueues } = req.app.locals;
        const { queue } = bullBoardQueues[queueName];
        if (!queue) {
            return res.status(404).send({ error: 'queue not found' });
        }
        const jobs = await queue.getJobs(['failed']);
        await Promise.all(jobs.map((job) => job.retry()));
        return res.sendStatus(200);
    }
    catch (e) {
        const body = {
            error: 'queue error',
            details: e.stack,
        };
        return res.status(500).send(body);
    }
};
exports.retryAll = retryAll;
//# sourceMappingURL=retryAll.js.map