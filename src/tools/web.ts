import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadSettings } from '../config/loader.js';
import { TavilyClient, type TavilySearchOptions, normalizeTavilyResult } from '../utils/tavily.js';
import { FirecrawlClient, type FirecrawlScrapeOptions, type FirecrawlCrawlOptions, type FirecrawlMapOptions, normalizeFirecrawlResult } from '../utils/firecrawl.js';
import type { NewsItem } from '../types/news.js';

const WebSearchInput = z.object({
  query: z.string().min(1).describe('Search query'),
  provider: z.enum(['auto', 'tavily', 'firecrawl']).optional().default('auto').describe('Provider to use (auto: Tavily primary, Firecrawl fallback)'),
  searchDepth: z.enum(['basic', 'advanced', 'fast', 'ultra-fast']).optional().describe('Search depth (Tavily only)'),
  topic: z.enum(['general', 'news', 'finance']).optional().describe('Topic filter (Tavily only)'),
  maxResults: z.number().int().min(1).max(100).optional().default(10).describe('Maximum results'),
  days: z.number().int().min(1).max(365).optional().describe('Filter results from last N days (Tavily only)'),
  timeRange: z.enum(['day', 'week', 'month', 'year']).optional().describe('Time range filter (Tavily only)'),
  includeAnswer: z.boolean().optional().default(false).describe('Include AI-generated answer (Tavily only)'),
  includeDomains: z.array(z.string()).optional().describe('Domains to include'),
  excludeDomains: z.array(z.string()).optional().describe('Domains to exclude'),
  includeRawContent: z.boolean().optional().default(false).describe('Include raw content'),
  exactMatch: z.boolean().optional().default(false).describe('Exact match search (Tavily only)'),
  includeImages: z.boolean().optional().default(false).describe('Include images (Tavily only)'),
  includeImageDescriptions: z.boolean().optional().default(false).describe('Include image descriptions (Tavily only)'),
  includeUsage: z.boolean().optional().default(false).describe('Include usage statistics (Tavily only)'),
  includeFavicon: z.boolean().optional().default(false).describe('Include favicons (Tavily only)'),
  startDate: z.string().optional().describe('Start date (YYYY-MM-DD, Tavily only)'),
  endDate: z.string().optional().describe('End date (YYYY-MM-DD, Tavily only)'),
  country: z.string().optional().describe('Country code (Tavily only)'),
});

const WebScrapeInput = z.object({
  url: z.string().url().describe('URL to scrape'),
  provider: z.enum(['auto', 'firecrawl', 'tavily']).optional().default('auto').describe('Provider to use (auto: Firecrawl primary, Tavily fallback)'),
  formats: z.array(z.enum(['markdown', 'html', 'screenshot', 'links', 'raw'])).optional().default(['markdown']).describe('Output formats'),
  onlyMainContent: z.boolean().optional().default(false).describe('Extract only main content (Firecrawl only)'),
  waitFor: z.number().int().min(0).max(30000).optional().describe('Wait time in ms before scraping'),
  timeout: z.number().int().min(1000).max(300000).optional().describe('Timeout in ms'),
  headers: z.record(z.string()).optional().describe('Custom headers'),
  actions: z.array(z.object({
    type: z.enum(['wait', 'click', 'screenshot', 'scroll', 'write', 'press']),
    selector: z.string().optional(),
    milliseconds: z.number().optional(),
    text: z.string().optional(),
    key: z.string().optional(),
    fullPage: z.boolean().optional(),
  })).optional().describe('Browser actions (Firecrawl only)'),
});

const WebCrawlInput = z.object({
  url: z.string().url().describe('Starting URL to crawl'),
  provider: z.enum(['auto', 'firecrawl', 'tavily']).optional().default('auto').describe('Provider to use (auto: Firecrawl primary, Tavily fallback)'),
  limit: z.number().int().min(1).max(1000).optional().default(100).describe('Maximum pages to crawl'),
  maxDepth: z.number().int().min(1).max(10).optional().default(2).describe('Maximum crawl depth'),
  excludePaths: z.array(z.string()).optional().describe('URL patterns to exclude'),
  includePaths: z.array(z.string()).optional().describe('URL patterns to include'),
  ignoreSitemap: z.boolean().optional().default(false).describe('Ignore sitemap.xml'),
  scrapeFormats: z.array(z.enum(['markdown', 'html', 'screenshot', 'links', 'raw'])).optional().default(['markdown']).describe('Scrape output formats'),
});

