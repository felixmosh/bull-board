import cn from 'clsx';
import React from 'react';
import { asyncHighlight } from '../../utils/highlight/highlight';

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
    return this.highlightCode();
  }

  public componentDidUpdate() {
    return this.highlightCode();
  }

  public render() {
    const { language } = this.props;
    return (
      <pre ref={this.codeRef}>
        <code className={cn('hljs', language)} />
      </pre>
    );
  }

  private async highlightCode() {
    const node = this.codeRef.current?.querySelector('code');
    if (node) {
      node.innerHTML = await asyncHighlight(this.props.children as string, this.props.language);
    }
  }
}
