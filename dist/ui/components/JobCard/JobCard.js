"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobCard = void 0;
const react_1 = __importDefault(require("react"));
const Details_1 = require("./Details/Details");
const JobActions_1 = require("./JobActions/JobActions");
const JobCard_module_css_1 = __importDefault(require("./JobCard.module.css"));
const Progress_1 = require("./Progress/Progress");
const Timeline_1 = require("./Timeline/Timeline");
const JobCard = ({ job, status, actions }) => (react_1.default.createElement("div", { className: JobCard_module_css_1.default.card },
    react_1.default.createElement("div", { className: JobCard_module_css_1.default.sideInfo },
        react_1.default.createElement("span", { title: `#${job.id}` },
            "#",
            job.id),
        react_1.default.createElement(Timeline_1.Timeline, { job: job, status: status })),
    react_1.default.createElement("div", { className: JobCard_module_css_1.default.contentWrapper },
        react_1.default.createElement("div", { className: JobCard_module_css_1.default.title },
            react_1.default.createElement("h4", null,
                job.name,
                job.attempts > 0 && react_1.default.createElement("span", null,
                    "attempt #",
                    job.attempts + 1)),
            react_1.default.createElement(JobActions_1.JobActions, { status: status, actions: actions })),
        react_1.default.createElement("div", { className: JobCard_module_css_1.default.content },
            react_1.default.createElement(Details_1.Details, { status: status, job: job }),
            typeof job.progress === 'number' && (react_1.default.createElement(Progress_1.Progress, { percentage: job.progress, status: status, className: JobCard_module_css_1.default.progress }))))));
exports.JobCard = JobCard;
//# sourceMappingURL=JobCard.js.map