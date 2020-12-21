"use strict";
/*
Language: StacktraceJS
Author: FelixMosh
Description: Node stacktrace highlighter
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.stacktraceJS = void 0;
function stacktraceJS() {
    const ERROR = {
        className: 'type',
        begin: /^\w*Error:\s*/,
        relevance: 40,
        contains: [
            {
                className: 'title',
                begin: /.*/,
                end: /$/,
                excludeStart: true,
                endsWithParent: true,
            },
        ],
    };
    const LINE_NUMBER = {
        className: 'number',
        begin: ':\\d+:\\d+',
        relevance: 5,
    };
    const TRACE_LINE = {
        className: 'trace-line',
        begin: /^\s*at/,
        end: /$/,
        keywords: 'at as async prototype anonymous function',
        contains: [
            {
                className: 'code-path',
                begin: /\(/,
                end: /\)$/,
                excludeEnd: true,
                excludeBegin: true,
                contains: [LINE_NUMBER],
            },
        ],
    };
    return {
        case_insensitive: true,
        contains: [ERROR, TRACE_LINE, LINE_NUMBER],
    };
}
exports.stacktraceJS = stacktraceJS;
//# sourceMappingURL=stacktrace.js.map