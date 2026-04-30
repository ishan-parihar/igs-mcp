import { loadSources, loadSettings, getUserConfigDir } from '../src/config/loader.js';
import { HttpClient } from '../src/http/client.js';
import { parseRss } from '../src/parsers/rss.js';
import path from 'node:path';

async function testSource(id: string) {
  const settings = await loadSettings();
  const baseCfg = getUserConfigDir();
  const cacheDir = path.isAbsolute(settings.cache.dir) ? settings.cache.dir : path.join(baseCfg, settings.cache.dir);
  const http = new HttpClient(settings.http, cacheDir);
  const sf = await loadSources();
  const src = sf.sources.find(s => s.id === id);
  if (!src) {
    console.log(`❌ Source ${id} not found`);
    return;
  }
  console.log(`Testing source: ${src.name} (${src.url})`);
  try {
    const res = await http.fetch(src.url, src.headers || {}, 'bypass');
    if ('response' in res) {
      const items = await parseRss(src, res.response.bodyText, true);
      console.log(`✅ ${id} returned ${items.length} items. Latest: ${items[0]?.title}`);
    } else {
      console.log(`❌ ${id} failed to fetch`);
    }
  } catch (e) {
    console.log(`❌ ${id} error: ${e}`);
  }
}

async function run() {
  const breakingSources = ['ap_world', 'ap_us', 'nytimes', 'wsj', 'guardian_world'];
  for (const id of breakingSources) {
    await testSource(id);
  }
}

run();
