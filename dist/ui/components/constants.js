"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FIELDS = exports.STATUS_LIST = exports.STATUSES = void 0;
exports.STATUSES = {
    latest: 'latest',
    active: 'active',
    waiting: 'waiting',
    completed: 'completed',
    failed: 'failed',
    delayed: 'delayed',
    paused: 'paused',
};
exports.STATUS_LIST = [
    exports.STATUSES.latest,
    exports.STATUSES.active,
    exports.STATUSES.waiting,
    exports.STATUSES.completed,
    exports.STATUSES.failed,
    exports.STATUSES.delayed,
    exports.STATUSES.paused,
];
exports.FIELDS = {
    active: ['attempts', 'data', 'id', 'name', 'opts', 'progress', 'timestamps'],
    completed: [
        'attempts',
        'data',
        'id',
        'name',
        'opts',
        'progress',
        'timestamps',
    ],
    delayed: [
        'attempts',
        'data',
        'delay',
        'id',
        'name',
        'opts',
        'promote',
        'timestamps',
        'clean',
    ],
    failed: [
        'attempts',
        'failedReason',
        'data',
        'opts',
        'id',
        'name',
        'progress',
        'retry',
        'timestamps',
        'clean',
    ],
    latest: ['attempts', 'data', 'id', 'name', 'opts', 'progress', 'timestamps'],
    paused: ['attempts', 'data', 'id', 'name', 'opts', 'timestamps'],
    waiting: ['data', 'id', 'name', 'opts', 'timestamps', 'clean'],
};
//# sourceMappingURL=constants.js.map