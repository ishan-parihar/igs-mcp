/**
 * Twitter/X API v2 utility with Nitter RSS fallback.
 *
 * Mode 1 (preferred): Twitter API v2 with Bearer Token auth
 *   - Reads `TWITTER_BEARER_TOKEN` from environment
 *   - Endpoint: /2/users/by/username/{username}/tweets
 *   - 450 requests per 15 min window (Pro tier)
 *
 * Mode 2 (fallback): Nitter RSS feed scraping
 *   - No authentication needed
 *   - Parses RSS feed for tweet text and timestamps
 *   - Tries multiple Nitter instances for reliability
 *   - Best-effort — may be unreliable
 *
 * @module
 */

import { request } from 'undici';
import { RateLimiter, platformRateLimitKey, TWITTER_PLATFORM_LIMIT } from './rate-limiter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Tweet {
  id: string;
  text: string;
  author_id?: string;
  author_username?: string;
  author_name?: string;
  created_at: string;  // ISO string
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
  referenced_tweets?: Array<{ type: string; id: string }>;
  attachments?: { media_keys: string[] };
  entities?: {
    urls?: Array<{ url: string; expanded_url: string; display_url: string }>;
    hashtags?: Array<{ tag: string }>;
    mentions?: Array<{ username: string }>;
  };
  source?: string;  // client used to post
  lang?: string;
  possibly_sensitive?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TWITTER_API_BASE = 'https://api.twitter.com/2';

/** Default Nitter instances to try in order of reliability. */
const NITTER_INSTANCES: string[] = [
  'https://nitter.net',
  'https://nitter.privacydev.net',
  'https://nitter.1d4.us',
  'https://nitter.kavin.rocks',
];

/** Tweet fields requested from the API v2. */
const TWEET_FIELDS = [
  'attachments',
  'author_id',
  'entities',
  'public_metrics',
  'referenced_tweets',
  'source',
  'lang',
  'possibly_sensitive',
  'created_at',
].join(',');

const USER_FIELDS = ['username', 'name'].join(',');

const EXPANSIONS = ['author_id', 'attachments.media_keys'].join(',');

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

const twitterLimiter = new RateLimiter();
twitterLimiter.setLimit(platformRateLimitKey('twitter'), TWITTER_PLATFORM_LIMIT);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decode common HTML entities in text (no external deps).
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_match, num) => String.fromCharCode(Number(num)));
}

/**
 * Minimal RSS feed parser (regex-based, no external deps).
 * Extracts title, link, pubDate, and description from <item> elements.
 */
function parseRSSFeed(xml: string): Array<{
  title: string;
  link: string;
  pubDate: string;
  description: string;
}> {
  const items: Array<{
    title: string;
    link: string;
    pubDate: string;
    description: string;
  }> = [];

  // Support both <item> and <entry> (Atom) feeds
  const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];

    const extract = (tag: string): string => {
      const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const m = re.exec(content);
      return m ? m[1].trim() : '';
    };

    const extractFromCdata = (tag: string): string => {
      const cdataRe = new RegExp(
        `<${tag}(?:\\s[^>]*)?><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`,
        'i',
      );
      const m = cdataRe.exec(content);
      if (m) return m[1].trim();
      return extract(tag);
    };

    const title = decodeHtmlEntities(extract('title'));
    const link = extract('link') || extract('id');  // Atom uses <id>
    const pubDate = extract('pubDate') || extract('published') || extract('updated');
    const description = decodeHtmlEntities(extractFromCdata('description') || extract('description') || extract('content') || title);

    if (title || link) {
      items.push({ title, link, pubDate, description });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Mode 1: Twitter API v2
// ---------------------------------------------------------------------------

/**
 * Resolve a @username to a numeric user ID via the Twitter API v2.
 */
async function resolveUserId(
  username: string,
  bearerToken: string,
): Promise<string | null> {
  try {
    const url = `${TWITTER_API_BASE}/users/by/username/${encodeURIComponent(username)}`;
    const res = await request(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: 'application/json',
      },
      headersTimeout: 10_000,
      bodyTimeout: 10_000,
    });

    if (res.statusCode !== 200) {
      console.error(`Twitter user resolution failed: ${res.statusCode}`);
      return null;
    }

    const body: any = JSON.parse(await res.body.text());
    return body.data?.id ?? null;
  } catch (err) {
    console.error('Twitter user resolution error:', err);
    return null;
  }
}

/**
 * Fetch tweets via the official Twitter API v2 using Bearer Token auth.
 */
