import path from 'node:path';
import { loadSettings, loadSources, getUserConfigDir } from '../dist/config/loader.js';
import { HttpClient } from '../dist/http/client.js';
import { parseRss } from '../dist/parsers/rss.js';
import { parseJsonFeed } from '../dist/parsers/json_feed.js';

// Sample one source per major pool category (RSS-only to keep verification simple)
const TEST_IDS = [
  'bbc_world',            // GLOBAL_BREAKING
  'the_diplomat',         // GLOBAL_GEOECON
  'mit_tech_review',      // GLOBAL_TECH_CYBER
  'aeon',                 // GLOBAL_CULT_SOC
  'the_hindu',            // INDIA_NATIONAL_BASE
  'scroll_in',            // INDIA_NATIONAL_BASE + WATCHDOG
  'altnews',              // INDIA_FACTCHECK_DATA
  'the_hindu_delhi',      // INDIA_CITIES
  'ie_national',          // INDIA_NATIONAL_BASE
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
    if (!src) { console.log(`⚠ ${id}: not found in user config`); failed++; continue; }

    try {
      const res = await http.fetch(src.url, src.headers || {}, 'bypass');
      if (!('response' in res)) { console.log(`⚠ ${id}: no response`); failed++; continue; }

      const ctype = (res.response.headers['content-type'] || '').toLowerCase();
      const body = res.response.bodyText;

      let items;
      if (ctype.includes('json') || /^[\[{]/.test(body.trim())) {
        items = parseJsonFeed(src, body);
      } else {
        items = await parseRss(src, body, true);
      }

      if (items && items.length > 0) {
        console.log(`✓ ${src.name}: ${items.length} items [${src.pools.join(', ')}]`);
        passed++;
      } else {
        console.log(`✗ ${src.name}: 0 items [${src.pools.join(', ')}]`);
        failed++;
      }
    } catch (e) {
      console.log(`✗ ${src.name}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed, ${TEST_IDS.length} total`);
}

run().catch(e => { console.error(e); process.exit(1); });
