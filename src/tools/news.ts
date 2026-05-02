import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadSources, loadSettings, getUserConfigDir } from '../config/loader.js';
import { HttpClient } from '../http/client.js';
import { QueryCache } from '../http/queryCache.js';
import { parseRss } from '../parsers/rss.js';
import { parseOfacHtml } from '../parsers/ofac.js';
import { parseUssfcfcHtml } from '../parsers/ussf_cfc.js';
import { parseWhoJson } from '../parsers/who_dons.js';
import { parseNewslaundryHtml } from '../parsers/newslaundry.js';
import { parseSemanticScholarJson } from '../parsers/semantic_scholar.js';
import { parseReddit } from '../parsers/reddit.js';
import { parseTwitter } from '../parsers/twitter.js';
import type { NewsItem, Source } from '../types/news.js';
import path from 'node:path';
import { load as loadHtml } from 'cheerio';
import { parseWithSelectors, autoParseHtml } from '../parsers/generic_html.js';
import { parseJsonFeed } from '../parsers/json_feed.js';
import { extractArticleContent } from '../parsers/article_content.js';
import { request } from 'undici';
import PQueue from 'p-queue';
import { rewriteGnUrl } from '../utils/gn-url.js';
import { TavilyClient, normalizeTavilyResult } from '../utils/tavily.js';
import { FirecrawlClient, normalizeFirecrawlResult } from '../utils/firecrawl.js';

const FetchInput = z.object({
  pools: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  keywords: z.union([z.array(z.string()), z.array(z.array(z.string()))]).optional(),
  excludeKeywords: z.array(z.string()).optional(),
  matchAll: z.boolean().optional().default(false),
  discoveryMode: z.boolean().optional().default(false).describe('If true, bypasses local keyword filtering and returns all fetched items. Useful for discovering emerging trends.'),
  limit: z.number().int().min(1).max(500).default(100),
  cacheMode: z.enum(['prefer','bypass','only']).default('prefer'),
  includeRaw: z.boolean().optional().default(false),
  enrichArticles: z.boolean().optional().default(false),
  fallbackToRealtime: z.boolean().optional().default(false).describe('Fallback to realtime web search if no results from IGS sources'),
  realtimeLimit: z.number().int().min(1).max(100).optional().default(10).describe('Max realtime results when fallback is enabled'),
  realtimeTopic: z.enum(['general', 'news', 'finance']).optional().default('general').describe('Topic for realtime search'),
  realtimeProvider: z.enum(['auto', 'tavily', 'firecrawl']).optional().default('auto').describe('Realtime provider to use (auto: Tavily primary, Firecrawl fallback)'),
  urgency: z.enum(['normal', 'high']).optional().default('normal').describe('Set to "high" for breaking news to force cache bypass and prioritize recency.'),
});

type NewsQueryKeyArgs = {
  pools?: string[];
  sources?: string[];
  countries?: string[];
  cities?: string[];
  domains?: string[];
  start?: string;
  end?: string;
  limit?: number;
  keywords?: string[];
  excludeKeywords?: string[];
  matchAll?: boolean;
  cacheMode?: string;
  includeRaw?: boolean;
  enrichArticles?: boolean;
  fallbackToRealtime?: boolean;
  realtimeLimit?: number;
  realtimeTopic?: string;
  realtimeProvider?: string;
  discoveryMode?: boolean;
};

function normalizeList(values?: string[]): string {
  return (values || []).slice().sort().join(',');
}

export function buildQueryKeyForNews(args: NewsQueryKeyArgs): string {
  return [
    'news.fetch',
    normalizeList(args.pools),
    normalizeList(args.sources),
    normalizeList(args.countries),
    normalizeList(args.cities),
    normalizeList(args.domains),
    args.start || '',
    args.end || '',
    String(args.limit || ''),
    normalizeList(args.keywords),
    normalizeList(args.excludeKeywords),
    args.matchAll ? '1' : '0',
    args.cacheMode || '',
    args.includeRaw ? '1' : '0',
    args.enrichArticles ? '1' : '0',
    args.fallbackToRealtime ? '1' : '0',
    String(args.realtimeLimit || ''),
    args.realtimeTopic || '',
    args.realtimeProvider || '',
    args.discoveryMode ? '1' : '0',
  ].join('|');
}

