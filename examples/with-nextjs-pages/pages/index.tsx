export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 40, lineHeight: 1.6 }}>
      <h1>bull-board + Next.js (Pages Router)</h1>
      <ul>
        <li>
          <a href="/api/queues">Open the dashboard</a>
        </li>
        <li>
          <a href="/api/add?title=Example">Add a job</a>
        </li>
      </ul>
      <p>
        Run <code>yarn worker</code> in a second terminal to process the jobs you add.
      </p>
    </main>
  );
}
