import path from 'node:path';
import { loadSettings, loadSources, getUserConfigDir } from '../dist/config/loader.js';
import { HttpClient } from '../dist/http/client.js';
import { parseRss } from '../dist/parsers/rss.js';

const TEST_IDS = [
  'guardian_us', 'npr_top',
  'bbc_uk', 'guardian_uk',
  'france24_fr',
  'bbc_europe', 'politico_europe',
  'japantimes_national',
  'abc_au_top',
  'cbc_top',
  'guardian_china',
  'moscow_times',
  'bbc_africa',
  'france24_me',
];

async function run() {
  const settings = await loadSettings();
  const baseCfg = getUserConfigDir();
  const cacheDir = path.isAbsolute(settings.cache.dir) ? settings.cache.dir : path.join(baseCfg, settings.cache.dir);
  const http = new HttpClient(settings.http, cacheDir);
  const sf = await loadSources();

  let passed = 0, failed = 0;
  for (const id of TEST_IDS) {
    const src = sf.sources.find(s => s.id === id);
    if (!src) { console.log(`⚠ ${id}: not found`); failed++; continue; }
    try {
      const res = await http.fetch(src.url, src.headers || {}, 'bypass');
      if (!('response' in res)) { console.log(`⚠ ${src.name}: no response`); failed++; continue; }
      const items = await parseRss(src, res.response.bodyText, true);
      if (items && items.length) { console.log(`✓ ${src.name}: ${items.length} items`); passed++; }
      else { console.log(`✗ ${src.name}: 0 items`); failed++; }
    } catch (e) {
      console.log(`✗ ${src?.name || id}: ${e.message.slice(0,80)}`);
      failed++;
    }
  }
  console.log(`\nResults: ${passed} passed, ${failed} failed, ${TEST_IDS.length} tested`);
}

run().catch(e => { console.error(e); process.exit(1); });
