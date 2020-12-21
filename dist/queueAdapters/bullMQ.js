"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BullMQAdapter = void 0;
class BullMQAdapter {
    constructor(queue) {
        this.queue = queue;
        this.LIMIT = 1000;
    }
    get client() {
        return this.queue.client;
    }
    getName() {
        return this.queue.toKey('~');
    }
    clean(jobStatus, graceTimeMs) {
        return this.queue.clean(graceTimeMs, this.LIMIT, jobStatus);
    }
    getJob(id) {
        return this.queue.getJob(id);
    }
    getJobs(jobStatuses, start, end) {
        return this.queue.getJobs(jobStatuses, start, end);
    }
    getJobCounts(...jobStatuses) {
        return this.queue.getJobCounts(...jobStatuses);
    }
}
exports.BullMQAdapter = BullMQAdapter;
//# sourceMappingURL=bullMQ.js.map