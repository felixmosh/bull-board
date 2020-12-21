export declare function stacktraceJS(): {
    case_insensitive: boolean;
    contains: ({
        className: string;
        begin: RegExp;
        relevance: number;
        contains: {
            className: string;
            begin: RegExp;
            end: RegExp;
            excludeStart: boolean;
            endsWithParent: boolean;
        }[];
    } | {
        className: string;
        begin: string;
        relevance: number;
    } | {
        className: string;
        begin: RegExp;
        end: RegExp;
        keywords: string;
        contains: {
            className: string;
            begin: RegExp;
            end: RegExp;
            excludeEnd: boolean;
            excludeBegin: boolean;
            contains: {
                className: string;
                begin: string;
                relevance: number;
            }[];
        }[];
    })[];
};
