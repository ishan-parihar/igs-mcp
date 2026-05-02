import { loadSettings, loadSources, getUserConfigDir } from '../dist/config/loader.js';
import { HttpClient } from '../dist/http/client.js';
import { parseRss } from '../dist/parsers/rss.js';
import { autoParseHtml } from '../dist/parsers/generic_html.js';
import { parseWhoJson } from '../dist/parsers/who_dons.js';
import { parseNewslaundryHtml } from '../dist/parsers/newslaundry.js';

// Test newly added sources
const NEW_SOURCE_IDS = [
  // GLOBAL_BREAKING additions
  'ap_world', 'ap_us', 'bloomberg_markets', 'china_daily',
  // GLOBAL_CITIES additions
  'japan_times', 'news_on_japan', 'emirates247', 'dubai_chronicle',
  'local_berlin', 'beijinger', 'hongkong_fp', 'standard_hk',
  'google_news_tokyo', 'google_news_dubai', 'google_news_paris',
  'google_news_berlin', 'google_news_beijing', 'google_news_sydney',
  // GLOBAL_COUNTRIES native sources
  'moscow_times', 'rt_russia', 'rt_russia_section',
  'mehr_news', 'tasnim_news', 'tehran_times', 'iran_news_daily',
  'brazil_news', 'mercopress_brazil',
  'dawn_pakistan', 'dawn_pakistan_section',
  'scmp_china', 'scmp_hongkong', 'scmp_world',
  // GLOBAL_LAW_REG additions
  'cjeu_press', 'wto_news', 'fatf_publications',
  // GLOBAL_CULT_SOC additions
  'african_arguments', 'kyoto_journal', 'conversation_africa', 'memo',
  // INDIA_FACTCHECK_DATA additions
  'factly', 'fact_crescendo', 'indiatoday_factcheck', 'newschecker',
];

async function run() {
  const settings = await loadSettings();
  const baseCfg = getUserConfigDir();
  const cacheDir = baseCfg + '/cache';
  const http = new HttpClient(settings.http, cacheDir);
  const sf = await loadSources();

  let passed = 0, failed = 0;
  const failures = [];

  for (const id of NEW_SOURCE_IDS) {
    const src = sf.sources.find(s => s.id === id);
    if (!src) {
      console.log(`✗ ${id}: NOT FOUND`);
      failed++;
      failures.push(id);
      continue;
    }

    try {
      const res = await http.fetch(src.url, src.headers || {}, 'bypass');
      if (!('response' in res)) {
        console.log(`✗ ${src.name}: NO RESPONSE`);
        failed++;
        failures.push(id);
        continue;
      }

      const ctype = (res.response.headers['content-type'] || '').toLowerCase();
      const body = res.response.bodyText;
      let items;

      if (src.parser === 'rss') {
        items = await parseRss(src, body, true);
      } else if (src.parser === 'generic_html') {
        const auto = await autoParseHtml(src, body);
        items = auto.items;
      } else if (src.parser === 'who_dons') {
        items = parseWhoJson(src, body);
      } else if (src.parser === 'newslaundry') {
        items = parseNewslaundryHtml(src, body);
      } else {
        items = body.length > 100 ? [{title: 'OK', link: src.url}] : [];
      }

      if (items && items.length > 0) {
        console.log(`✓ ${src.name}: ${items.length} items`);
        passed++;
      } else {
        console.log(`✗ ${src.name}: 0 items`);
        failed++;
        failures.push(id);
      }
    } catch (e) {
      console.log(`✗ ${src.name}: ${e.message.slice(0, 80)}`);
      failed++;
      failures.push(id);
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed, ${NEW_SOURCE_IDS.length} tested`);
  if (failures.length) console.log(`Failed IDs: ${failures.join(', ')}`);
}

run().catch(e => { console.error(e); process.exit(1); });
