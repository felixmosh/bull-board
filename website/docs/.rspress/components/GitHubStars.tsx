import { useEffect, useState } from 'react';

const REPO = 'felixmosh/bull-board';
const CACHE_KEY = 'bull-board:gh-stars';
const CACHE_TTL_MS = 60 * 60 * 1000;

function formatCompact(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + 'M';
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + 'k';
  }
  return String(n);
}

function readCache(): number | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { count: number; ts: number };
    if (typeof parsed.count !== 'number' || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.count;
  } catch {
    return null;
  }
}

function writeCache(count: number) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ count, ts: Date.now() }));
  } catch {}
}

export default function GitHubStars() {
  const [stars, setStars] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const cached = readCache();
    if (cached !== null) {
      setStars(cached);
      return;
    }
    fetch(`https://api.github.com/repos/${REPO}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { stargazers_count?: number }) => {
        if (typeof data.stargazers_count !== 'number') throw new Error('missing stargazers_count');
        setStars(data.stargazers_count);
        writeCache(data.stargazers_count);
      })
      .catch(() => setFailed(true));
  }, []);

  const label = failed || stars === null ? 'GitHub' : formatCompact(stars);

  return (
    <a
      className="gh-stars"
      href="https://github.com/felixmosh/bull-board"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="GitHub stars"
    >
      <span className="gh-stars__icon" aria-hidden="true">&#9733;</span>
      <span className="gh-stars__count">{label}</span>
    </a>
  );
}
