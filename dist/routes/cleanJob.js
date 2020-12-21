"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanJob = void 0;
const cleanJob = async (req, res) => {
    try {
        const { bullBoardQueues } = req.app.locals;
        const { queueName, id } = req.params;
        const { queue } = bullBoardQueues[queueName];
        if (!queue) {
            return res.status(404).send({
                error: 'Queue not found',
            });
        }
        const job = await queue.getJob(id);
        if (!job) {
            return res.status(404).send({
                error: 'Job not found',
            });
        }
        await job.remove();
        return res.sendStatus(204);
    }
    catch (error) {
        const body = {
            error: 'queue error',
            details: error.stack,
        };
        return res.status(500).send(body);
    }
};
exports.cleanJob = cleanJob;
//# sourceMappingURL=cleanJob.js.map