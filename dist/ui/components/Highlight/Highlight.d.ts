import React from 'react';
interface HighlightProps {
    language: 'json' | 'stacktrace';
    children: string | string[] | null;
}
export declare class Highlight extends React.Component<HighlightProps> {
    private codeRef;
    shouldComponentUpdate(nextProps: Readonly<HighlightProps>): boolean;
    componentDidMount(): void;
    componentDidUpdate(): void;
    render(): JSX.Element;
    private highlightCode;
}
export {};
