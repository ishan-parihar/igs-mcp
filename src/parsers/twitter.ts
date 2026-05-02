/**
 * Twitter/X source parser.
 *
 * Fetches recent tweets from a user's timeline and normalizes them into
 * IGS NewsItem format via the shared {@link normalizeTweet} utility.
 *
 * Rate-limit integration:
 * - Platform-level: 450 req / 15 min (global across all Twitter sources)
 * - Source-level: optional per-source interval (SourceRateLimit)
 *
 * @module
 */

import { TwitterClient, normalizeTweet } from '../utils/twitter-api.js';
import {
  RateLimiter,
  sourceRateLimitKey,
  platformRateLimitKey,
  TWITTER_PLATFORM_LIMIT,
} from '../utils/rate-limiter.js';
import type { NewsItem, Source } from '../types/news.js';

// ---------------------------------------------------------------------------
// Singleton Twitter client (lazy initialization)
// ---------------------------------------------------------------------------

let twitterClient: TwitterClient | null = null;

function getTwitterClient(): TwitterClient {
  if (!twitterClient) {
    twitterClient = new TwitterClient();
  }
  return twitterClient;
}

// ---------------------------------------------------------------------------
// Singleton rate limiter for all Twitter sources
// ---------------------------------------------------------------------------

const twitterLimiter = new RateLimiter();
twitterLimiter.setLimit(platformRateLimitKey('twitter'), TWITTER_PLATFORM_LIMIT);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract Twitter handle from a source id like `"twitter_foreignpolicy"`.
 * Falls back to the raw id if no `twitter_` prefix is found.
 */
function extractHandleFromId(id: string): string {
  return id.startsWith('twitter_') ? id.slice(8) : id;
}

/**
 * Resolve the Twitter handle from a Source object.
 *
 * Priority:
 * 1. `source.url`  (explicit handle, e.g. `"ForeignPolicy"`)
 * 2. `source.id`   (e.g. `"twitter_foreignpolicy"` → `"ForeignPolicy"`)
 */
function resolveHandle(source: Source): string {
  return source.url || extractHandleFromId(source.id);
}

// ---------------------------------------------------------------------------
// Rate-limit helpers
// ---------------------------------------------------------------------------

/**
 * Wait for both platform-level and source-level rate-limit slots.
 */
async function applyRateLimits(source: Source): Promise<void> {
  // Platform-wide: Twitter 450 req / 15 minutes
  await twitterLimiter.wait(platformRateLimitKey('twitter'), 30_000);

  // Per-source interval
  if (source.rate_limit) {
    await twitterLimiter.wait(
      sourceRateLimitKey(source.id),
      source.rate_limit.interval_seconds * 1000,
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch recent tweets from a user's timeline and normalize them into
 * `NewsItem`s.
 *
 * @param source - The Source configuration. `source.url` or `source.id`
 *                 determines which Twitter handle to read.
 *
 * @returns Normalized news items. Returns `[]` on failure instead of
 *          throwing (pipeline resilience).
 */
export async function parseTwitter(source: Source): Promise<NewsItem[]> {
  const handle = resolveHandle(source);

  try {
    await applyRateLimits(source);

    const client = getTwitterClient();
    const tweets = await client.getUserTimeline(
      handle,
      source.rate_limit?.batch_size || 50,
    );

    const poolId = source.pools[0] || 'UNKNOWN';
    return tweets.map((tweet) => normalizeTweet(tweet, source.name, poolId));
  } catch (err) {
    console.error(`[twitter] parseTwitter failed for "${handle}":`, err);
    return [];
  }
}
