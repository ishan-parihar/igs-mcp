/**
 * Reddit Search API wrapper.
 * 
 * Uses Reddit's native search endpoint: https://www.reddit.com/search.json
 * No authentication required for basic search.
 * 
 * Limitations:
 * - Max 1000 results per query
 * - Search limited to past 6 months for most subreddits
 * - Rate limit: ~60 requests/minute
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

const BASE_URL = 'https://oauth.reddit.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; IGS/1.0; +https://github.com/igs-mcp)';

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
  
  const url = new URL(`${BASE_URL}/search.json`);
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('sort', sort);
  url.searchParams.set('t', time);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('type', 'post');
  url.searchParams.set('raw_json', '1');
  
  try {
    const res = await request(url.toString(), {
      method: 'GET',
      headers: {
        'user-agent': USER_AGENT,
        'accept': 'application/json',
      },
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
  const url = new URL(`${BASE_URL}/r/${subreddit}/hot.json`);
  url.searchParams.set('limit', String(Math.min(limit, 100)));
  url.searchParams.set('raw_json', '1');
  
  try {
    const res = await request(url.toString(), {
      method: 'GET',
      headers: {
        'user-agent': USER_AGENT,
        'accept': 'application/json',
      },
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
    link: `${BASE_URL}${post.permalink}`,
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