const WebMapInput = z.object({
  url: z.string().url().describe('Website URL to map'),
  provider: z.enum(['auto', 'firecrawl', 'tavily']).optional().default('auto').describe('Provider to use (auto: Firecrawl primary, Tavily fallback)'),
  search: z.string().optional().describe('Search filter within site'),
  limit: z.number().int().min(1).max(1000).optional().default(100).describe('Maximum URLs to discover'),
  ignoreSitemap: z.boolean().optional().default(false).describe('Ignore sitemap.xml'),
  includePaths: z.array(z.string()).optional().describe('URL patterns to include'),
  excludePaths: z.array(z.string()).optional().describe('URL patterns to exclude'),
});

export async function registerWebTools(srv: McpServer) {
  srv.registerTool('web.search', {
    description: 'Search the web in realtime. Primary: Tavily (AI answers, topic filters, time ranges). Fallback: Firecrawl. Returns normalized results compatible with IGS news pipeline.',
    inputSchema: WebSearchInput.shape,
    outputSchema: {
      results: z.array(z.any()),
      count: z.number(),
      answer: z.string().optional(),
      usage: z.object({ credits: z.number() }).optional(),
      meta: z.object({
        provider: z.string(),
        query: z.string(),
        searchDepth: z.string().optional(),
        topic: z.string().optional(),
      }),
    },
  }, async (args: any) => {
    const settings = await loadSettings();
    const tavilyClient = new TavilyClient(settings.tavily);
    const firecrawlClient = new FirecrawlClient(settings.firecrawl);

    const provider = args.provider === 'auto' ? 'tavily' : args.provider;
    let results: NewsItem[] = [];
    let answer: string | undefined;
    let usage: any;
    let actualProvider = provider;

    try {
      if (provider === 'tavily' || (provider === 'auto' && tavilyClient.isEnabled())) {
        const tavilyOptions: TavilySearchOptions = {
          query: args.query,
          searchDepth: args.searchDepth,
          topic: args.topic,
          includeAnswer: args.includeAnswer,
          maxResults: args.maxResults,
          days: args.days,
          timeRange: args.timeRange,
          includeDomains: args.includeDomains,
          excludeDomains: args.excludeDomains,
          includeRawContent: args.includeRawContent,
          exactMatch: args.exactMatch,
          includeImages: args.includeImages,
          includeImageDescriptions: args.includeImageDescriptions,
          includeUsage: args.includeUsage,
          includeFavicon: args.includeFavicon,
          startDate: args.startDate,
          endDate: args.endDate,
          country: args.country,
        };

        const response = await tavilyClient.search(tavilyOptions);
        results = response.results.map((r: any) => normalizeTavilyResult(r, 'Web Search (Tavily)'));
        answer = response.answer;
        usage = response.usage;
        actualProvider = 'tavily';
      } else if (firecrawlClient.isEnabled()) {
        const response = await firecrawlClient.search({
          query: args.query,
          limit: args.maxResults,
        });

        if (response.success && response.data?.web) {
          results = response.data.web.map((r: any) => normalizeFirecrawlResult(r, 'Web Search (Firecrawl)'));
        }
        actualProvider = 'firecrawl';
      } else {
        throw new Error('No web search provider is enabled. Configure Tavily or Firecrawl in settings.yml');
      }
    } catch (error) {
      if (provider === 'tavily' && firecrawlClient.isEnabled()) {
        console.warn('[web.search] Tavily failed, falling back to Firecrawl:', error);
        try {
          const response = await firecrawlClient.search({
            query: args.query,
            limit: args.maxResults,
          });

          if (response.success && response.data?.web) {
            results = response.data.web.map((r: any) => normalizeFirecrawlResult(r, 'Web Search (Firecrawl)'));
          }
          actualProvider = 'firecrawl (fallback)';
        } catch (fallbackError) {
          console.error('[web.search] Fallback to Firecrawl also failed:', fallbackError);
          throw new Error(`Web search failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        throw error;
      }
    }

    const structuredContent = {
      results,
      count: results.length,
      answer,
      usage,
      meta: {
        provider: actualProvider,
        query: args.query,
        searchDepth: args.searchDepth,
        topic: args.topic,
      },
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent,
    };
  });

  srv.registerTool('web.scrape', {
    description: 'Scrape content from a URL. Primary: Firecrawl (screenshot, browser actions, multiple formats). Fallback: Tavily (LLM extraction). Returns rich structured data.',
    inputSchema: WebScrapeInput.shape,
    outputSchema: {
      success: z.boolean(),
      url: z.string(),
      markdown: z.string().optional(),
      html: z.string().optional(),
      screenshot: z.string().optional(),
      links: z.array(z.string()).optional(),
      raw: z.string().optional(),
      metadata: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        statusCode: z.number().optional(),
      }).optional(),
      error: z.string().optional(),
      meta: z.object({
        provider: z.string(),
        formats: z.array(z.string()),
      }),
    },
  }, async (args: any) => {
    const settings = await loadSettings();
    const tavilyClient = new TavilyClient(settings.tavily);
    const firecrawlClient = new FirecrawlClient(settings.firecrawl);

    const provider = args.provider === 'auto' ? 'firecrawl' : args.provider;
    let result: any;
    let actualProvider = provider;

    try {
      if (provider === 'firecrawl' || (provider === 'auto' && firecrawlClient.isEnabled())) {
        const firecrawlOptions: FirecrawlScrapeOptions = {
          url: args.url,
          formats: args.formats,
          onlyMainContent: args.onlyMainContent,
          waitFor: args.waitFor,
          timeout: args.timeout,
          headers: args.headers,
          actions: args.actions,
        };

        const response = await firecrawlClient.scrape(firecrawlOptions);
        result = response;
        actualProvider = 'firecrawl';
      } else if (tavilyClient.isEnabled()) {
        const response = await tavilyClient.extract({
          urls: [args.url],
          extractDepth: 'advanced',
          includeImages: args.formats.includes('screenshot'),
          includeImageDescription: args.formats.includes('screenshot'),
        });

        result = {
          success: true,
          url: args.url,
          markdown: response.results[0]?.markdown,
          raw: response.results[0]?.content,
          metadata: {},
        };
        actualProvider = 'tavily';
      } else {
        throw new Error('No web scrape provider is enabled. Configure Firecrawl or Tavily in settings.yml');
      }
    } catch (error) {
      if (provider === 'firecrawl' && tavilyClient.isEnabled()) {
        console.warn('[web.scrape] Firecrawl failed, falling back to Tavily:', error);
        try {
          const response = await tavilyClient.extract({
            urls: [args.url],
            extractDepth: 'advanced',
          });

          result = {
            success: true,
            url: args.url,
            markdown: response.results[0]?.markdown,
            raw: response.results[0]?.content,
            metadata: {},
          };
          actualProvider = 'tavily (fallback)';
        } catch (fallbackError) {
          console.error('[web.scrape] Fallback to Tavily also failed:', fallbackError);
          throw new Error(`Web scrape failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        throw error;
      }
    }

    const structuredContent = {
      ...result,
      meta: {
        provider: actualProvider,
        formats: args.formats,
      },
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent,
    };
  });

  srv.registerTool('web.crawl', {
    description: 'Crawl a website systematically. Primary: Firecrawl (async control, concurrency). Fallback: Tavily. Returns normalized results.',
    inputSchema: WebCrawlInput.shape,
    outputSchema: {
      success: z.boolean(),
      url: z.string(),
      results: z.array(z.any()),
      count: z.number(),
      meta: z.object({
        provider: z.string(),
        limit: z.number(),
        maxDepth: z.number(),
      }),
    },
  }, async (args: any) => {
    const settings = await loadSettings();
    const tavilyClient = new TavilyClient(settings.tavily);
    const firecrawlClient = new FirecrawlClient(settings.firecrawl);

    const provider = args.provider === 'auto' ? 'firecrawl' : args.provider;
    let result: any;
    let actualProvider = provider;

    try {
      if (provider === 'firecrawl' || (provider === 'auto' && firecrawlClient.isEnabled())) {
        const firecrawlOptions: FirecrawlCrawlOptions = {
          url: args.url,
          limit: args.limit,
          maxDepth: args.maxDepth,
          excludePaths: args.excludePaths,
          includePaths: args.includePaths,
          ignoreSitemap: args.ignoreSitemap,
          scrapeOptions: {
            url: args.url,
            formats: args.scrapeFormats,
          },
        };

        const response = await firecrawlClient.crawl(firecrawlOptions);
        result = {
          success: response.success,
          url: args.url,
          results: response.data || [],
          count: (response.data || []).length,
        };
        actualProvider = 'firecrawl';
      } else if (tavilyClient.isEnabled()) {
        const response = await tavilyClient.crawl({
          url: args.url,
          limit: args.limit,
          maxDepth: args.maxDepth,
          excludePaths: args.excludePaths,
          format: 'markdown',
        });

        result = {
          success: response.success,
          url: args.url,
          results: response.results || [],
          count: (response.results || []).length,
        };
        actualProvider = 'tavily';
      } else {
        throw new Error('No web crawl provider is enabled. Configure Firecrawl or Tavily in settings.yml');
      }
    } catch (error) {
      if (provider === 'firecrawl' && tavilyClient.isEnabled()) {
        console.warn('[web.crawl] Firecrawl failed, falling back to Tavily:', error);
        try {
          const response = await tavilyClient.crawl({
            url: args.url,
            limit: args.limit,
            maxDepth: args.maxDepth,
            format: 'markdown',
          });

          result = {
            success: response.success,
            url: args.url,
            results: response.results || [],
            count: (response.results || []).length,
          };
          actualProvider = 'tavily (fallback)';
        } catch (fallbackError) {
          console.error('[web.crawl] Fallback to Tavily also failed:', fallbackError);
          throw new Error(`Web crawl failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        throw error;
      }
    }

    const structuredContent = {
      ...result,
      meta: {
        provider: actualProvider,
        limit: args.limit,
        maxDepth: args.maxDepth,
      },
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent,
    };
  });

  srv.registerTool('web.map', {
    description: 'Discover all URLs on a website. Primary: Firecrawl (with search filter). Fallback: Tavily. Returns URL list with titles.',
    inputSchema: WebMapInput.shape,
    outputSchema: {
      success: z.boolean(),
      url: z.string(),
      links: z.array(z.object({
        url: z.string(),
        title: z.string().optional(),
      })),
      count: z.number(),
      meta: z.object({
        provider: z.string(),
        search: z.string().optional(),
        limit: z.number(),
      }),
    },
  }, async (args: any) => {
    const settings = await loadSettings();
    const tavilyClient = new TavilyClient(settings.tavily);
    const firecrawlClient = new FirecrawlClient(settings.firecrawl);

    const provider = args.provider === 'auto' ? 'firecrawl' : args.provider;
    let result: any;
    let actualProvider = provider;

    try {
      if (provider === 'firecrawl' || (provider === 'auto' && firecrawlClient.isEnabled())) {
        const response = await firecrawlClient.map({
          url: args.url,
          search: args.search,
          limit: args.limit,
          ignoreSitemap: args.ignoreSitemap,
          includePaths: args.includePaths,
          excludePaths: args.excludePaths,
        });

        result = {
          success: response.success,
          url: args.url,
          links: response.links || [],
          count: (response.links || []).length,
        };
        actualProvider = 'firecrawl';
      } else if (tavilyClient.isEnabled()) {
          const response = await tavilyClient.map({
            url: args.url,
            search: args.search,
            limit: args.limit,
          });

        result = {
          success: response.success,
          url: args.url,
          links: response.links || [],
          count: (response.links || []).length,
        };
        actualProvider = 'tavily';
      } else {
        throw new Error('No web map provider is enabled. Configure Firecrawl or Tavily in settings.yml');
      }
    } catch (error) {
      if (provider === 'firecrawl' && tavilyClient.isEnabled()) {
        console.warn('[web.map] Firecrawl failed, falling back to Tavily:', error);
        try {
          const response = await tavilyClient.map({
            url: args.url,
            search: args.search,
            limit: args.limit,
          });

          result = {
            success: response.success,
            url: args.url,
            links: response.links || [],
            count: (response.links || []).length,
          };
          actualProvider = 'tavily (fallback)';
        } catch (fallbackError) {
          console.error('[web.map] Fallback to Tavily also failed:', fallbackError);
          throw new Error(`Web map failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        throw error;
      }
    }

    const structuredContent = {
      ...result,
      meta: {
        provider: actualProvider,
        search: args.search,
        limit: args.limit,
      },
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent,
    };
  });
}
