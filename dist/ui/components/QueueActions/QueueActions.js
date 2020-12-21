"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueActions = void 0;
const react_1 = __importDefault(require("react"));
const Retry_1 = require("../Icons/Retry");
const Trash_1 = require("../Icons/Trash");
const Button_1 = require("../JobCard/Button/Button");
const QueueActions_module_css_1 = __importDefault(require("./QueueActions.module.css"));
const ACTIONABLE_STATUSES = ['failed', 'delayed', 'completed'];
const isStatusActionable = (status) => ACTIONABLE_STATUSES.includes(status);
const CleanAllButton = ({ onClick }) => (react_1.default.createElement(Button_1.Button, { onClick: onClick, className: QueueActions_module_css_1.default.button },
    react_1.default.createElement(Trash_1.TrashIcon, null),
    "Clean all"));
const QueueActions = ({ status, actions, queue }) => {
    if (!isStatusActionable(status)) {
        return null;
    }
    return (react_1.default.createElement("ul", { className: QueueActions_module_css_1.default.queueActions },
        status === 'failed' && (react_1.default.createElement(react_1.default.Fragment, null,
            react_1.default.createElement("li", null,
                react_1.default.createElement(Button_1.Button, { onClick: actions.retryAll(queue.name), className: QueueActions_module_css_1.default.button },
                    react_1.default.createElement(Retry_1.RetryIcon, null),
                    "Retry all")),
            react_1.default.createElement("li", null,
                react_1.default.createElement(CleanAllButton, { onClick: actions.cleanAllFailed(queue.name) })))),
        status === 'delayed' && (react_1.default.createElement("li", null,
            react_1.default.createElement(CleanAllButton, { onClick: actions.cleanAllDelayed(queue.name) }))),
        status === 'completed' && (react_1.default.createElement("li", null,
            react_1.default.createElement(CleanAllButton, { onClick: actions.cleanAllCompleted(queue.name) })))));
};
exports.QueueActions = QueueActions;
//# sourceMappingURL=QueueActions.js.map