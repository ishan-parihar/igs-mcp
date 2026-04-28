import { tavily } from '@tavily/core';
import type { Settings } from '../config/schemas.js';

export interface TavilySearchOptions {
  query: string;
  searchDepth?: 'basic' | 'advanced' | 'fast' | 'ultra-fast';
  topic?: 'general' | 'news' | 'finance';
  includeAnswer?: boolean;
  maxResults?: number;
  days?: number;
  timeRange?: 'day' | 'week' | 'month' | 'year';
  includeDomains?: string[];
  excludeDomains?: string[];
  includeRawContent?: boolean;
  exactMatch?: boolean;
  includeImages?: boolean;
  includeImageDescriptions?: boolean;
  includeUsage?: boolean;
  includeFavicon?: boolean;
  startDate?: string;
  endDate?: string;
  country?: string;
}

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

export interface TavilySearchResponse {
  results: TavilySearchResult[];
  answer?: string;
  usage?: {
    credits: number;
  };
  images?: Array<{
    url: string;
    description?: string;
  }>;
}

export interface TavilyExtractOptions {
  urls: string[];
  extractDepth?: 'basic' | 'advanced';
  includeImages?: boolean;
  includeImageDescription?: boolean;
}

export interface TavilyExtractResponse {
  results: Array<{
    url: string;
    content: string;
    markdown?: string;
    images?: Array<{
      url: string;
      description?: string;
    }>;
  }>;
}

export interface TavilyCrawlOptions {
  url: string;
  query?: string;
  maxDepth?: number;
  maxBreadth?: number;
  limit?: number;
  selectDomains?: string[];
  selectPaths?: string[];
  excludeDomains?: string[];
  excludePaths?: string[];
  extractDepth?: 'basic' | 'advanced';
  format?: 'markdown' | 'text';
  instructions?: string;
}

export interface TavilyCrawlResponse {
  success: boolean;
  results: Array<{
    url: string;
    content: string;
    markdown?: string;
  }>;
}

export interface TavilyMapOptions {
  url: string;
  search?: string;
  selectDomains?: string[];
  selectPaths?: string[];
  excludeDomains?: string[];
  excludePaths?: string[];
  limit?: number;
  maxDepth?: number;
  maxBreadth?: number;
}

export interface TavilyMapResponse {
  success: boolean;
  links: Array<{
    url: string;
    title?: string;
  }>;
}

export class TavilyClient {
  private client: any;
  private enabled: boolean;
  private timeoutMs: number;

  constructor(settings: Settings['tavily']) {
    this.enabled = settings?.enabled ?? false;
    this.timeoutMs = settings?.timeoutMs ?? 30000;

    if (!this.enabled) {
      console.warn('[Tavily] Client disabled - not initialized');
      return;
    }

    const apiKey = settings?.apiKey || process.env.TAVILY_API_KEY;
    if (!apiKey) {
      console.warn('[Tavily] No API key provided - client disabled');
      this.enabled = false;
      return;
    }

    try {
      this.client = tavily({ apiKey });
      console.log('[Tavily] Client initialized successfully');
    } catch (error) {
      console.error('[Tavily] Failed to initialize client:', error);
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async search(options: TavilySearchOptions): Promise<TavilySearchResponse> {
    if (!this.enabled) {
      throw new Error('Tavily client is not enabled or configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.client.search(options.query, {
        searchDepth: options.searchDepth || 'basic',
        topic: options.topic || 'general',
        includeAnswer: options.includeAnswer || false,
        maxResults: options.maxResults || 10,
        days: options.days,
        timeRange: options.timeRange,
        includeDomains: options.includeDomains,
        excludeDomains: options.excludeDomains,
        includeRawContent: options.includeRawContent || false,
        exactMatch: options.exactMatch || false,
        includeImages: options.includeImages || false,
        includeImageDescriptions: options.includeImageDescriptions || false,
        includeUsage: options.includeUsage || false,
        includeFavicon: options.includeFavicon || false,
        startDate: options.startDate,
        endDate: options.endDate,
        country: options.country,
      });

      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Tavily search timeout after ${this.timeoutMs}ms`);
      }
      console.error('[Tavily] Search failed:', error);
      throw error;
    }
  }

  async extract(options: TavilyExtractOptions): Promise<TavilyExtractResponse> {
    if (!this.enabled) {
      throw new Error('Tavily client is not enabled or configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.client.extract(options.urls, {
        extractDepth: options.extractDepth || 'basic',
        includeImages: options.includeImages || false,
        includeImageDescription: options.includeImageDescription || false,
      });

      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Tavily extract timeout after ${this.timeoutMs}ms`);
      }
      console.error('[Tavily] Extract failed:', error);
      throw error;
    }
  }

  async crawl(options: TavilyCrawlOptions): Promise<TavilyCrawlResponse> {
    if (!this.enabled) {
      throw new Error('Tavily client is not enabled or configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs * 3);

    try {
      const response = await this.client.crawl(options.url, {
        query: options.query,
        maxDepth: options.maxDepth,
        maxBreadth: options.maxBreadth,
        limit: options.limit,
        selectDomains: options.selectDomains,
        selectPaths: options.selectPaths,
        excludeDomains: options.excludeDomains,
        excludePaths: options.excludePaths,
        extractDepth: options.extractDepth || 'basic',
        format: options.format || 'markdown',
        instructions: options.instructions,
      });

      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Tavily crawl timeout after ${this.timeoutMs * 3}ms`);
      }
      console.error('[Tavily] Crawl failed:', error);
      throw error;
    }
  }

  async map(options: TavilyMapOptions): Promise<TavilyMapResponse> {
    if (!this.enabled) {
      throw new Error('Tavily client is not enabled or configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs * 2);

    try {
      const response = await this.client.map(options.url, {
        search: options.search,
        selectDomains: options.selectDomains,
        selectPaths: options.selectPaths,
        excludeDomains: options.excludeDomains,
        excludePaths: options.excludePaths,
        limit: options.limit,
        maxDepth: options.maxDepth,
        maxBreadth: options.maxBreadth,
      });

      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Tavily map timeout after ${this.timeoutMs * 2}ms`);
      }
      console.error('[Tavily] Map failed:', error);
      throw error;
    }
  }
}
