"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Button = void 0;
const react_1 = __importDefault(require("react"));
const Button_module_css_1 = __importDefault(require("./Button.module.css"));
const classnames_1 = __importDefault(require("classnames"));
const Button = ({ children, className, isActive = false, ...rest }) => (react_1.default.createElement("button", Object.assign({ type: "button" }, rest, { className: classnames_1.default(Button_module_css_1.default.button, className, { [Button_module_css_1.default.isActive]: isActive }) }), children));
exports.Button = Button;
//# sourceMappingURL=Button.js.map