<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

const REPO = 'felixmosh/bull-board';
const CACHE_KEY = 'bull-board:gh-stars';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const stars = ref<number | null>(null);
const failed = ref(false);

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

const label = computed(() => {
  if (failed.value || stars.value === null) return 'GitHub';
  return formatCompact(stars.value);
});

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
  } catch {
    // ignore quota / disabled storage
  }
}

onMounted(async () => {
  const cached = readCache();
  if (cached !== null) {
    stars.value = cached;
    return;
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { stargazers_count?: number };
    if (typeof data.stargazers_count !== 'number') throw new Error('missing stargazers_count');
    stars.value = data.stargazers_count;
    writeCache(data.stargazers_count);
  } catch {
    failed.value = true;
  }
});
</script>

<template>
  <a
    class="gh-stars"
    href="https://github.com/felixmosh/bull-board"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="GitHub stars"
  >
    <span class="gh-stars__icon" aria-hidden="true">★</span>
    <span class="gh-stars__count">{{ label }}</span>
  </a>
</template>

<style scoped>
.gh-stars {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.75rem;
  height: var(--vp-nav-height, 64px);
  font-family: var(--vp-font-family-base);
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: color 0.25s;
  line-height: 1;
}

.gh-stars:hover {
  color: var(--vp-c-brand-1);
}

.gh-stars__icon {
  color: var(--vp-c-brand-1);
  font-size: 14px;
}

.gh-stars__count {
  font-variant-numeric: tabular-nums;
}
</style>