export function resolveNewsCacheDependencyUrl(
  sourceUrl: string,
  opts: { start?: string; end?: string; keywords?: string[] }
): string {
  return rewriteGnUrl(sourceUrl, opts);
}

export function resolveNewsQueryTtlMs(
  baseTtlMs: number,
  args: { discoveryMode?: boolean; pools?: string[]; keywords?: string[]; fallbackToRealtime?: boolean }
): number {
  const broadDiscovery =
    args.discoveryMode ||
    args.fallbackToRealtime ||
    (!args.keywords?.length && (!args.pools?.length || args.pools.some(p => p === 'GLOBAL_BREAKING' || p === 'INDIA_NATIONAL_BASE')));
  return broadDiscovery ? Math.min(baseTtlMs, 60_000) : baseTtlMs;
}

function filterByTime(items: NewsItem[], start?: string, end?: string) {
  const s = start ? new Date(start).getTime() : -Infinity;
  const e = end ? new Date(end).getTime() : Infinity;
  return items.filter(x => {
    const t = new Date(x.pubDate).getTime();
    return t >= s && t <= e;
  });
}

async function parseBySource(source: Source, http: HttpClient, cacheMode: 'prefer'|'bypass'|'only', overrideUrl?: string) {
  // Route social media sources to their platform parsers (no HTTP fetch)
  if (source.platform === 'reddit' || source.parser === 'reddit') {
    return await parseReddit(source);
  }
  if (source.platform === 'twitter' || source.parser === 'twitter') {
    return await parseTwitter(source);
  }

  const url = overrideUrl || source.url;
  const headers = source.headers || {};
  const res = await http.fetch(url, headers, cacheMode);
  if ('cached' in res && res.cached) {
    const items = (res.cache.items as any[]);
    return items as NewsItem[];
  }
  if (!('response' in res)) return [];
  let items: NewsItem[] = [];
  if (source.parser === 'ofac') {
    items = parseOfacHtml(source, res.response.bodyText);
  } else if (source.parser === 'ussf_cfc') {
    items = parseUssfcfcHtml(source, res.response.bodyText);
  } else if (source.parser === 'who_dons') {
    items = parseWhoJson(source, res.response.bodyText);
  } else if (source.parser === 'newslaundry') {
    items = parseNewslaundryHtml(source, res.response.bodyText);
  } else if (source.parser === 'semantic_scholar') {
    items = parseSemanticScholarJson(source, res.response.bodyText);
  } else if (source.parser === 'generic_html' && source.parserConfig?.selectors) {
    items = await parseWithSelectors(source, res.response.bodyText, source.parserConfig.selectors as any);
  } else {
    const ctype = (res.response.headers['content-type'] || '').toLowerCase();
    const body = res.response.bodyText;
    const looksXml = ctype.includes('xml') || ctype.includes('rss') || ctype.includes('atom') || /<rss[\s>/]/i.test(body) || /<feed[\s>/]/i.test(body);
    if (looksXml) {
      items = await parseRss(source, body, true);
    } else {
      if (ctype.includes('json') || /^[\[{]/.test(body.trim())) {
        const jitems = parseJsonFeed(source, body);
        if (jitems.length) { items = jitems; } else { items = []; }
      } else {
        try {
          const $ = loadHtml(body);
          const linkEl = $("link[rel='alternate'][type*='rss'], link[rel='alternate'][type*='atom']").first();
          const href = linkEl.attr('href');
          if (href) {
            const rssUrl = new URL(href, url).toString();
            const res2 = await http.fetch(rssUrl, headers, cacheMode);
            if ('response' in res2) {
              items = await parseRss(source, res2.response.bodyText, true);
            }
          } else {
            const auto = await autoParseHtml(source, body);
            items = auto.items;
          }
        } catch { items = []; }
      }
    }
  }
  await http.writeCache(url, items, (res as any).etag, (res as any).lastModified);
  return items;
}

export function filterByKeywords(items: NewsItem[], keywords: any = [], exclude: string[] = [], matchAll = false): NewsItem[] {
  if ((!keywords || (Array.isArray(keywords) && keywords.length === 0)) && (!exclude || exclude.length === 0)) return items;
  
  const exs = (exclude || []).map(k => k.toLowerCase());
  
  // Normalize keywords into clusters (each cluster is a set of synonyms)
  const clusters: string[][] = Array.isArray(keywords[0]) 
    ? keywords 
    : (keywords || []).map((k: string) => [k]);
    
  const normalizedClusters = clusters.map(c => c.map(k => k.toLowerCase()));

  return items.filter(it => {
    const text = `${it.title} ${it.content_snippet} ${it.link}`.toLowerCase();
    
    // Exclude if any excluded keyword matches
    if (exs.length && exs.some(e => text.includes(e))) return false;
    
    if (normalizedClusters.length === 0) return true;
    
    // For each cluster, at least one term must match
    const clusterMatches = normalizedClusters.map(cluster => 
      cluster.some(term => text.includes(term))
    );
    
    return matchAll ? clusterMatches.every(m => m) : clusterMatches.some(m => m);
  });
}

function resolveSourcesByFilter(
  sources: Source[],
  opts: { countries?: string[]; cities?: string[]; domains?: string[] }
): Source[] {
  let result = sources;
  if (opts.countries?.length) {
    const codes = opts.countries.map(c => c.toUpperCase());
    const names = opts.countries.map(c => c.toLowerCase());
    result = result.filter(s => {
      const sc = (s.countries || []).map(x => x.toUpperCase());
      return sc.includes('ALL') || sc.some(c => codes.includes(c) || names.includes(c));
    });
  }
  if (opts.cities?.length) {
    const lc = opts.cities.map(c => c.toLowerCase());
    result = result.filter(s =>
      (s.cities || []).some(c => lc.includes(c.toLowerCase()))
    );
  }
  if (opts.domains?.length) {
    const ld = opts.domains.map(d => d.toLowerCase());
    result = result.filter(s =>
      (s.domains || []).some(d => ld.includes(d.toLowerCase()))
    );
  }
  return result;
}

async function enrichArticlesFromLinks(items: NewsItem[], concurrency: number = 4, timeoutMs: number = 8000): Promise<NewsItem[]> {
  const toEnrich = items.filter(it =>
    it.link.includes('news.google.com') ||
    !it.content_snippet ||
    it.content_snippet.length < 100
  );
  if (!toEnrich.length) return items;

  const queue: Promise<void>[] = [];
  let active = 0;

  function processItem(item: NewsItem): Promise<void> {
    return (async () => {
      try {
        const res = await request(item.link, {
          method: 'GET',
          headers: { 'user-agent': 'Mozilla/5.0 (compatible; IGS/1.0)' },
          headersTimeout: timeoutMs,
          bodyTimeout: timeoutMs,
          maxRedirections: 5,
        } as any);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const html = await res.body.text();
          const content = extractArticleContent(html);
          if (content.length > 100) {
            item.content_snippet = content.slice(0, 2000);
          }
        }
      } catch {
        // keep original snippet on failure
      }
    })();
  }

  for (const item of toEnrich) {
    const p = processItem(item).finally(() => { active--; });
    queue.push(p);
    active++;
    if (active >= concurrency) {
      await Promise.race(queue);
    }
  }
  await Promise.allSettled(queue);
  return items;
}

function batchSimilarNews(items: NewsItem[], threshold: number = 0.3): NewsItem[] {
  if (items.length <= 1) return items;

  const results: NewsItem[] = [];
  const used = new Set<number>();

  const getWordSet = (text: string) => {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
    return new Set(words);
  };

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;

    const cluster = [i];
    const setI = getWordSet(items[i].title);

    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue;

      const setJ = getWordSet(items[j].title);
      const intersection = new Set([...setI].filter(x => setJ.has(x)));
      const union = new Set([...setI, ...setJ]);
      const similarity = intersection.size / union.size;

      if (similarity >= threshold) {
        cluster.push(j);
      }
    }

    // Select the best representative for the cluster
    // Priority: Source Authority (simplified) > Recency
    const bestIdx = cluster.reduce((prev, curr) => {
      const a = items[prev];
      const b = items[curr];
      // Simple authority: favor specific high-quality IDs
      const authority = ['reuters', 'ap_world', 'ap_us', 'nytimes', 'wsj', 'bbc_world'].reduce((acc, id) => {
        if (a.source_name?.toLowerCase().includes(id) || a.id?.includes(id)) acc.a++;
        if (b.source_name?.toLowerCase().includes(id) || b.id?.includes(id)) acc.b++;
        return acc;
      }, { a: 0, b: 0 });

      if (authority.a !== authority.b) return authority.a > authority.b ? prev : curr;
      return new Date(b.pubDate).getTime() > new Date(a.pubDate).getTime() ? curr : prev;
    }, cluster[0]);

    results.push(items[bestIdx]);
    cluster.forEach(idx => used.add(idx));
  }

  return results;
}

