"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobActions = void 0;
const react_1 = __importDefault(require("react"));
const constants_1 = require("../../constants");
const Promote_1 = require("../../Icons/Promote");
const Retry_1 = require("../../Icons/Retry");
const Trash_1 = require("../../Icons/Trash");
const Tooltip_1 = require("../../Tooltip/Tooltip");
const Button_1 = require("../Button/Button");
const JobActions_module_css_1 = __importDefault(require("./JobActions.module.css"));
const buttonTypes = {
    promote: { title: 'Promote', Icon: Promote_1.PromoteIcon, actionKey: 'promoteJob' },
    clean: { title: 'Clean', Icon: Trash_1.TrashIcon, actionKey: 'cleanJob' },
    retry: { title: 'Retry', Icon: Retry_1.RetryIcon, actionKey: 'retryJob' },
};
const statusToButtonsMap = {
    [constants_1.STATUSES.failed]: [buttonTypes.retry, buttonTypes.clean],
    [constants_1.STATUSES.delayed]: [buttonTypes.promote, buttonTypes.clean],
    [constants_1.STATUSES.completed]: [buttonTypes.clean],
    [constants_1.STATUSES.waiting]: [buttonTypes.clean],
};
const JobActions = ({ actions, status }) => {
    const buttons = statusToButtonsMap[status];
    if (!buttons) {
        return null;
    }
    return (react_1.default.createElement("ul", { className: JobActions_module_css_1.default.jobActions }, buttons.map((type) => (react_1.default.createElement("li", { key: type.title },
        react_1.default.createElement(Tooltip_1.Tooltip, { title: type.title },
            react_1.default.createElement(Button_1.Button, { onClick: actions[type.actionKey], className: JobActions_module_css_1.default.button },
                react_1.default.createElement(type.Icon, null))))))));
};
exports.JobActions = JobActions;
//# sourceMappingURL=JobActions.js.map