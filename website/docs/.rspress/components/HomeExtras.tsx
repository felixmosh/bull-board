import { withBase } from '@rspress/core/runtime';

const links = [
  {
    to: '/guide/introduction',
    title: 'New here',
    body: 'What bull-board is, the two ways to run it, and what you get.',
  },
  {
    to: '/guide/exploring-the-dashboard',
    title: 'Explore the dashboard',
    body: 'The feature tour: grouping, search, schedulers, the queue info panel, and why a job is not moving.',
  },
  {
    to: '/server-adapters/',
    title: 'Go to your adapter',
    body: 'Express, Fastify, NestJS, Koa, Hapi, Hono, H3, Elysia, Bun.',
  },
  {
    to: '/configuration/ui-config',
    title: 'Already wired up',
    body: 'UIConfig, read-only mode, visibility guards, formatters, theming.',
  },
];

export default function HomeExtras() {
  return (
    <div className="home-extras">
      <figure className="home-extras__figure">
        <picture>
          <source
            media="(prefers-color-scheme: dark)"
            srcSet={withBase('/screenshots/dashboard-overview-dark.png')}
          />
          <source
            media="(prefers-color-scheme: light)"
            srcSet={withBase('/screenshots/dashboard-overview.png')}
          />
          <img
            src={withBase('/screenshots/dashboard-overview.png')}
            alt="bull-board dashboard showing queues grouped by emails, billing, reports and notifications with per-state counts"
          />
        </picture>
        <figcaption>Queues, jobs, metrics, logs.</figcaption>
      </figure>

      <section className="home-extras__section">
        <h2>Look at a queue right now</h2>
        <p>
          If you already have a Redis with queues in it, one command serves the dashboard against
          it. Nothing to install, no code to write.
        </p>
        <pre>
          <code>npx @bull-board/cli -r redis://localhost:6379</code>
        </pre>
        <p>
          The same thing runs as a container with <code>ghcr.io/felixmosh/bull-board</code>. Both
          are covered in the <a href={withBase('/guide/cli')}>CLI guide</a> and{' '}
          <a href={withBase('/guide/docker')}>Run with Docker</a>. Everything runs on your own
          machines and talks to your own datastore. There is no telemetry and no third party
          involved.
        </p>
      </section>

      <section className="home-extras__section">
        <h2>Explore the docs</h2>
        <div className="home-extras__links">
          {links.map((link) => (
            <a key={link.to} className="home-extras__link" href={withBase(link.to)}>
              <strong>{link.title}</strong>
              <span>{link.body}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
