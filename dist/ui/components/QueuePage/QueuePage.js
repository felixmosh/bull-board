"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueuePage = void 0;
const react_1 = __importDefault(require("react"));
const JobCard_1 = require("../JobCard/JobCard");
const QueueActions_1 = require("../QueueActions/QueueActions");
const StatusMenu_1 = require("../StatusMenu/StatusMenu");
const QueuePage_module_css_1 = __importDefault(require("./QueuePage.module.css"));
const QueuePage = ({ selectedStatus, actions, queue, }) => {
    if (!queue) {
        return react_1.default.createElement("section", null, "Queue Not found");
    }
    return (react_1.default.createElement("section", null,
        react_1.default.createElement("div", { className: QueuePage_module_css_1.default.stickyHeader },
            react_1.default.createElement(StatusMenu_1.StatusMenu, { queue: queue, selectedStatus: selectedStatus, onChange: actions.setSelectedStatuses }),
            react_1.default.createElement(QueueActions_1.QueueActions, { queue: queue, actions: actions, status: selectedStatus[queue.name] })),
        queue.jobs.map((job) => (react_1.default.createElement(JobCard_1.JobCard, { key: job.id, job: job, status: selectedStatus[queue.name], actions: {
                cleanJob: actions.cleanJob(queue === null || queue === void 0 ? void 0 : queue.name)(job),
                promoteJob: actions.promoteJob(queue === null || queue === void 0 ? void 0 : queue.name)(job),
                retryJob: actions.retryJob(queue === null || queue === void 0 ? void 0 : queue.name)(job),
            } })))));
};
exports.QueuePage = QueuePage;
//# sourceMappingURL=QueuePage.js.map