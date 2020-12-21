"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = exports.replaceQueues = exports.setQueues = exports.BullAdapter = exports.BullMQAdapter = void 0;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cleanAll_1 = require("./routes/cleanAll");
const cleanJob_1 = require("./routes/cleanJob");
const index_1 = require("./routes/index");
const promoteJob_1 = require("./routes/promoteJob");
const queues_1 = require("./routes/queues");
const retryAll_1 = require("./routes/retryAll");
const retryJob_1 = require("./routes/retryJob");
var bullMQ_1 = require("./queueAdapters/bullMQ");
Object.defineProperty(exports, "BullMQAdapter", { enumerable: true, get: function () { return bullMQ_1.BullMQAdapter; } });
var bull_1 = require("./queueAdapters/bull");
Object.defineProperty(exports, "BullAdapter", { enumerable: true, get: function () { return bull_1.BullAdapter; } });
const bullBoardQueues = {};
const wrapAsync = (fn) => async (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const router = express_1.default();
exports.router = router;
router.locals.bullBoardQueues = bullBoardQueues;
router.set('view engine', 'ejs');
router.set('views', path_1.default.resolve(__dirname, '../dist/ui'));
router.use('/static', express_1.default.static(path_1.default.resolve(__dirname, '../static')));
router.get(['/', '/queue/:queueName'], index_1.entryPoint);
router.get('/api/queues', wrapAsync(queues_1.queuesHandler));
router.put('/api/queues/:queueName/retry', wrapAsync(retryAll_1.retryAll));
router.put('/api/queues/:queueName/:id/retry', wrapAsync(retryJob_1.retryJob));
router.put('/api/queues/:queueName/:id/clean', wrapAsync(cleanJob_1.cleanJob));
router.put('/api/queues/:queueName/:id/promote', wrapAsync(promoteJob_1.promoteJob));
router.put('/api/queues/:queueName/clean/:queueStatus', wrapAsync(cleanAll_1.cleanAll));
const setQueues = (bullQueues) => {
    bullQueues.forEach((queue) => {
        const name = queue.getName();
        bullBoardQueues[name] = { queue };
    });
};
exports.setQueues = setQueues;
const replaceQueues = (bullQueues) => {
    const queuesToPersist = bullQueues.map((queue) => queue.getName());
    Object.keys(bullBoardQueues).forEach((name) => {
        if (queuesToPersist.indexOf(name) === -1) {
            delete bullBoardQueues[name];
        }
    });
    return exports.setQueues(bullQueues);
};
exports.replaceQueues = replaceQueues;
//# sourceMappingURL=index.js.map