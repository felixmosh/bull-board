"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useStore = void 0;
const query_string_1 = __importDefault(require("query-string"));
const react_1 = require("react");
const constants_1 = require("../components/constants");
const interval = 5000;
const useStore = (basePath) => {
    const [state, setState] = react_1.useState({
        data: null,
        loading: true,
    });
    const [selectedStatuses, setSelectedStatuses] = react_1.useState({});
    const poll = react_1.useRef(undefined);
    const stopPolling = () => {
        if (poll.current) {
            clearTimeout(poll.current);
            poll.current = undefined;
        }
    };
    react_1.useEffect(() => {
        stopPolling();
        runPolling();
        return stopPolling;
    }, [selectedStatuses]);
    const runPolling = () => {
        update()
            // eslint-disable-next-line no-console
            .catch((error) => console.error('Failed to poll', error))
            .then(() => {
            const timeoutId = setTimeout(runPolling, interval);
            poll.current = timeoutId;
        });
    };
    const update = () => fetch(`${basePath}/api/queues/?${query_string_1.default.stringify(selectedStatuses)}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(res)))
        .then((data) => {
        setState({ data, loading: false });
        if (state.loading) {
            setSelectedStatuses(data.queues.reduce((result, queue) => {
                result[queue.name] = result[queue.name] || constants_1.STATUS_LIST[0];
                return result;
            }, {}));
        }
    });
    const promoteJob = (queueName) => (job) => () => fetch(`${basePath}/api/queues/${encodeURIComponent(queueName)}/${job.id}/promote`, {
        method: 'put',
    }).then(update);
    const retryJob = (queueName) => (job) => () => fetch(`${basePath}/api/queues/${encodeURIComponent(queueName)}/${job.id}/retry`, {
        method: 'put',
    }).then(update);
    const cleanJob = (queueName) => (job) => () => fetch(`${basePath}/api/queues/${encodeURIComponent(queueName)}/${job.id}/clean`, {
        method: 'put',
    }).then(update);
    const retryAll = (queueName) => () => fetch(`${basePath}/api/queues/${encodeURIComponent(queueName)}/retry`, {
        method: 'put',
    }).then(update);
    const cleanAllDelayed = (queueName) => () => fetch(`${basePath}/api/queues/${encodeURIComponent(queueName)}/clean/delayed`, {
        method: 'put',
    }).then(update);
    const cleanAllFailed = (queueName) => () => fetch(`${basePath}/api/queues/${encodeURIComponent(queueName)}/clean/failed`, {
        method: 'put',
    }).then(update);
    const cleanAllCompleted = (queueName) => () => fetch(`${basePath}/api/queues/${encodeURIComponent(queueName)}/clean/completed`, {
        method: 'put',
    }).then(update);
    return {
        state,
        actions: {
            promoteJob,
            retryJob,
            retryAll,
            cleanJob,
            cleanAllDelayed,
            cleanAllFailed,
            cleanAllCompleted,
            setSelectedStatuses,
        },
        selectedStatuses,
    };
};
exports.useStore = useStore;
//# sourceMappingURL=useStore.js.map