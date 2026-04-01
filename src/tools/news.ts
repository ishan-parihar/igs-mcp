import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadSources, loadSettings } from '../config/loader.js';
import { HttpClient } from '../http/client.js';
import { QueryCache } from '../http/queryCache.js';
import { parseRss } from '../parsers/rss.js';
import { parseOfacHtml } from '../parsers/ofac.js';
import { parseUssfcfcHtml } from '../parsers/ussf_cfc.js';
import { parseWhoJson } from '../parsers/who_dons.js';
import { parseNewslaundryHtml } from '../parsers/newslaundry.js';
import type { NewsItem, Source } from '../types/news.js';
import path from 'node:path';
import { getUserConfigDir } from '../config/loader.js';
import { load as loadHtml } from 'cheerio';
import { parseWithSelectors, autoParseHtml } from '../parsers/generic_html.js';
import { parseJsonFeed } from '../parsers/json_feed.js';

const FetchInput = z.object({
  pools: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  cacheMode: z.enum(['prefer','bypass','only']).default('prefer'),
  includeRaw: z.boolean().optional().default(false),
});

function filterByTime(items: NewsItem[], start?: string, end?: string) {
  const s = start ? new Date(start).getTime() : -Infinity;
  const e = end ? new Date(end).getTime() : Infinity;
  return items.filter(x => {
    const t = new Date(x.pubDate).getTime();
    return t >= s && t <= e;
  });
}

async function parseBySource(source: Source, http: HttpClient, cacheMode: 'prefer'|'bypass'|'only') {
  const headers = source.headers || {};
  const res = await http.fetch(source.url, headers, cacheMode);
  if ('cached' in res && res.cached) {
    const items = (res.cache.items as any[]);
    return items as NewsItem[]; // stored normalized
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
  } else if (source.parser === 'generic_html' && source.parserConfig?.selectors) {
    items = await parseWithSelectors(source, res.response.bodyText, source.parserConfig.selectors as any);
  } else {
    // Auto-detect: if content-type or body indicates XML/Atom → parse as RSS.
    const ctype = (res.response.headers['content-type'] || '').toLowerCase();
    const body = res.response.bodyText;
    const looksXml = ctype.includes('xml') || ctype.includes('rss') || ctype.includes('atom') || /<rss[\s>/]/i.test(body) || /<feed[\s>/]/i.test(body);
    if (looksXml) {
      items = await parseRss(source, body, true);
    } else {
      // JSON feed autodetect
      if (ctype.includes('json') || /^[\[{]/.test(body.trim())) {
        const jitems = parseJsonFeed(source, body);
        if (jitems.length) {
          items = jitems;
        } else {
          items = [];
        }
      } else {
      // Try to discover RSS/Atom via HTML <link rel="alternate" type="application/rss+xml">
      try {
        const $ = loadHtml(body);
        const linkEl = $("link[rel='alternate'][type*='rss'], link[rel='alternate'][type*='atom']").first();
        const href = linkEl.attr('href');
        if (href) {
          const rssUrl = new URL(href, source.url).toString();
          const res2 = await http.fetch(rssUrl, headers, cacheMode);
          if ('response' in res2) {
            items = await parseRss(source, res2.response.bodyText, true);
          }
        } else {
          const auto = await autoParseHtml(source, body);
          items = auto.items;
        }
      } catch {
        items = [];
      }
      }
    }
  }
  await http.writeCache(source.url, items, (res as any).etag, (res as any).lastModified);
  return items;
}

function buildQueryKey(kind: string, pools: string[]|undefined, sources: string[]|undefined, start?: string, end?: string, limit?: number) {
  return [kind, (pools||[]).slice().sort().join(','), (sources||[]).slice().sort().join(','), start||'', end||'', String(limit||'')].join('|');
}

export async function registerNewsTools(srv: McpServer) {
  // Using deprecated tool() for simplicity; can be migrated to registerTool later.
  srv.registerTool('news.fetch', {
    description: 'Fetch normalized news from live sources within time window',
    inputSchema: FetchInput.shape,
    outputSchema: { items: z.array(z.any()), count: z.number() }
  }, async (args: any) => {
    const settings = await loadSettings();
    const baseCfg = getUserConfigDir();
    const cacheDir = path.isAbsolute(settings.cache.dir) ? settings.cache.dir : path.join(baseCfg, settings.cache.dir);
    const http = new HttpClient(settings.http, cacheDir);
    const qcache = new QueryCache(cacheDir, settings.cache.queryTtlMs);
    const sf = await loadSources();
    let sources = sf.sources.filter(s => s.is_active !== false);
    if (args.pools?.length) sources = sources.filter(s => s.pools.some(p => args.pools!.includes(p)));
    if (args.sources?.length) sources = sources.filter(s => args.sources!.includes(s.id));

    // Query-level cache: avoid any network calls if sources' feed caches haven't changed
    const key = buildQueryKey('news.fetch', args.pools, args.sources, args.start, args.end, args.limit);
    const cachedQuery = await qcache.read<{ items: NewsItem[]; count: number }>(key);
    if (cachedQuery) {
      // Verify deps still match feed caches
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
    for (const src of sources) {
      try {
        const items = await parseBySource(src, http, args.cacheMode);
        for (const it of items) all.push(it);
      } catch (err: any) {
        // continue on source error
        // Optionally push a warning record
      }
    }

    const filtered = filterByTime(all, args.start, args.end)
      .sort((a,b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, args.limit);

    if (!args.includeRaw) filtered.forEach(x => { delete (x as any).raw; });
    const deps: Record<string, number> = {};
    for (const src of sources) {
      const fc = await http.readCache(src.url);
      if (fc) deps[src.url] = fc.fetchedAt;
    }
    const structuredContent = { items: filtered, count: filtered.length };
    await qcache.write(key, deps, structuredContent);
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
  });

  // Quick single-source tester for agents
  srv.registerTool('news.testSource', {
    description: 'Test a single source by id and return up to 10 sample items',
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
