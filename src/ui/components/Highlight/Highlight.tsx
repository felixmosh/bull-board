// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
// @ts-ignore
import hljs from 'highlight.js/lib/highlight'
// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
// @ts-ignore
import json from 'highlight.js/lib/languages/json'
import React from 'react'
import { stacktraceJS } from './languages/stacktrace'

hljs.registerLanguage('json', json)
hljs.registerLanguage('stacktrace', stacktraceJS)

interface HighlightProps {
  language: 'json' | 'stacktrace'
  children: string | string[] | null
}

export class Highlight extends React.Component<HighlightProps> {
  private codeRef = React.createRef<HTMLDivElement>()

  public shouldComponentUpdate(nextProps: Readonly<HighlightProps>) {
    return (
      nextProps.language !== this.props.language ||
      (Array.isArray(this.props.children)
        ? this.props.children.some(
            (item: any) =>
              !([] as any).concat(nextProps.children).includes(item),
          )
        : nextProps.children !== this.props.children)
    )
  }

  public componentDidMount() {
    hljs.highlightBlock(this.codeRef.current)
  }

  public componentDidUpdate() {
    hljs.highlightBlock(this.codeRef.current)
  }

  public render() {
    const { language, children } = this.props
    return (
      <pre>
        <code className={language} ref={this.codeRef}>
          {children}
        </code>
      </pre>
    )
  }
}
