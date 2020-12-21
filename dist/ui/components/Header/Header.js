"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Header = void 0;
const react_1 = __importDefault(require("react"));
const Header_module_css_1 = __importDefault(require("./Header.module.css"));
const Header = ({ children }) => {
    return (react_1.default.createElement("header", { className: Header_module_css_1.default.header },
        react_1.default.createElement("div", { className: Header_module_css_1.default.logo }, "\uD83C\uDFAF Bull Dashboard"),
        children));
};
exports.Header = Header;
//# sourceMappingURL=Header.js.map