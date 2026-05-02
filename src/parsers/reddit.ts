/**
 * Reddit source parser.
 *
 * Fetches posts from a subreddit (hot) or searches Reddit,
 * normalizes them into IGS NewsItem format via the shared
 * {@link normalizeRedditPost} utility.
 *
 * Rate-limit integration:
 * - Platform-level: 60 req / 60 s (global across all Reddit sources)
 * - Source-level: optional per-source interval (SourceRateLimit)
 *
 * @module
 */

import {
  getSubredditPosts,
  searchReddit,
  normalizeRedditPost,
} from '../utils/reddit-api.js';
import {
  RateLimiter,
  sourceRateLimitKey,
  platformRateLimitKey,
  REDDIT_PLATFORM_LIMIT,
} from '../utils/rate-limiter.js';
import type { NewsItem, Source } from '../types/news.js';

// ---------------------------------------------------------------------------
// Singleton rate limiter for all Reddit sources
// ---------------------------------------------------------------------------

const redditLimiter = new RateLimiter();
redditLimiter.setLimit(platformRateLimitKey('reddit'), REDDIT_PLATFORM_LIMIT);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract subreddit name from a source id like `"reddit_worldnews"`.
 * Falls back to the raw id if no `reddit_` prefix is found.
 */
function extractSubredditFromId(id: string): string {
  return id.startsWith('reddit_') ? id.slice(7) : id;
}

/**
 * Resolve the subreddit name from a Source object.
 *
 * Priority:
 * 1. `source.url`  (explicit subreddit name, e.g. `"worldnews"`)
 * 2. `source.id`   (e.g. `"reddit_worldnews"` → `"worldnews"`)
 */
function resolveSubreddit(source: Source): string {
  return source.url || extractSubredditFromId(source.id);
}

// ---------------------------------------------------------------------------
// Rate-limit helpers
// ---------------------------------------------------------------------------

/**
 * Wait for both platform-level and source-level rate-limit slots.
 */
async function applyRateLimits(source: Source): Promise<void> {
  // Platform-wide: Reddit 60 req/minute
  await redditLimiter.wait(platformRateLimitKey('reddit'), 30_000);

  // Per-source interval
  if (source.rate_limit) {
    await redditLimiter.wait(
      sourceRateLimitKey(source.id),
      source.rate_limit.interval_seconds * 1000,
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch hot posts from a subreddit and normalize them into `NewsItem`s.
 *
 * @param source - The Source configuration. `source.url` or `source.id`
 *                 determines which subreddit to read.
 *
 * @returns Normalized news items. Returns `[]` on failure instead of
 *          throwing (pipeline resilience).
 */
export async function parseReddit(source: Source): Promise<NewsItem[]> {
  const subreddit = resolveSubreddit(source);

  try {
    await applyRateLimits(source);

    const rawPosts = await getSubredditPosts(
      subreddit,
      source.rate_limit?.batch_size || 25,
    );

    const poolId = source.pools[0] || 'UNKNOWN';
    return rawPosts.map((post) => normalizeRedditPost(post, source.name, poolId));
  } catch (err) {
    console.error(`[reddit] parseReddit failed for "${subreddit}":`, err);
    return [];
  }
}

/**
 * Search Reddit for posts matching `query` and normalize them into
 * `NewsItem`s.
 *
 * Scopes the search to the source's subreddit when available.
 *
 * @param source - Source configuration (subreddit extracted from url/id).
 * @param query  - Free-text search query.
 *
 * @returns Normalized news items. Returns `[]` on failure.
 */
export async function parseRedditSearch(
  source: Source,
  query: string,
): Promise<NewsItem[]> {
  const subreddit = resolveSubreddit(source);

  try {
    await applyRateLimits(source);

    const rawPosts = await searchReddit({
      subreddits: subreddit ? [subreddit] : undefined,
      query,
      sort: 'relevance',
      limit: source.rate_limit?.batch_size || 25,
    });

    const poolId = source.pools[0] || 'UNKNOWN';
    return rawPosts.map((post) => normalizeRedditPost(post, source.name, poolId));
  } catch (err) {
    console.error(
      `[reddit] parseRedditSearch failed for query "${query}":`,
      err,
    );
    return [];
  }
}
