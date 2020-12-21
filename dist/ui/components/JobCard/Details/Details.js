"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Details = void 0;
const react_1 = __importDefault(require("react"));
const useDetailsTabs_1 = require("../../../hooks/useDetailsTabs");
const Button_1 = require("../Button/Button");
const Details_module_css_1 = __importDefault(require("./Details.module.css"));
const Details = ({ status, job }) => {
    const { tabs, getTabContent } = useDetailsTabs_1.useDetailsTabs(status);
    if (tabs.length === 0) {
        return null;
    }
    return (react_1.default.createElement("div", { className: Details_module_css_1.default.details },
        react_1.default.createElement("ul", { className: Details_module_css_1.default.tabActions }, tabs.map((tab) => (react_1.default.createElement("li", { key: tab.title },
            react_1.default.createElement(Button_1.Button, { onClick: tab.selectTab, isActive: tab.isActive }, tab.title))))),
        react_1.default.createElement("div", { className: Details_module_css_1.default.tabContent },
            react_1.default.createElement("div", null, getTabContent(job)))));
};
exports.Details = Details;
//# sourceMappingURL=Details.js.map