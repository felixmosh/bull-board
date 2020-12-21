"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BullAdapter = void 0;
class BullAdapter {
    constructor(queue, options) {
        this.queue = queue;
        this.options = options;
    }
    get client() {
        return Promise.resolve(this.queue.client);
    }
    getName() {
        return this.queue.name;
    }
    clean(jobStatus, graceTimeMs) {
        return this.queue.clean(graceTimeMs, jobStatus);
    }
    getJob(id) {
        return this.queue.getJob(id);
    }
    getJobs(jobStatuses, start, end) {
        return this.queue.getJobs(jobStatuses, start, end);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getJobCounts(..._jobStatuses) {
        return this.queue.getJobCounts();
    }
}
exports.BullAdapter = BullAdapter;
//# sourceMappingURL=bull.js.map