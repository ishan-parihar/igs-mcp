import Firecrawl from 'firecrawl';
import type { Settings } from '../config/schemas.js';
import type { NewsItem } from '../types/news.js';

export interface FirecrawlScrapeOptions {
  url: string;
  formats?: Array<'markdown' | 'html' | 'screenshot' | 'links' | 'raw'>;
  onlyMainContent?: boolean;
  waitFor?: number;
  timeout?: number;
  headers?: Record<string, string>;
  actions?: Array<{
    type: 'wait' | 'click' | 'screenshot' | 'scroll' | 'write' | 'press';
    selector?: string;
    milliseconds?: number;
    text?: string;
    key?: string;
    fullPage?: boolean;
  }>;
  location?: {
    country?: string;
    languages?: string[];
  };
}

export interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    html?: string;
    screenshot?: string;
    links?: string[];
    raw?: string;
    metadata?: {
      title?: string;
      description?: string;
      sourceURL?: string;
      statusCode?: number;
      error?: string;
    };
  };
  error?: string;
}

export interface FirecrawlSearchOptions {
  query: string;
  limit?: number;
  searchOptions?: {
    query?: string;
    tbs?: string;
  };
}

export interface FirecrawlSearchResponse {
  success: boolean;
  data?: {
    web?: Array<{
      title: string;
      url: string;
      description?: string;
    }>;
  };
  error?: string;
}

export interface FirecrawlCrawlOptions {
  url: string;
  limit?: number;
  maxDepth?: number;
  excludePaths?: string[];
  includePaths?: string[];
  ignoreSitemap?: boolean;
  scrapeOptions?: FirecrawlScrapeOptions;
}

export interface FirecrawlCrawlResponse {
  success: boolean;
  data?: Array<{
    url: string;
    markdown?: string;
    html?: string;
    screenshot?: string;
    links?: string[];
    metadata?: {
      title?: string;
      description?: string;
      sourceURL?: string;
      statusCode?: number;
    };
  }>;
  error?: string;
}

export interface FirecrawlMapOptions {
  url: string;
  search?: string;
  limit?: number;
  ignoreSitemap?: boolean;
  includePaths?: string[];
  excludePaths?: string[];
}

export interface FirecrawlMapResponse {
  success: boolean;
  links?: Array<{
    url: string;
    title?: string;
  }>;
  error?: string;
}

export class FirecrawlClient {
  private client: any;
  private enabled: boolean;
  private timeoutMs: number;

  constructor(settings: Settings['firecrawl']) {
    this.enabled = settings?.enabled ?? false;
    this.timeoutMs = settings?.timeoutMs ?? 60000;

    if (!this.enabled) {
      console.warn('[Firecrawl] Client disabled - not initialized');
      return;
    }

    const apiKey = settings?.apiKey || process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.warn('[Firecrawl] No API key provided - client disabled');
      this.enabled = false;
      return;
    }

    try {
      this.client = new Firecrawl({ apiKey });
      console.log('[Firecrawl] Client initialized successfully');
    } catch (error) {
      console.error('[Firecrawl] Failed to initialize client:', error);
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async scrape(options: FirecrawlScrapeOptions): Promise<FirecrawlScrapeResponse> {
    if (!this.enabled) {
      throw new Error('Firecrawl client is not enabled or configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || this.timeoutMs);

    try {
      const response = await this.client.scrape(options.url, {
        formats: options.formats || ['markdown'],
        onlyMainContent: options.onlyMainContent || false,
        waitFor: options.waitFor,
        headers: options.headers,
        actions: options.actions,
        location: options.location,
      });

      clearTimeout(timeout);

      return {
        success: true,
        data: {
          markdown: response.markdown,
          html: response.html,
          screenshot: response.screenshot,
          links: response.links,
          raw: response.raw,
          metadata: {
            title: response.metadata?.title,
            description: response.metadata?.description,
            sourceURL: response.metadata?.sourceURL,
            statusCode: response.metadata?.statusCode,
          },
        },
      };
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Firecrawl scrape timeout after ${options.timeout || this.timeoutMs}ms`);
      }
      console.error('[Firecrawl] Scrape failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async search(options: FirecrawlSearchOptions): Promise<FirecrawlSearchResponse> {
    if (!this.enabled) {
      throw new Error('Firecrawl client is not enabled or configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.client.search(options.query, {
        limit: options.limit || 10,
        searchOptions: options.searchOptions,
      });

      clearTimeout(timeout);

      return {
        success: true,
        data: {
          web: response.data?.web || [],
        },
      };
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Firecrawl search timeout after ${this.timeoutMs}ms`);
      }
      console.error('[Firecrawl] Search failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async crawl(options: FirecrawlCrawlOptions): Promise<FirecrawlCrawlResponse> {
    if (!this.enabled) {
      throw new Error('Firecrawl client is not enabled or configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs * 5);

    try {
      const response = await this.client.crawl(options.url, {
        limit: options.limit || 100,
        maxDepth: options.maxDepth || 2,
        excludePaths: options.excludePaths,
        includePaths: options.includePaths,
        ignoreSitemap: options.ignoreSitemap || false,
        scrapeOptions: options.scrapeOptions,
      });

      clearTimeout(timeout);

      const results = response.data || [];

      return {
        success: true,
        data: results.map((item: any) => ({
          url: item.metadata?.sourceURL || item.url,
          markdown: item.markdown,
          html: item.html,
          screenshot: item.screenshot,
          links: item.links,
          metadata: {
            title: item.metadata?.title,
            description: item.metadata?.description,
            sourceURL: item.metadata?.sourceURL,
            statusCode: item.metadata?.statusCode,
          },
        })),
      };
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Firecrawl crawl timeout after ${this.timeoutMs * 5}ms`);
      }
      console.error('[Firecrawl] Crawl failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async map(options: FirecrawlMapOptions): Promise<FirecrawlMapResponse> {
    if (!this.enabled) {
      throw new Error('Firecrawl client is not enabled or configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs * 2);

    try {
      const response = await this.client.map(options.url, {
        search: options.search,
        limit: options.limit || 100,
        ignoreSitemap: options.ignoreSitemap || false,
        includePaths: options.includePaths,
        excludePaths: options.excludePaths,
      });

      clearTimeout(timeout);

      return {
        success: true,
        links: response.links || [],
      };
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Firecrawl map timeout after ${this.timeoutMs * 2}ms`);
      }
      console.error('[Firecrawl] Map failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export function normalizeFirecrawlResult(result: { url?: string; metadata?: { title?: string; sourceURL?: string }; title?: string; description?: string; markdown?: string; html?: string; screenshot?: string }, source: string): NewsItem {
  return {
    id: `firecrawl:${Buffer.from(result.url || result.metadata?.sourceURL || '').toString('base64').slice(0, 16)}`,
    title: result.metadata?.title || result.title || 'Untitled',
    link: result.url || result.metadata?.sourceURL || '',
    pubDate: new Date().toISOString(),
    source_name: source,
    pool_id: 'WEB_SEARCH',
    content_snippet: result.markdown || result.html || result.description || '',
    author: undefined,
    media_url: result.screenshot,
    raw: result,
  };
}
