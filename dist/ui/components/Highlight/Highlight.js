"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Highlight = void 0;
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const core_1 = __importDefault(require("highlight.js/lib/core"));
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const json_1 = __importDefault(require("highlight.js/lib/languages/json"));
const react_1 = __importDefault(require("react"));
const stacktrace_1 = require("./languages/stacktrace");
core_1.default.registerLanguage('json', json_1.default);
core_1.default.registerLanguage('stacktrace', stacktrace_1.stacktraceJS);
class Highlight extends react_1.default.Component {
    constructor() {
        super(...arguments);
        this.codeRef = react_1.default.createRef();
    }
    shouldComponentUpdate(nextProps) {
        return (nextProps.language !== this.props.language ||
            (Array.isArray(this.props.children)
                ? this.props.children.some((item) => ![].concat(nextProps.children).includes(item))
                : nextProps.children !== this.props.children));
    }
    componentDidMount() {
        this.highlightCode();
    }
    componentDidUpdate() {
        this.highlightCode();
    }
    render() {
        const { language, children } = this.props;
        return (react_1.default.createElement("pre", { ref: this.codeRef },
            react_1.default.createElement("code", { className: language }, children)));
    }
    highlightCode() {
        var _a;
        const node = (_a = this.codeRef.current) === null || _a === void 0 ? void 0 : _a.querySelector('code');
        core_1.default.highlightBlock(node);
    }
}
exports.Highlight = Highlight;
//# sourceMappingURL=Highlight.js.map