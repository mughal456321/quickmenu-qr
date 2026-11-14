/**
 * Tiny per-restaurant menu cache (D-8, Phase 05).
 *
 * Five seconds is short enough that availability changes appear quickly and
 * long enough to absorb a burst of scans. Owner writes invalidate the whole
 * restaurant namespace, so a change is visible on the next request.
 */
interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const DEFAULT_TTL_MS = 5_000;

class MenuCache {
  private readonly entries = new Map<string, CacheEntry>();

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
    this.entries.set(key, { expiresAt: Date.now() + ttlMs, value });
  }

  invalidate(restaurantId: string): void {
    const prefix = `${restaurantId}:`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

export const menuCache = new MenuCache();
