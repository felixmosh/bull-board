"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Progress = void 0;
const react_1 = __importDefault(require("react"));
const Progress_module_css_1 = __importDefault(require("./Progress.module.css"));
const classnames_1 = __importDefault(require("classnames"));
const Progress = ({ percentage, status, className, }) => {
    return (react_1.default.createElement("svg", { className: classnames_1.default(Progress_module_css_1.default.progress, className), viewBox: "0 0 148 148" },
        react_1.default.createElement("circle", { cx: "70", cy: "70", r: "70", fill: "none", stroke: "#EDF2F7", strokeWidth: "8", strokeLinecap: "round", style: { transform: 'translate(4px, 4px)' } }),
        react_1.default.createElement("circle", { cx: "70", cy: "70", r: "70", fill: "none", stroke: status === 'failed' ? '#F56565' : '#48BB78', strokeWidth: "8", strokeLinecap: "round", strokeDasharray: "600", strokeDashoffset: 600 - ((600 - 160) * percentage) / 100, style: { transform: 'translate(4px, -4px) rotate(-90deg)' } }),
        react_1.default.createElement("text", { textAnchor: "middle", x: "74", y: "88" },
            percentage,
            "%")));
};
exports.Progress = Progress;
//# sourceMappingURL=Progress.js.map