import { withBase } from '@rspress/core/runtime';

const NAV = [
  { text: 'Guide', link: '/guide/introduction' },
  { text: 'Queue Adapters', link: '/queue-adapters/' },
  { text: 'Server Adapters', link: '/server-adapters/' },
  { text: 'Recipes', link: '/recipes/' },
  { text: 'Reference', link: '/configuration/ui-config' },
];

// Iframed on purpose: mounting Scalar inside the Rspress app races and breaks its layout.
export function ApiReference() {
  return (
    <div className="api-shell">
      <header className="api-topbar">
        <a className="api-topbar__brand" href={withBase('/')}>
          <img src={withBase('/logo.svg')} alt="" width={24} height={24} />
          <span>Bull-Board</span>
        </a>

        <nav className="api-topbar__nav">
          {NAV.map((item) => (
            <a key={item.link} href={withBase(item.link)}>
              {item.text}
            </a>
          ))}
          <span className="api-topbar__current" aria-current="page">
            API Reference
          </span>
        </nav>

        <div className="api-topbar__end">
          <a href={withBase('/reference/http-api')}>Plain text</a>
          <a href={withBase('/demo/')} target="_blank" rel="noopener">
            Demo
          </a>
          <a
            className="api-topbar__icon"
            href="https://github.com/felixmosh/bull-board"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
        </div>
      </header>
      <iframe className="api-frame" src={withBase('/reference.html')} title="HTTP API reference" />
    </div>
  );
}
