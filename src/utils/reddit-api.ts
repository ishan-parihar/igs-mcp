/**
 * Reddit Search API wrapper.
 *
 * Dual-mode architecture:
 * 1. PUBLIC (default) – https://www.reddit.com — no auth required, rate-limited
 * 2. OAUTH (optional)  – https://oauth.reddit.com — requires REDDIT_CLIENT_ID +
 *    REDDIT_CLIENT_SECRET in environment, higher rate limits.
 *
 * When both REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are set, the module
 * auto-fetches an access token on first call and uses the OAuth endpoint.
 * Otherwise it falls back to the public endpoint (zero-config).
 *
 * Limitations:
 * - Max 1000 results per query
 * - Search limited to past 6 months for most subreddits
 * - Public endpoint: ~60 requests/minute
 * - OAuth endpoint: ~600 requests/minute (with valid app credentials)
 */

import { request } from 'undici';

export interface RedditSearchOptions {
  subreddits?: string[];  // If provided, searches only these subreddits
  query: string;
  sort?: 'relevance' | 'hot' | 'new' | 'top' | 'rising';
  time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  limit?: number;  // Max 100
}

export interface RedditPost {
  id: string;
  title: string;
  author?: string;
  subreddit: string;
  created_utc: number;
  score: number;
  num_comments: number;
  url: string;
  permalink: string;
  selftext?: string;
  link_flair_text?: string;
  thumbnail?: string;
  is_self: boolean;
  domain?: string;
}

const PUBLIC_API_BASE = 'https://www.reddit.com';
const OAUTH_API_BASE = 'https://oauth.reddit.com';
const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const USER_AGENT = 'IGS/1.0 (by /u/igs-bot)';
const SCRIPT_UA = 'Mozilla/5.0 (compatible; IGS/1.0; +https://github.com/igs-mcp)';

// ---------------------------------------------------------------------------
// OAuth token management
// ---------------------------------------------------------------------------

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Fetch a new OAuth access token from Reddit using client credentials grant.
 * Reads REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET from environment.
 * Necessary: documents the OAuth credential flow for operators.
 */
async function fetchAccessToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await request(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: 'grant_type=client_credentials',
      headersTimeout: 10_000,
      bodyTimeout: 10_000,
    });

    if (res.statusCode !== 200) {
      console.error(`Reddit token request failed: HTTP ${res.statusCode}`);
      return null;
    }

    const body = await res.body.text();
    const data = JSON.parse(body);

    if (!data.access_token) {
      console.error('Reddit token response missing access_token');
      return null;
    }

    // Cache token with 60s buffer before expiry
    const expiresIn = (data.expires_in as number) || 3600;
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (expiresIn - 60) * 1000;

    return cachedToken;
  } catch (err) {
    console.error('Failed to fetch Reddit OAuth token:', err);
    return null;
  }
}

/**
 * Get a valid access token, re-fetching if expired.
 * Returns null when OAuth is not configured or fails.
 * Necessary: core auth orchestration function.
 */
async function getAccessToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  cachedToken = null;
  tokenExpiry = 0;
  return fetchAccessToken();
}

/**
 * Determine the API base URL and optional auth header based on
 * whether OAuth credentials are available.
 * Necessary: central routing decision for public vs authenticated endpoint.
 */
async function resolveApiConfig(): Promise<{
  baseUrl: string;
  headers: Record<string, string>;
}> {
  const token = await getAccessToken();
  if (token) {
    return {
      baseUrl: OAUTH_API_BASE,
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    };
  }
  return {
    baseUrl: PUBLIC_API_BASE,
    headers: {
      'User-Agent': SCRIPT_UA,
      'Accept': 'application/json',
    },
  };
}

/**
 * Searches Reddit for posts matching the query.
 */
export async function searchReddit(opts: RedditSearchOptions): Promise<RedditPost[]> {
  const limit = Math.min(opts.limit || 25, 100);
  const sort = opts.sort || 'relevance';
  const time = opts.time || 'all';
  
  // Build search query
  let searchQuery = opts.query;
  if (opts.subreddits && opts.subreddits.length > 0) {
    const subredditClause = opts.subreddits.map(s => `subreddit:${s}`).join(' OR ');
    searchQuery = `(${subredditClause}) ${searchQuery}`;
  }
  
  const { baseUrl, headers } = await resolveApiConfig();
  const url = new URL(`${baseUrl}/search.json`);
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('sort', sort);
  url.searchParams.set('t', time);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('type', 'post');
  url.searchParams.set('raw_json', '1');
  
  try {
    const res = await request(url.toString(), {
      method: 'GET',
      headers,
      headersTimeout: 10000,
      bodyTimeout: 10000,
    });
    
    if (res.statusCode !== 200) {
      console.error(`Reddit API returned status ${res.statusCode}`);
      return [];
    }
    
    const body = await res.body.text();
    const data = JSON.parse(body);
    
    if (!data.data || !data.data.children) {
      return [];
    }
    
    return data.data.children
      .filter((child: any) => child.kind === 't3')  // t3 = post
      .map((child: any) => child.data as RedditPost);
  } catch (err) {
    console.error('Reddit search failed:', err);
    return [];
  }
}

/**
 * Gets hot posts from a specific subreddit.
 */
export async function getSubredditPosts(subreddit: string, limit: number = 25): Promise<RedditPost[]> {
  const { baseUrl, headers } = await resolveApiConfig();
  const url = new URL(`${baseUrl}/r/${subreddit}/hot.json`);
  url.searchParams.set('limit', String(Math.min(limit, 100)));
  url.searchParams.set('raw_json', '1');
  
  try {
    const res = await request(url.toString(), {
      method: 'GET',
      headers,
      headersTimeout: 10000,
      bodyTimeout: 10000,
    });
    
    if (res.statusCode !== 200) {
      return [];
    }
    
    const body = await res.body.text();
    const data = JSON.parse(body);
    
    if (!data.data || !data.data.children) {
      return [];
    }
    
    return data.data.children
      .filter((child: any) => child.kind === 't3')
      .map((child: any) => child.data as RedditPost);
  } catch (err) {
    console.error(`Failed to fetch r/${subreddit}:`, err);
    return [];
  }
}

/**
 * Converts a Reddit post to a simplified format.
 */
export function normalizeRedditPost(post: RedditPost, sourceName: string, poolId: string) {
  const contentParts: string[] = [];
  
  if (post.selftext) {
    contentParts.push(post.selftext.slice(0, 400));
  }
  if (post.link_flair_text) {
    contentParts.unshift(`[${post.link_flair_text}]`);
  }
  
  return {
    id: `reddit_${post.id}`,
    title: post.title,
    link: `https://www.reddit.com${post.permalink}`,
    pubDate: new Date(post.created_utc * 1000).toISOString(),
    source_name: sourceName,
    pool_id: poolId,
    content_snippet: contentParts.join(' ').slice(0, 600),
    author: post.author,
    media_url: post.thumbnail && post.thumbnail !== 'self' && post.thumbnail !== 'default' 
      ? post.thumbnail 
      : undefined,
  };
}
