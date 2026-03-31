import path from 'node:path';
import { loadSettings, loadSources, saveSources, getUserConfigDir } from '../src/config/loader.js';
import { HttpClient } from '../src/http/client.js';
import { QueryCache } from '../src/http/queryCache.js';
import { parseRss } from '../src/parsers/rss.js';
import { parseOfacHtml } from '../src/parsers/ofac.js';
import { parseUssfcfcHtml } from '../src/parsers/ussf_cfc.js';
import { parseWhoJson } from '../src/parsers/who_dons.js';
import { parseNewslaundryHtml } from '../src/parsers/newslaundry.js';
import type { Source, NewsItem } from '../src/types/news.js';

async function upsertSource(s: Source) {
  const sf = await loadSources();
  const idx = sf.sources.findIndex(x => x.id === s.id);
  if (idx >= 0) sf.sources[idx] = s; else sf.sources.push(s);
  await saveSources(sf);
}

async function removeSource(id: string) {
  const sf = await loadSources();
  sf.sources = sf.sources.filter(s => s.id !== id);
  await saveSources(sf);
}

async function parseBySource(source: Source, http: HttpClient, cacheMode: 'prefer'|'bypass'|'only'): Promise<NewsItem[]> {
  const res = await http.fetch(source.url, source.headers || {}, cacheMode);
  if (res.cached) {
    return (res.cache.items as NewsItem[]);
  }
  if (!('response' in res)) return [];
  let items: NewsItem[] = [];
  switch (source.parser) {
    case 'ofac': items = parseOfacHtml(source, res.response.bodyText); break;
    case 'ussf_cfc': items = parseUssfcfcHtml(source, res.response.bodyText); break;
    case 'who_dons': items = parseWhoJson(source, res.response.bodyText); break;
    case 'newslaundry': items = parseNewslaundryHtml(source, res.response.bodyText); break;
    case 'rss':
    default:
      items = await parseRss(source, res.response.bodyText, true);
  }
  await http.writeCache(source.url, items, (res as any).etag, (res as any).lastModified);
  return items;
}

async function run() {
  const settings = await loadSettings();
  const baseCfg = getUserConfigDir();
  const cacheDir = path.isAbsolute(settings.cache.dir) ? settings.cache.dir : path.join(baseCfg, settings.cache.dir);
  const http = new HttpClient(settings.http, cacheDir);

  // 1) Add test RSS source
  const testRss: Source = {
    id: 'test_rss_ars', name: 'Test Ars Technica (RSS)', type: 'rss',
    url: 'http://feeds.arstechnica.com/arstechnica/index', parser: 'rss', pools: [], is_active: true
  };
  await upsertSource(testRss);

  // 2) Add test HTTP source that returns RSS (no parser specified to exercise default)
  const testHttpRss: Source = {
    id: 'test_http_rss_ars', name: 'Test Ars Technica (HTTP RSS)', type: 'http',
    url: 'http://feeds.arstechnica.com/arstechnica/index', pools: [], is_active: true
  } as any;
  await upsertSource(testHttpRss);

  // 3) Ensure WHO DONs present (JSON HTTP)
  const who: Source = {
    id: 'test_who_dons', name: 'WHO DONs (Test Copy)', type: 'http',
    url: 'https://www.who.int/api/emergencies/diseaseoutbreaknews', parser: 'who_dons', pools: [], is_active: true
  };
  await upsertSource(who);

  const sources = [testRss, testHttpRss, who];

  for (const src of sources) {
    const items = await parseBySource(src, http, 'bypass');
    console.log(`SOURCE ${src.id} (${src.type}${src.parser ? '/' + src.parser : ''}) -> ${items.length} items`);
    for (const it of items.slice(0, 3)) {
      console.log(`- ${it.pubDate} | ${it.title} | ${it.link}`);
    }
  }

  // Cleanup test sources
  await removeSource(testRss.id);
  await removeSource(testHttpRss.id);
  await removeSource(who.id);
}

run().catch((e) => { console.error(e); process.exit(1); });