async function fetchViaAPI(
  username: string,
  maxResults: number,
): Promise<Tweet[]> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    return [];
  }

  const userId = await resolveUserId(username, bearerToken);
  if (!userId) {
    return [];
  }

  const actualMax = Math.min(maxResults, 100); // API limit per request

  const url = new URL(`${TWITTER_API_BASE}/users/${userId}/tweets`);
  url.searchParams.set('max_results', String(actualMax));
  url.searchParams.set('tweet.fields', TWEET_FIELDS);
  url.searchParams.set('user.fields', USER_FIELDS);
  url.searchParams.set('expansions', EXPANSIONS);

  try {
    await twitterLimiter.wait(platformRateLimitKey('twitter'), 30_000);

    const res = await request(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: 'application/json',
      },
      headersTimeout: 15_000,
      bodyTimeout: 15_000,
    });

    if (res.statusCode !== 200) {
      console.error(`Twitter API returned ${res.statusCode}`);
      return [];
    }

    const body: any = JSON.parse(await res.body.text());
    const tweets: Tweet[] = body.data ?? [];

    // Enrich tweets with author info from the "includes" section
    if (body.includes?.users) {
      const userMap = new Map<string, { username: string; name: string }>();
      for (const user of body.includes.users) {
        userMap.set(user.id, { username: user.username, name: user.name });
      }
      for (const tweet of tweets) {
        if (tweet.author_id && userMap.has(tweet.author_id)) {
          const user = userMap.get(tweet.author_id)!;
          tweet.author_username = user.username;
          tweet.author_name = user.name;
        }
      }
    }

    return tweets;
  } catch (err) {
    console.error('Twitter API fetch error:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Mode 2: Nitter RSS fallback
// ---------------------------------------------------------------------------

/**
 * Fetch tweets by scraping a Nitter RSS feed (no auth required).
 *
 * Tries multiple Nitter instances in order. Returns as soon as one
 * returns at least one tweet.
 */
async function fetchViaNitter(
  username: string,
  maxResults: number,
): Promise<Tweet[]> {
  let lastError: Error | null = null;

  for (const instance of NITTER_INSTANCES) {
    try {
      const url = `${instance}/${encodeURIComponent(username)}/rss`;
      const res = await request(url, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; IGS/1.0; +https://github.com/igs-mcp)',
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
        headersTimeout: 10_000,
        bodyTimeout: 10_000,
      });

      if (res.statusCode !== 200) {
        console.error(`Nitter instance ${instance} returned ${res.statusCode}`);
        continue;
      }

      const xml = await res.body.text();
      const entries = parseRSSFeed(xml);

      const tweets: Tweet[] = [];
      for (const entry of entries) {
        if (tweets.length >= maxResults) break;

        // Extract tweet ID from the status link
        const tweetIdMatch = entry.link.match(/\/status\/(\d+)/);
        const tweetId = tweetIdMatch
          ? tweetIdMatch[1]
          : `nitter_${Date.now()}_${tweets.length}`;

        // Nitter <title> is usually "@{username} on Twitter: \"{text}\""
        // Prefer <description> which holds the full tweet body
        const text = entry.description || entry.title;

        tweets.push({
          id: tweetId,
          text,
          author_username: username,
          created_at: entry.pubDate
            ? new Date(entry.pubDate).toISOString()
            : new Date().toISOString(),
        });
      }

      if (tweets.length > 0) {
        return tweets;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`Nitter instance ${instance} failed:`, err);
      // Try next instance
    }
  }

  if (lastError) {
    console.error('All Nitter instances failed:', lastError);
  }
  return [];
}

// ---------------------------------------------------------------------------
// TwitterClient
// ---------------------------------------------------------------------------

/**
 * Client for fetching tweets from Twitter/X.
 *
 * Automatically selects the best available mode:
 *   1. Twitter API v2 (if `TWITTER_BEARER_TOKEN` env var is set)
 *   2. Nitter RSS scraping (no auth needed, best-effort)
 */
export class TwitterClient {
  /**
   * Fetch the most recent tweets from a user's timeline.
   *
   * @param username    Twitter handle (with or without leading `@`)
   * @param maxResults  Max tweets to return (default 20, max 100)
   */
  async getUserTimeline(
    username: string,
    maxResults: number = 20,
  ): Promise<Tweet[]> {
    const sanitized = username.replace(/^@/, '').trim().toLowerCase();
    if (!sanitized) {
      return [];
    }

    const limit = Math.min(Math.max(1, maxResults), 100);
    const bearerToken = process.env.TWITTER_BEARER_TOKEN;

    // Mode 1: API (preferred)
    if (bearerToken) {
      const tweets = await fetchViaAPI(sanitized, limit);
      if (tweets.length > 0) {
        return tweets;
      }
      console.warn(
        `Twitter API returned 0 tweets for @${sanitized}, falling back to Nitter...`,
      );
    }

    // Mode 2: Nitter fallback
    const nitterTweets = await fetchViaNitter(sanitized, limit);
    return nitterTweets;
  }
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a {@link Tweet} into a {@link import('./types/news.js').NewsItem}
 * shape suitable for IGS pipelines.
 *
 * @param tweet      The tweet to normalize.
 * @param sourceName Source name (e.g. `"@elonmusk"` or `"twitter (nitter)"`).
 * @param poolId     Target pool id (e.g. `"GLOBAL_TECH_CYBER"`).
 */
export function normalizeTweet(
  tweet: Tweet,
  sourceName: string,
  poolId: string,
) {
  const tweetUrl = tweet.author_username
    ? `https://twitter.com/${tweet.author_username}/status/${tweet.id}`
    : `https://twitter.com/i/web/status/${tweet.id}`;

  // Build a meaningful content snippet
  const snippetParts: string[] = [tweet.text];
  if (tweet.entities?.urls && tweet.entities.urls.length > 0) {
    const firstUrl = tweet.entities.urls[0];
    if (firstUrl.expanded_url) {
      snippetParts.push(` ${firstUrl.expanded_url}`);
    }
  }
  const contentSnippet = snippetParts.join('').slice(0, 600);

  // Extract first media URL if present (image links in entities)
  let mediaUrl: string | undefined;
  if (tweet.entities?.urls && tweet.entities.urls.length > 0) {
    const firstUrl = tweet.entities.urls[0];
    if (
      firstUrl.expanded_url &&
      /\.(?:jpg|jpeg|png|gif|webp)(?:\?|$)/i.test(firstUrl.expanded_url)
    ) {
      mediaUrl = firstUrl.expanded_url;
    }
  }

  return {
    id: `tweet_${tweet.id}`,
    title: tweet.text.slice(0, 200),
    link: tweetUrl,
    pubDate: tweet.created_at,
    source_name: sourceName,
    pool_id: poolId,
    content_snippet: contentSnippet,
    author: tweet.author_username,
    media_url: mediaUrl,
  };
}
