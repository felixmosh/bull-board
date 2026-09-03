import { withBase } from '@rspress/core/runtime';

// Iframed on purpose: mounting Scalar inside the Rspress app races and breaks its layout.
export function ApiReference() {
  return (
    <div className="api-shell">
      <header className="api-topbar">
        <a className="api-topbar__back" href={withBase('/guide/introduction')}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 18l-6-6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <img src={withBase('/logo.svg')} alt="" width={20} height={20} />
          <span>bull-board docs</span>
        </a>
        <nav className="api-topbar__nav">
          <a href={withBase('/reference/http-api')}>Plain text</a>
          <a href={withBase('/recipes/access-control-hooks')}>Access control</a>
          <a href="https://github.com/felixmosh/bull-board" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </header>
      <iframe className="api-frame" src={withBase('/reference.html')} title="HTTP API reference" />
    </div>
  );
}
