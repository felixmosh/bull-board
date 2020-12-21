"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.promoteJob = void 0;
const promoteJob = async (req, res) => {
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
        await job.promote();
        return res.sendStatus(204);
    }
    catch (e) {
        return res.status(500).send({
            error: 'queue error',
            details: e.stack,
        });
    }
};
exports.promoteJob = promoteJob;
//# sourceMappingURL=promoteJob.js.map