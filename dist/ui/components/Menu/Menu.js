"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Menu = void 0;
const react_1 = __importDefault(require("react"));
const Menu_module_css_1 = __importDefault(require("./Menu.module.css"));
const react_router_dom_1 = require("react-router-dom");
const Menu = ({ queues }) => (react_1.default.createElement("aside", { className: Menu_module_css_1.default.aside },
    react_1.default.createElement("div", null, "QUEUES"),
    react_1.default.createElement("nav", null, !!queues && (react_1.default.createElement("ul", { className: Menu_module_css_1.default.menu }, queues.map((queueName) => (react_1.default.createElement("li", { key: queueName },
        react_1.default.createElement(react_router_dom_1.NavLink, { to: `/queue/${queueName}`, activeClassName: Menu_module_css_1.default.active }, queueName))))))),
    react_1.default.createElement("div", { className: Menu_module_css_1.default.appVersion }, process.env.APP_VERSION)));
exports.Menu = Menu;
//# sourceMappingURL=Menu.js.map