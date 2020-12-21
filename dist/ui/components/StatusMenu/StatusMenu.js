"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusMenu = void 0;
const classnames_1 = __importDefault(require("classnames"));
const react_1 = __importDefault(require("react"));
const constants_1 = require("../constants");
const StatusMenu_module_css_1 = __importDefault(require("./StatusMenu.module.css"));
const StatusMenu = ({ queue, selectedStatus, onChange, }) => (react_1.default.createElement("div", { className: StatusMenu_module_css_1.default.statusMenu }, constants_1.STATUS_LIST.map((status) => {
    const isActive = selectedStatus[queue.name] === status;
    return (react_1.default.createElement("button", { type: "button", key: `${queue.name}-${status}`, onClick: () => onChange({ [queue.name]: status }), className: classnames_1.default({ [StatusMenu_module_css_1.default.active]: isActive }) },
        status,
        queue.counts[status] > 0 && (react_1.default.createElement("span", { className: StatusMenu_module_css_1.default.badge }, queue.counts[status]))));
})));
exports.StatusMenu = StatusMenu;
//# sourceMappingURL=StatusMenu.js.map