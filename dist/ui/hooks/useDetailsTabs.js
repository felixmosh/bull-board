"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useDetailsTabs = void 0;
const react_1 = __importStar(require("react"));
const constants_1 = require("../components/constants");
const Highlight_1 = require("../components/Highlight/Highlight");
const regularItems = ['Data', 'Options'];
function useDetailsTabs(currentStatus) {
    const [tabs, updateTabs] = react_1.useState([]);
    const [selectedTabIdx, setSelectedTabIdx] = react_1.useState(0);
    const selectedTab = tabs[selectedTabIdx];
    react_1.useEffect(() => {
        updateTabs((currentStatus === constants_1.STATUSES.failed ? ['Error'] : []).concat(regularItems));
    }, [currentStatus]);
    return {
        tabs: tabs.map((title, index) => ({
            title,
            isActive: title === selectedTab,
            selectTab: () => setSelectedTabIdx(index),
        })),
        selectedTab,
        getTabContent: ({ data, returnValue, opts, failedReason, stacktrace, }) => {
            switch (selectedTab) {
                case 'Data':
                    return (react_1.default.createElement(Highlight_1.Highlight, { language: "json" }, JSON.stringify({ data, returnValue }, null, 2)));
                case 'Options':
                    return (react_1.default.createElement(Highlight_1.Highlight, { language: "json" }, JSON.stringify(opts, null, 2)));
                case 'Error':
                    return (react_1.default.createElement(react_1.default.Fragment, null,
                        !failedReason && react_1.default.createElement("div", { className: "error" }, 'NA'),
                        react_1.default.createElement(Highlight_1.Highlight, { language: "stacktrace", key: "stacktrace" }, stacktrace)));
                default:
                    return null;
            }
        },
    };
}
exports.useDetailsTabs = useDetailsTabs;
//# sourceMappingURL=useDetailsTabs.js.map