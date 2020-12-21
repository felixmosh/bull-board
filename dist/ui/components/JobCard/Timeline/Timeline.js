"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Timeline = void 0;
const date_fns_1 = require("date-fns");
const react_1 = __importDefault(require("react"));
const Timeline_module_css_1 = __importDefault(require("./Timeline.module.css"));
const formatDate = (ts) => {
    if (date_fns_1.isToday(ts)) {
        return date_fns_1.format(ts, 'HH:mm:ss');
    }
    return date_fns_1.getYear(ts) === date_fns_1.getYear(new Date())
        ? date_fns_1.format(ts, 'MM/dd HH:mm:ss')
        : date_fns_1.format(ts, 'MM/dd/yyyy HH:mm:ss');
};
const Timeline = function Timeline({ job, status, }) {
    return (react_1.default.createElement("div", { className: Timeline_module_css_1.default.timelineWrapper },
        react_1.default.createElement("ul", { className: Timeline_module_css_1.default.timeline },
            react_1.default.createElement("li", null,
                react_1.default.createElement("small", null, "Added at"),
                react_1.default.createElement("time", null, formatDate(job.timestamp))),
            !!job.delay && job.delay > 0 && status === 'delayed' && (react_1.default.createElement("li", null,
                react_1.default.createElement("small", null, "Delayed for"),
                react_1.default.createElement("time", null, date_fns_1.formatDistance(job.timestamp, job.timestamp + job.delay, { includeSeconds: true })))),
            !!job.processedOn && (react_1.default.createElement("li", null,
                react_1.default.createElement("small", null,
                    job.delay && job.delay > 0 ? 'delayed for ' : '',
                    date_fns_1.formatDistance(job.processedOn, job.timestamp, {
                        includeSeconds: true,
                    })),
                react_1.default.createElement("small", null, "Process started at"),
                react_1.default.createElement("time", null, formatDate(job.processedOn)))),
            !!job.finishedOn && (react_1.default.createElement("li", null,
                react_1.default.createElement("small", null, date_fns_1.formatDistance(job.finishedOn, job.processedOn, {
                    includeSeconds: true,
                })),
                react_1.default.createElement("small", null,
                    status === 'failed' ? 'Failed' : 'Finished',
                    " at"),
                react_1.default.createElement("time", null, formatDate(job.finishedOn)))))));
};
exports.Timeline = Timeline;
//# sourceMappingURL=Timeline.js.map