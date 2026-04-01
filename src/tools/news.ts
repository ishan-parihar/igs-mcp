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
import type { NewsItem, Source } from '../types/news.js';
import path from 'node:path';
import { load as loadHtml } from 'cheerio';
import { parseWithSelectors, autoParseHtml } from '../parsers/generic_html.js';
import { parseJsonFeed } from '../parsers/json_feed.js';
import { extractArticleContent } from '../parsers/article_content.js';
import { request } from 'undici';
import PQueue from 'p-queue';
import { rewriteGnUrl } from '../utils/gn-url.js';

const FetchInput = z.object({
  pools: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  excludeKeywords: z.array(z.string()).optional(),
  matchAll: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(500).default(100),
  cacheMode: z.enum(['prefer','bypass','only']).default('prefer'),
  includeRaw: z.boolean().optional().default(false),
  enrichArticles: z.boolean().optional().default(false),
});

function filterByTime(items: NewsItem[], start?: string, end?: string) {
  const s = start ? new Date(start).getTime() : -Infinity;
  const e = end ? new Date(end).getTime() : Infinity;
  return items.filter(x => {
    const t = new Date(x.pubDate).getTime();
    return t >= s && t <= e;
  });
}

async function parseBySource(source: Source, http: HttpClient, cacheMode: 'prefer'|'bypass'|'only', overrideUrl?: string) {
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

function buildQueryKey(
  kind: string,
  pools: string[]|undefined,
  sources: string[]|undefined,
  start?: string,
  end?: string,
  limit?: number,
  keywords?: string[],
  domains?: string[],
  matchAll?: boolean
) {
  return [
    kind,
    (pools||[]).slice().sort().join(','),
    (sources||[]).slice().sort().join(','),
    start||'',
    end||'',
    String(limit||''),
    (keywords||[]).join('|'),
    (domains||[]).join('|'),
    matchAll ? '1' : '0'
  ].join('|');
}

function filterByKeywords(items: NewsItem[], keywords: string[] = [], exclude: string[] = [], matchAll = false): NewsItem[] {
  if ((!keywords || keywords.length === 0) && (!exclude || exclude.length === 0)) return items;
  const kws = (keywords || []).map(k => k.toLowerCase());
  const exs = (exclude || []).map(k => k.toLowerCase());
  return items.filter(it => {
    const text = `${it.title} ${it.content_snippet} ${it.link}`.toLowerCase();
    if (exs.length && exs.some(e => text.includes(e))) return false;
    if (kws.length === 0) return true;
    return matchAll ? kws.every(k => text.includes(k)) : kws.some(k => text.includes(k));
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
        });
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

export async function registerNewsTools(srv: McpServer) {
  srv.registerTool('news.fetch', {
    description: 'Fetch normalized news. Default: fast brief (GLOBAL_BREAKING + INDIA_NATIONAL_BASE, last 24h). Custom: specify pools/sources/countries/cities/domains/time/keywords. Set enrichArticles=true to fetch full article text from Google News proxy links (slower but richer content). Use this as the first step, then optionally enrich summaries in a separate call.',
    inputSchema: FetchInput.shape,
    outputSchema: { items: z.array(z.any()), count: z.number(), meta: z.object({ sourcesQueried: z.number(), sourcesSucceeded: z.number(), sourcesFailed: z.number(), totalSourcesAvailable: z.number(), poolIds: z.array(z.string()), countryTags: z.array(z.string()), cityTags: z.array(z.string()), domainTags: z.array(z.string()), keywords: z.array(z.string()), excludeKeywords: z.array(z.string()), matchAll: z.boolean(), timeRange: z.object({ start: z.string(), end: z.string() }) }).optional() }
  }, async (args: any) => {
    const settings = await loadSettings();
    const baseCfg = getUserConfigDir();
    const cacheDir = path.isAbsolute(settings.cache.dir) ? settings.cache.dir : path.join(baseCfg, settings.cache.dir);
    const http = new HttpClient(settings.http, cacheDir);
    const qcache = new QueryCache(cacheDir, settings.cache.queryTtlMs);
    const sf = await loadSources();
    let sources = sf.sources.filter(s => s.is_active !== false);

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

    const key = buildQueryKey('news.fetch', args.pools, args.sources, args.start, args.end, args.limit, args.keywords, args.domains, args.matchAll);
    const cachedQuery = await qcache.read<{ items: NewsItem[]; count: number }>(key);
    if (cachedQuery) {
      let valid = true;
      for (const src of sources) {
        const fc = await http.readCache(src.url);
        const depAt = cachedQuery.meta.deps[src.url];
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
          const url = rewriteGnUrl(src.url, { start: args.start, end: args.end, keywords: args.keywords });
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
    filtered = filterByKeywords(filtered, args.keywords, args.excludeKeywords, args.matchAll)
      .sort((a,b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, args.limit);

    if (args.enrichArticles) {
      filtered = await enrichArticlesFromLinks(filtered);
    }

    if (!args.includeRaw) filtered.forEach(x => { delete (x as any).raw; });
    const deps: Record<string, number> = {};
    for (const src of sources) {
      const fc = await http.readCache(src.url);
      if (fc) deps[src.url] = fc.fetchedAt;
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