export async function registerNewsTools(srv: McpServer) {
  srv.registerTool('news.fetch', {
    description: 'Fetch normalized news. Default: fast brief (GLOBAL_BREAKING + INDIA_NATIONAL_BASE, last 24h). Custom: specify pools/sources/countries/cities/domains/time/keywords. IMPORTANT: For breaking news, ALWAYS provide keywords. For maximum recall, use CLUSTERS of synonyms (e.g. [[\"Trump\", \"Donald Trump\"], [\"attack\", \"assassination\", \"shooting\"]]) to expand the search vector. Set enrichArticles=true to fetch full article text from Google News proxy links (slower but richer content). Use this as the first step, then optionally enrich summaries in a separate call.',
    inputSchema: FetchInput.shape,
    outputSchema: { items: z.array(z.any()), count: z.number(), meta: z.object({ sourcesQueried: z.number(), sourcesSucceeded: z.number(), sourcesFailed: z.number(), totalSourcesAvailable: z.number(), poolIds: z.array(z.string()), countryTags: z.array(z.string()), cityTags: z.array(z.string()), domainTags: z.array(z.string()), keywords: z.array(z.string()), excludeKeywords: z.array(z.string()), matchAll: z.boolean(), timeRange: z.object({ start: z.string(), end: z.string() }) }).optional() }
  }, async (args: any) => {
    if (args.urgency === 'high') {
      args.cacheMode = 'bypass';
    }

    const settings = await loadSettings();
    const baseCfg = getUserConfigDir();
    const cacheDir = path.isAbsolute(settings.cache.dir) ? settings.cache.dir : path.join(baseCfg, settings.cache.dir);
    const http = new HttpClient(settings.http, cacheDir);
    const sf = await loadSources();
    let sources = sf.sources.filter(s => s.is_active !== false);

    const queryTtlMs = resolveNewsQueryTtlMs(settings.cache.queryTtlMs, {
      discoveryMode: args.discoveryMode,
      pools: args.pools,
      keywords: args.keywords,
      fallbackToRealtime: args.fallbackToRealtime,
    });
    const qcache = new QueryCache(cacheDir, queryTtlMs);

    if (args.sources?.length) {
      sources = sources.filter(s => args.sources!.includes(s.id));
    } else {
      let filtered = sources;
      if (args.pools?.length) filtered = filtered.filter(s => s.pools.some(p => args.pools!.includes(p)));
      filtered = resolveSourcesByFilter(filtered, {
        countries: args.countries,
        cities: args.cities,
        domains: args.domains,
      });
      sources = filtered;
    }

    const key = buildQueryKeyForNews({
      pools: args.pools,
      sources: args.sources,
      countries: args.countries,
      cities: args.cities,
      domains: args.domains,
      start: args.start,
      end: args.end,
      limit: args.limit,
      keywords: args.keywords,
      excludeKeywords: args.excludeKeywords,
      matchAll: args.matchAll,
      cacheMode: args.cacheMode,
      includeRaw: args.includeRaw,
      enrichArticles: args.enrichArticles,
      fallbackToRealtime: args.fallbackToRealtime,
      realtimeLimit: args.realtimeLimit,
      realtimeTopic: args.realtimeTopic,
      realtimeProvider: args.realtimeProvider,
      discoveryMode: args.discoveryMode,
    });
    const cachedQuery = await qcache.read<{ items: NewsItem[]; count: number }>(key);
    if (cachedQuery) {
      let valid = true;
      for (const src of sources) {
        const dependencyUrl = resolveNewsCacheDependencyUrl(src.url, {
          start: args.start,
          end: args.end,
          keywords: args.discoveryMode ? [] : args.keywords,
        });
        const fc = await http.readCache(dependencyUrl);
        const depAt = cachedQuery.meta.deps[dependencyUrl];
        if (!fc || !depAt || fc.fetchedAt !== depAt) { valid = false; break; }
      }
      if (valid) {
        const structuredContent = cachedQuery.data;
        return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
      }
    }

    const all: NewsItem[] = [];
    let sourcesSucceeded = 0;
    let sourcesFailed = 0;
    const queue = new PQueue({ concurrency: settings.http.concurrency });

    const fetchPromises = sources.map(src =>
      queue.add(async () => {
        try {
          const url = resolveNewsCacheDependencyUrl(src.url, {
            start: args.start,
            end: args.end,
            keywords: args.discoveryMode ? [] : args.keywords,
          });
          const items = await parseBySource(src, http, args.cacheMode, url);
          sourcesSucceeded++;
          for (const it of items) all.push(it);
        } catch (err: any) {
          sourcesFailed++;
        }
      })
    );

    await Promise.allSettled(fetchPromises);

    let filtered = filterByTime(all, args.start, args.end);
    filtered = args.discoveryMode
      ? filtered
      : filterByKeywords(filtered, args.keywords, args.excludeKeywords, args.matchAll);
    filtered = filtered
      .sort((a,b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, args.limit);

    if (args.enrichArticles) {
      filtered = await enrichArticlesFromLinks(filtered);
    }

    // Smart Batching: group similar news stories to reduce redundancy
    filtered = batchSimilarNews(filtered);

    // Fallback to realtime web search if enabled and no results
    if (args.fallbackToRealtime && filtered.length === 0) {
      const settings = await loadSettings();
      const tavilyClient = new TavilyClient(settings.tavily);
      const firecrawlClient = new FirecrawlClient(settings.firecrawl);
      const provider = args.realtimeProvider === 'auto' ? 'tavily' : args.realtimeProvider;

      if (tavilyClient.isEnabled() || firecrawlClient.isEnabled()) {
        console.log('[news.fetch] No results from IGS sources, falling back to realtime web search');

        let realtimeResults: NewsItem[] = [];
        let actualRealtimeProvider = provider;

        try {
          if (provider === 'tavily' || (provider === 'auto' && tavilyClient.isEnabled())) {
            const response = await tavilyClient.search({
              query: args.keywords?.join(' ') || 'latest news',
              topic: args.realtimeTopic || 'general',
              maxResults: args.realtimeLimit || 10,
              days: args.start ? Math.ceil((Date.now() - new Date(args.start).getTime()) / (1000 * 60 * 60 * 24)) : undefined,
              includeDomains: args.domains,
              excludeDomains: args.excludeKeywords,
            });

            realtimeResults = response.results.map((r: any) => normalizeTavilyResult(r, 'Realtime (Tavily)'));
            actualRealtimeProvider = 'tavily';
          } else if (firecrawlClient.isEnabled()) {
            const response = await firecrawlClient.search({
              query: args.keywords?.join(' ') || 'latest news',
              limit: args.realtimeLimit || 10,
            });

            if (response.success && response.data?.web) {
              realtimeResults = response.data.web.map((r: any) => normalizeFirecrawlResult(r, 'Realtime (Firecrawl)'));
            }
            actualRealtimeProvider = 'firecrawl';
          }
        } catch (error) {
          if (provider === 'tavily' && firecrawlClient.isEnabled()) {
            console.warn('[news.fetch] Tavily failed, falling back to Firecrawl:', error);
            try {
              const response = await firecrawlClient.search({
                query: args.keywords?.join(' ') || 'latest news',
                limit: args.realtimeLimit || 10,
              });

              if (response.success && response.data?.web) {
                realtimeResults = response.data.web.map((r: any) => normalizeFirecrawlResult(r, 'Realtime (Firecrawl fallback)'));
              }
              actualRealtimeProvider = 'firecrawl (fallback)';
            } catch (fallbackError) {
              console.error('[news.fetch] Fallback to Firecrawl also failed:', fallbackError);
            }
          } else if (provider === 'firecrawl' && tavilyClient.isEnabled()) {
            console.warn('[news.fetch] Firecrawl failed, falling back to Tavily:', error);
            try {
              const response = await tavilyClient.search({
                query: args.keywords?.join(' ') || 'latest news',
                topic: args.realtimeTopic || 'general',
                maxResults: args.realtimeLimit || 10,
              });

              realtimeResults = response.results.map((r: any) => normalizeTavilyResult(r, 'Realtime (Tavily fallback)'));
              actualRealtimeProvider = 'tavily (fallback)';
            } catch (fallbackError) {
              console.error('[news.fetch] Fallback to Tavily also failed:', fallbackError);
            }
          } else {
            console.error('[news.fetch] Realtime fallback failed:', error);
          }
        }

        // Apply keyword filtering to realtime results unless we're in broad discovery mode
        realtimeResults = args.discoveryMode
          ? realtimeResults
          : filterByKeywords(realtimeResults, args.keywords, args.excludeKeywords, args.matchAll);

        // Merge with existing results
        filtered = [...filtered, ...realtimeResults];

        // Sort by recency and limit
        filtered.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
        filtered = filtered.slice(0, args.limit);

        console.log(`[news.fetch] Fallback (${actualRealtimeProvider}) returned ${realtimeResults.length} realtime results`);
      }
    }

    if (!args.includeRaw) filtered.forEach(x => { delete (x as any).raw; });
    const deps: Record<string, number> = {};
    for (const src of sources) {
      const dependencyUrl = resolveNewsCacheDependencyUrl(src.url, {
        start: args.start,
        end: args.end,
        keywords: args.discoveryMode ? [] : args.keywords,
      });
      const fc = await http.readCache(dependencyUrl);
      if (fc) deps[dependencyUrl] = fc.fetchedAt;
    }
    const structuredContent = { items: filtered, count: filtered.length, meta: {
      sourcesQueried: sources.length,
      sourcesSucceeded,
      sourcesFailed,
      totalSourcesAvailable: sf.sources.filter(s => s.is_active !== false).length,
      poolIds: args.pools || [],
      countryTags: args.countries || [],
      cityTags: args.cities || [],
      domainTags: args.domains || [],
      keywords: args.keywords || [],
      excludeKeywords: args.excludeKeywords || [],
      matchAll: args.matchAll || false,
      timeRange: { start: args.start || '', end: args.end || '' }
    } };
    await qcache.write(key, deps, structuredContent);
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
  });

  srv.registerTool('news.testSource', {
    description: 'Debug helper. Test a single source id (bypass cache) and return up to 10 items. Use before adding custom sources or scrapers.',
    inputSchema: { id: z.string().min(1), cacheMode: z.enum(['prefer','bypass','only']).optional() },
    outputSchema: { items: z.array(z.any()), count: z.number() }
  }, async (args: any) => {
    const settings = await loadSettings();
    const baseCfg = getUserConfigDir();
    const cacheDir = path.isAbsolute(settings.cache.dir) ? settings.cache.dir : path.join(baseCfg, settings.cache.dir);
    const http = new HttpClient(settings.http, cacheDir);
    const sf = await loadSources();
    const src = sf.sources.find(s => s.id === args.id);
    if (!src) throw new Error(`Source not found: ${args.id}`);
    const items = await parseBySource(src as any, http, args.cacheMode || 'bypass');
    const structuredContent = { items: items.slice(0, 10), count: items.length };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  });
}
