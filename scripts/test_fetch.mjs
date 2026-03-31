import path from 'node:path';
import { loadSettings, loadSources, saveSources, getUserConfigDir } from '../dist/config/loader.js';
import { HttpClient } from '../dist/http/client.js';
import { QueryCache } from '../dist/http/queryCache.js';
import { parseRss } from '../dist/parsers/rss.js';
import { parseOfacHtml } from '../dist/parsers/ofac.js';
import { parseUssfcfcHtml } from '../dist/parsers/ussf_cfc.js';
import { parseWhoJson } from '../dist/parsers/who_dons.js';
import { parseNewslaundryHtml } from '../dist/parsers/newslaundry.js';

async function upsertSource(s) {
  const sf = await loadSources();
  const idx = sf.sources.findIndex(x => x.id === s.id);
  if (idx >= 0) sf.sources[idx] = s; else sf.sources.push(s);
  await saveSources(sf);
}

async function removeSource(id) {
  const sf = await loadSources();
  sf.sources = sf.sources.filter(s => s.id !== id);
  await saveSources(sf);
}

async function parseBySource(source, http, cacheMode) {
  const res = await http.fetch(source.url, source.headers || {}, cacheMode);
  if (res.cached) {
    return (res.cache.items);
  }
  if (!('response' in res)) return [];
  let items = [];
  switch (source.parser) {
    case 'ofac': items = parseOfacHtml(source, res.response.bodyText); break;
    case 'ussf_cfc': items = parseUssfcfcHtml(source, res.response.bodyText); break;
    case 'who_dons': items = parseWhoJson(source, res.response.bodyText); break;
    case 'newslaundry': items = parseNewslaundryHtml(source, res.response.bodyText); break;
    case 'rss':
    default:
      items = await parseRss(source, res.response.bodyText, true);
  }
  await http.writeCache(source.url, items, res.etag, res.lastModified);
  return items;
}

async function run() {
  const settings = await loadSettings();
  const baseCfg = getUserConfigDir();
  const cacheDir = path.isAbsolute(settings.cache.dir) ? settings.cache.dir : path.join(baseCfg, settings.cache.dir);
  const http = new HttpClient(settings.http, cacheDir);
  // qcache unused here but would be used for multi-source merges
  // const qcache = new QueryCache(cacheDir, settings.cache.queryTtlMs);

  const testRss = { id: 'test_rss_ars', name: 'Test Ars Technica (RSS)', type: 'rss', url: 'http://feeds.arstechnica.com/arstechnica/index', parser: 'rss', pools: [], is_active: true };
  await upsertSource(testRss);
  const testHttpRss = { id: 'test_http_rss_ars', name: 'Test Ars Technica (HTTP RSS)', type: 'http', url: 'http://feeds.arstechnica.com/arstechnica/index', pools: [], is_active: true };
  await upsertSource(testHttpRss);
  const who = { id: 'test_who_dons', name: 'WHO DONs (Test Copy)', type: 'http', url: 'https://www.who.int/api/emergencies/diseaseoutbreaknews', parser: 'who_dons', pools: [], is_active: true };
  await upsertSource(who);

  const sources = [testRss, testHttpRss, who];
  for (const src of sources) {
    const items = await parseBySource(src, http, 'bypass');
    console.log(`SOURCE ${src.id} (${src.type}${src.parser ? '/' + src.parser : ''}) -> ${items.length} items`);
    for (const it of items.slice(0, 3)) {
      console.log(`- ${it.pubDate} | ${it.title} | ${it.link}`);
    }
  }

  await removeSource(testRss.id);
  await removeSource(testHttpRss.id);
  await removeSource(who.id);
}

run().catch((e) => { console.error(e); process.exit(1); });
