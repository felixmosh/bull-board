"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisStats = void 0;
const pretty_bytes_1 = __importDefault(require("pretty-bytes"));
const react_1 = __importDefault(require("react"));
const RedisStats_module_css_1 = __importDefault(require("./RedisStats.module.css"));
const RedisLogo = () => (react_1.default.createElement("svg", { width: 42, role: "img", viewBox: "0 0 24 24" },
    react_1.default.createElement("path", { fill: "#CBD5E0", d: "M23.99314 6.28305c.012-.244-.307-.458-.949-.694-1.248-.457-7.843-3.082-9.106-3.545-1.263-.462-1.777-.443-3.261.089-1.484.533-8.506 3.287-9.755 3.776-.625.246-.931.473-.92.715v2.426c0 .242.334.498.97.802 1.272.608 8.332 3.461 9.448 3.994 1.116.533 1.9.54 3.313-.196 1.412-.736 8.047-3.465 9.328-4.132.651-.34.939-.604.939-.843 0-.225.001-2.392.001-2.392h-.008zm-15.399 2.296l5.561-.854-1.68 2.463-3.881-1.609zm12.299-2.218l-3.288 1.299-.357.14-3.287-1.299 3.642-1.44 3.29 1.3zm-9.655-2.383l-.538-.992 1.678.656 1.582-.518-.428 1.025 1.612.604-2.079.216-.466 1.12-.752-1.249-2.401-.216 1.792-.646zm-4.143 1.399c1.642 0 2.972.516 2.972 1.152 0 .636-1.331 1.152-2.972 1.152s-2.973-.517-2.973-1.152c0-.636 1.331-1.152 2.973-1.152z" }),
    react_1.default.createElement("path", { fill: "#E2E8F0", d: "M23.99314 10.38505c-.011.229-.313.484-.934.809-1.281.667-7.916 3.396-9.328 4.132-1.413.736-2.197.729-3.313.196-1.116-.533-8.176-3.386-9.448-3.994-.635-.303-.959-.56-.97-.801v2.426c0 .242.334.498.97.802 1.272.608 8.332 3.46 9.448 3.993 1.116.534 1.9.541 3.313-.195 1.412-.736 8.047-3.465 9.328-4.132.651-.34.939-.604.939-.843 0-.226.001-2.392.001-2.392-.001-.001-.004 0-.006-.001z" }),
    react_1.default.createElement("path", { fill: "#EDF2F7", d: "M23.99414 14.34005c-.01.229-.313.485-.935.81-1.281.667-7.916 3.396-9.328 4.132-1.413.736-2.197.729-3.313.195-1.116-.533-8.176-3.386-9.448-3.993-.635-.304-.959-.56-.97-.802v2.426c0 .242.334.499.97.803 1.272.608 8.333 3.46 9.448 3.993 1.116.534 1.9.541 3.313-.196 1.412-.736 8.047-3.464 9.328-4.132.651-.339.939-.603.939-.842 0-.226.001-2.392.001-2.392-.001-.001-.004-.001-.005-.002z" })));
const getMemoryUsage = (used_memory, total_system_memory) => {
    if (used_memory === undefined) {
        return '-';
    }
    const usedMemory = parseInt(used_memory, 10);
    if (total_system_memory === undefined) {
        return pretty_bytes_1.default(usedMemory);
    }
    const totalSystemMemory = parseInt(total_system_memory, 10);
    return `${((usedMemory / totalSystemMemory) * 100).toFixed(2)}%`;
};
const RedisStats = ({ stats }) => {
    const { redis_version, used_memory, total_system_memory, mem_fragmentation_ratio, connected_clients, blocked_clients, } = stats;
    return (react_1.default.createElement("div", { className: RedisStats_module_css_1.default.stats },
        react_1.default.createElement("div", null,
            react_1.default.createElement(RedisLogo, null)),
        react_1.default.createElement("div", null,
            "Version",
            react_1.default.createElement("span", null, redis_version)),
        react_1.default.createElement("div", null,
            "Memory usage",
            react_1.default.createElement("span", null, getMemoryUsage(used_memory, total_system_memory)),
            total_system_memory && used_memory ? (react_1.default.createElement("small", null,
                pretty_bytes_1.default(parseInt(used_memory)),
                " of",
                ' ',
                pretty_bytes_1.default(parseInt(total_system_memory)))) : (react_1.default.createElement("small", { className: "error" }, "Could not retrieve memory stats"))),
        react_1.default.createElement("div", null,
            "Fragmentation ratio",
            react_1.default.createElement("span", null, mem_fragmentation_ratio)),
        react_1.default.createElement("div", null,
            "Connected clients",
            react_1.default.createElement("span", null, connected_clients)),
        react_1.default.createElement("div", null,
            "Blocked clients",
            react_1.default.createElement("span", null, blocked_clients))));
};
exports.RedisStats = RedisStats;
//# sourceMappingURL=RedisStats.js.map