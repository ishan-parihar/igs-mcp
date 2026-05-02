/**
 * Centralized rate limiter for API request throttling.
 *
 * Supports two modes:
 * 1. Per-source interval limiting (based on SourceRateLimit.interval_seconds)
 * 2. Per-platform aggregate quota (e.g., 60 req/min for Reddit)
 *
 * Uses sliding-window counters with in-memory Map storage.
 * No external dependencies required.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the sliding window */
  maxRequests: number;
  /** Sliding window duration in milliseconds */
  windowMs: number;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/**
 * Thrown when a rate-limited operation times out waiting for a slot.
 */
export class RateLimitError extends Error {
  public readonly key: string;
  public readonly retryAfterMs: number;

  constructor(key: string, retryAfterMs: number, message?: string) {
    super(message ?? `Rate limit exceeded for key "${key}". Retry after ${retryAfterMs}ms.`);
    this.name = 'RateLimitError';
    this.key = key;
    this.retryAfterMs = retryAfterMs;
  }
}

// ---------------------------------------------------------------------------
// Default presets
// ---------------------------------------------------------------------------

/** Reddit: 60 requests per 60 seconds */
export const REDDIT_PLATFORM_LIMIT: RateLimitConfig = {
  maxRequests: 60,
  windowMs: 60_000,
};

/** Twitter/X: 450 requests per 15 minutes */
export const TWITTER_PLATFORM_LIMIT: RateLimitConfig = {
  maxRequests: 450,
  windowMs: 900_000,
};

/** Default interval between source fetches: 5 minutes */
export const DEFAULT_SOURCE_INTERVAL_MS: number = 300_000;

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

/**
 * Build a rate-limiter key for a specific source.
 * Used with SourceRateLimit.interval_seconds.
 */
export function sourceRateLimitKey(sourceId: string): string {
  return `source:${sourceId}`;
}

/**
 * Build a rate-limiter key for an entire platform.
 * Used with platform-wide quotas (e.g., Reddit, Twitter).
 */
export function platformRateLimitKey(platform: string): string {
  return `platform:${platform}`;
}

// ---------------------------------------------------------------------------
// RateLimiter
// ---------------------------------------------------------------------------

/**
 * Sliding-window rate limiter.
 *
 * ```ts
 * const limiter = new RateLimiter();
 * limiter.setLimit(sourceRateLimitKey('my-source'), {
 *   maxRequests: 1,
 *   windowMs: 300_000,
 * });
 *
 * await limiter.wait(sourceRateLimitKey('my-source'), 30_000);
 * // ... make request ...
 * ```
 */
export class RateLimiter {
  /** key → sorted array of request timestamps (most recent last) */
  private limits: Map<string, number[]> = new Map();
  /** key → configuration */
  private configs: Map<string, RateLimitConfig> = new Map();

  constructor() {}

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Register or update a rate limit configuration for a key.
   */
  setLimit(key: string, config: RateLimitConfig): void {
    this.configs.set(key, { ...config });
  }

  /**
   * Check whether a request for `key` is allowed **right now**.
   *
   * @returns `true` if the request would be accepted (slot available).
   *          `true` if no limit has been configured for this key.
   */
  check(key: string): boolean {
    const config = this.configs.get(key);
    if (!config) return true;

    this.prune(key);

    const timestamps = this.limits.get(key);
    return timestamps === undefined || timestamps.length < config.maxRequests;
  }

  /**
   * Wait until a slot becomes available for `key`, then record the request.
   *
   * Polls every 100 ms. Throws {@link RateLimitError} if the timeout
   * is exceeded.
   *
   * @param key       The rate-limit key.
   * @param timeoutMs Max wait time in ms (default 30 000).
   */
  async wait(key: string, timeoutMs: number = 30_000): Promise<void> {
    const config = this.configs.get(key);
    if (!config) return;

    const deadline = Date.now() + timeoutMs;

    while (true) {
      if (this.check(key)) {
        const timestamps = this.limits.get(key) ?? [];
        timestamps.push(Date.now());
        this.limits.set(key, timestamps);
        return;
      }

      if (Date.now() >= deadline) {
        const retryAfterMs = this.timeUntilNext(key);
        throw new RateLimitError(key, retryAfterMs);
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Number of requests remaining in the current sliding window for `key`.
   *
   * @returns Remaining slots, or `Infinity` if no limit is configured.
   */
  remaining(key: string): number {
    const config = this.configs.get(key);
    if (!config) return Infinity;

    this.prune(key);
    const timestamps = this.limits.get(key);
    return timestamps ? Math.max(0, config.maxRequests - timestamps.length) : config.maxRequests;
  }

  /**
   * Milliseconds until the next slot becomes available for `key`.
   *
   * @returns `0` if a slot is already available, or positive ms otherwise.
   */
  timeUntilNext(key: string): number {
    const config = this.configs.get(key);
    if (!config) return 0;

    this.prune(key);
    const timestamps = this.limits.get(key);

    if (!timestamps || timestamps.length < config.maxRequests) return 0;

    const oldest = timestamps[0];
    const remaining = config.windowMs - (Date.now() - oldest);
    return Math.max(0, remaining);
  }

  /**
   * Reset all rate-limit state and configuration for `key`.
   */
  reset(key: string): void {
    this.limits.delete(key);
    this.configs.delete(key);
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private prune(key: string): void {
    const config = this.configs.get(key);
    if (!config) return;

    const now = Date.now();
    const cutoff = now - config.windowMs;
    const timestamps = this.limits.get(key);
    if (!timestamps || timestamps.length === 0) return;

    const firstValid = lowerBound(timestamps, cutoff + 1);

    if (firstValid === 0) return;
    if (firstValid >= timestamps.length) {
      this.limits.delete(key);
      return;
    }

    this.limits.set(key, timestamps.slice(firstValid));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the leftmost index in a **sorted** array where `value` could be
 * inserted while maintaining order (i.e. first element >= value).
 *
 * Equivalent to `std::lower_bound` / Python `bisect_left`.
 */
function lowerBound(arr: number[], value: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
