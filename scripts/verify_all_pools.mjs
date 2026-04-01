import path from 'node:path';
import { loadSettings, loadSources, getUserConfigDir } from '../dist/config/loader.js';
import { HttpClient } from '../dist/http/client.js';
import { parseRss } from '../dist/parsers/rss.js';
import { parseJsonFeed } from '../dist/parsers/json_feed.js';
import { autoParseHtml } from '../dist/parsers/generic_html.js';
import { parseOfacHtml } from '../dist/parsers/ofac.js';
import { parseWhoJson } from '../dist/parsers/who_dons.js';
import { parseNewslaundryHtml } from '../dist/parsers/newslaundry.js';

// Sample 1-2 from each pool to keep test manageable
const TEST_IDS = [
  // GLOBAL_BREAKING
  'bbc_world', 'aljazeera', 'reuters_india',
  // GLOBAL_GEOECON
  'the_diplomat', 'rand', 'brookings', 'india_geoecon',
  // GLOBAL_LAW_REG
  'et_legal', 'scotusblog', 'india_law_news', 'global_sanctions',
  // GLOBAL_TECH_CYBER
  'techcrunch', 'the_verge', 'darkreading', 'medianama', 'hackernews',
  // GLOBAL_ENV_HEALTH
  'nature_news', 'science_mag', 'mongabay',
  // GLOBAL_CULT_SOC
  'aeon', 'noema',
  // INDIA_NATIONAL_BASE
  'the_hindu', 'ie_national', 'india_national_gn', 'mint_politics',
  // INDIA_WATCHDOG
  'scroll_in', 'the_wire', 'newslaundry',
  // INDIA_FACTCHECK_DATA
  'altnews', 'indiaspend',
  // INDIA_BUSINESS_REG
  'moneycontrol', 'livemint', 'mint_markets', 'india_business_news',
  // INDIA_REGION
  'ie_south', 'the_hindu_tamil_nadu',
  // INDIA_CITIES
  'the_hindu_delhi', 'ie_mumbai',
];

async function run() {
  const settings = await loadSettings();
  const baseCfg = getUserConfigDir();
  const cacheDir = path.isAbsolute(settings.cache.dir) ? settings.cache.dir : path.join(baseCfg, settings.cache.dir);
  const http = new HttpClient(settings.http, cacheDir);
  const sf = await loadSources();

  let passed = 0, failed = 0;
  const failures = [];

  for (const id of TEST_IDS) {
    const src = sf.sources.find(s => s.id === id);
    if (!src) { console.log(`⚠ ${id}: not found in config`); failed++; failures.push(id); continue; }

    try {
      const res = await http.fetch(src.url, src.headers || {}, 'bypass');
      if (!('response' in res)) { console.log(`⚠ ${id}: no response`); failed++; failures.push(id); continue; }

      const ctype = (res.response.headers['content-type'] || '').toLowerCase();
      const body = res.response.bodyText;
      let items;

      switch (src.parser) {
        case 'ofac': items = parseOfacHtml(src, body); break;
        case 'who_dons': items = parseWhoJson(src, body); break;
        case 'newslaundry': items = parseNewslaundryHtml(src, body); break;
        case 'generic_html': {
          const auto = await autoParseHtml(src, body);
          items = auto.items;
          break;
        }
        default:
          if (ctype.includes('json') || /^[\[{]/.test(body.trim())) {
            items = parseJsonFeed(src, body);
          } else {
            items = await parseRss(src, body, true);
          }
      }

      if (items && items.length > 0) {
        console.log(`✓ ${src.name}: ${items.length} items [${src.pools.join(', ')}]`);
        passed++;
      } else {
        console.log(`✗ ${src.name}: 0 items [${src.pools.join(', ')}]`);
        failed++;
        failures.push(id);
      }
    } catch (e) {
      console.log(`✗ ${src.name}: ${e.message.slice(0, 80)}`);
      failed++;
      failures.push(id);
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${TEST_IDS.length} tested`);
  if (failures.length) console.log(`Failed IDs: ${failures.join(', ')}`);
}

run().catch(e => { console.error(e); process.exit(1); });
