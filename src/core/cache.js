const DEFAULT_TTL_MS = 3000;

export function createAnalysisCache({ ttlMs = DEFAULT_TTL_MS } = {}) {
  const store = new Map();

  function now() {
    return Date.now();
  }

  function prune() {
    const cutoff = now() - ttlMs;
    for (const [key, value] of store.entries()) {
      if (value.at <= cutoff) store.delete(key);
    }
  }

  return {
    get(key) {
      prune();
      const entry = store.get(key);
      if (!entry) return null;
      return entry.value;
    },
    set(key, value) {
      store.set(key, { at: now(), value });
      prune();
      return value;
    },
    clear() {
      store.clear();
    },
    has(key) {
      return this.get(key) !== null;
    },
  };
}

export const analysisCache = createAnalysisCache();

export function makeCacheKey(prefix, parts = {}) {
  const normalized = Object.entries(parts)
    .filter(([, value]) => value != null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join('|');
  return `${prefix}${normalized ? `:${normalized}` : ''}`;
}

export function clearAnalysisCache() {
  analysisCache.clear();
}
