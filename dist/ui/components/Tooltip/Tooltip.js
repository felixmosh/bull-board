"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tooltip = void 0;
const react_1 = __importDefault(require("react"));
const Tooltip_module_css_1 = __importDefault(require("./Tooltip.module.css"));
const Tooltip = ({ title, children, }) => (react_1.default.createElement("span", { "data-title": title, className: Tooltip_module_css_1.default.tooltip }, children));
exports.Tooltip = Tooltip;
//# sourceMappingURL=Tooltip.js.map