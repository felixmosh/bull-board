// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import hljs from 'highlight.js/lib/core';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import json from 'highlight.js/lib/languages/json';
import React from 'react';
import { stacktraceJS } from './languages/stacktrace';

hljs.registerLanguage('json', json);
hljs.registerLanguage('stacktrace', stacktraceJS);

interface HighlightProps {
  language: 'json' | 'stacktrace';
  children: string | null;
}

export class Highlight extends React.Component<HighlightProps> {
  private codeRef = React.createRef<HTMLPreElement>();

  public shouldComponentUpdate(nextProps: Readonly<HighlightProps>) {
    return (
      nextProps.language !== this.props.language ||
      (Array.isArray(this.props.children)
        ? this.props.children.some(
            (item: any) => !([] as any).concat(nextProps.children).includes(item)
          )
        : nextProps.children !== this.props.children)
    );
  }

  public componentDidMount() {
    this.highlightCode();
  }

  public componentDidUpdate() {
    this.highlightCode();
  }

  public render() {
    const { language } = this.props;
    return (
      <pre ref={this.codeRef}>
        <code className={language} />
      </pre>
    );
  }

  private highlightCode() {
    const node = this.codeRef.current?.querySelector('code');
    if (node) {
      node.textContent = this.props.children;
      hljs.highlightElement(node);
    }
  }
}
