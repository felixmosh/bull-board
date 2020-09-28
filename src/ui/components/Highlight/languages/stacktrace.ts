/*
Language: StacktraceJS
Author: Brian Lagerman <lagerman@netpoint.de>
Contributors: Irakli Abetschkhrischwili <irakli@netpoint.de>
Description: Browser stacktraces formatted via stacktrace.js (https://www.stacktracejs.com/)

Based on: https://github.com/highlightjs/highlight.js/pull/2037/files
*/

export function stacktraceJS() {
  const KEYWORDS = {
    keyword: 'async prototype anonymous function',
  }
  const ERROR = {
    className: 'type',
    begin: '^\\w{0,}Error:',
    relevance: 40, // We're really not less
  }
  const LINE_NUMBER = {
    className: 'number',
    begin: ':[0-9]{1,}',
  }
  const FUNCTION = {
    className: 'function',
    begin: '^',
    end: '\\(.*.?\\)',
    keywords: KEYWORDS,
    excludeEnd: true,
  }
  return {
    // eslint-disable-next-line @typescript-eslint/camelcase
    case_insensitive: true,

    contains: [
      ERROR,
      LINE_NUMBER,
      {
        className: 'link',
        contains: [LINE_NUMBER],
        variants: [
          {
            begin: '@\\s{0,}',
            excludeBegin: true,
            end: '$',
          },
          {
            begin: 'https?://',
            end: '.(\\.m?js)',
          },
        ],
      },
      FUNCTION,
    ],
  }
}
