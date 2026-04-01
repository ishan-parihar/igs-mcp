import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDir = path.resolve(__dirname, '..', 'config');

// ── Sources to add, grouped by target pool ──────────────
const additions = [
  // ═══ GLOBAL_LAW_REG — currently only 1 source (OFAC) ═══
  { id: 'et_legal', name: 'ET Legal World', type: 'rss', url: 'https://economictimes.indiatimes.com/industry/banking/finance/rssfeeds/13358259.cms', parser: 'rss', pools: ['GLOBAL_LAW_REG', 'INDIA_BUSINESS_REG'] },
  { id: 'bar_and_bench', name: 'Bar & Bench', type: 'http', url: 'https://barandbench.com/', parser: 'generic_html', parserConfig: { listUrl: 'https://barandbench.com/news', selectors: { item: 'article', title: 'h2 a', link: 'a', date: 'time', desc: 'p' } }, pools: ['GLOBAL_LAW_REG', 'INDIA_WATCHDOG'] },
  { id: 'scotusblog', name: 'SCOTUSblog', type: 'rss', url: 'https://www.scotusblog.com/feed/', parser: 'rss', pools: ['GLOBAL_LAW_REG'] },
  { id: 'india_law_news', name: 'India Law (Google News)', type: 'rss', url: 'https://news.google.com/rss/search?q=india+law+regulation+supreme+court&hl=en-IN&gl=IN&ceid=IN:en', parser: 'rss', pools: ['GLOBAL_LAW_REG', 'INDIA_WATCHDOG'] },
  { id: 'global_sanctions', name: 'Global Sanctions (Google News)', type: 'rss', url: 'https://news.google.com/rss/search?q=international+sanctions+regulatory&hl=en-US&gl=US&ceid=US:en', parser: 'rss', pools: ['GLOBAL_LAW_REG'] },
  { id: 'us_state_dept', name: 'US State Department', type: 'rss', url: 'https://www.state.gov/rss/', parser: 'rss', pools: ['GLOBAL_LAW_REG', 'GLOBAL_GEOECON'] },

  // ═══ GLOBAL_GEOECON — currently 7, add 5-6 more ═══
  { id: 'rand', name: 'RAND Corporation', type: 'rss', url: 'https://www.rand.org/topics/defense-and-national-security.xml', parser: 'rss', pools: ['GLOBAL_GEOECON'] },
  { id: 'brookings', name: 'Brookings Institution', type: 'rss', url: 'https://www.brookings.edu/topic/international-affairs/feed/', parser: 'rss', pools: ['GLOBAL_GEOECON'] },
  { id: 'idsa', name: 'IDSA (Defence Studies)', type: 'http', url: 'https://www.idsa.in/', parser: 'generic_html', parserConfig: { listUrl: 'https://www.idsa.in/issuebrief', selectors: { item: 'div.views-row', title: 'a', link: 'a', date: 'span.date-display-single', desc: 'p' } }, pools: ['GLOBAL_GEOECON'] },
  { id: 'india_geoecon', name: 'India Geopolitics (Google News)', type: 'rss', url: 'https://news.google.com/rss/search?q=india+geopolitics+strategy+defense&hl=en-IN&gl=IN&ceid=IN:en', parser: 'rss', pools: ['GLOBAL_GEOECON', 'INDIA_NATIONAL_BASE'] },
  { id: 'imf_news', name: 'IMF News', type: 'rss', url: 'https://www.imf.org/en/News/Rss', parser: 'rss', pools: ['GLOBAL_GEOECON', 'GLOBAL_LAW_REG'] },
  { id: 'world_bank', name: 'World Bank News', type: 'rss', url: 'https://www.worldbank.org/en/news/all', parser: 'rss', pools: ['GLOBAL_GEOECON', 'GLOBAL_ENV_HEALTH'] },

  // ═══ GLOBAL_TECH_CYBER — currently 4, add 5-6 more ═══
  { id: 'techcrunch', name: 'TechCrunch', type: 'rss', url: 'https://techcrunch.com/feed/', parser: 'rss', pools: ['GLOBAL_TECH_CYBER'] },
  { id: 'the_verge', name: 'The Verge', type: 'rss', url: 'https://www.theverge.com/rss/index.xml', parser: 'rss', pools: ['GLOBAL_TECH_CYBER'] },
  { id: 'wired', name: 'Wired', type: 'rss', url: 'https://www.wired.com/feed/rss', parser: 'rss', pools: ['GLOBAL_TECH_CYBER'] },
  { id: 'darkreading', name: 'Dark Reading', type: 'rss', url: 'https://www.darkreading.com/rss.xml', parser: 'rss', pools: ['GLOBAL_TECH_CYBER'] },
  { id: 'hackernews', name: 'Hacker News', type: 'rss', url: 'https://hnrss.org/frontpage', parser: 'rss', pools: ['GLOBAL_TECH_CYBER'] },
  { id: 'medianama', name: 'MediaNama', type: 'rss', url: 'https://www.medianama.com/feed/', parser: 'rss', pools: ['GLOBAL_TECH_CYBER', 'INDIA_BUSINESS_REG'] },
  { id: 'the_ken', name: 'The Ken', type: 'http', url: 'https://the-ken.com/', parser: 'generic_html', parserConfig: { listUrl: 'https://the-ken.com/latest', selectors: { item: 'article', title: 'h2 a', link: 'a', desc: 'p' } }, pools: ['GLOBAL_TECH_CYBER', 'INDIA_BUSINESS_REG'] },

  // ═══ GLOBAL_ENV_HEALTH — currently 3, add 3 more ═══
  { id: 'nature_news', name: 'Nature News', type: 'rss', url: 'https://www.nature.com/nature.rss', parser: 'rss', pools: ['GLOBAL_ENV_HEALTH', 'GLOBAL_TECH_CYBER'] },
  { id: 'science_mag', name: 'Science Magazine', type: 'rss', url: 'https://www.science.org/rss/news_current.xml', parser: 'rss', pools: ['GLOBAL_ENV_HEALTH', 'GLOBAL_TECH_CYBER'] },
  { id: 'stat_news', name: 'STAT News', type: 'rss', url: 'https://www.statnews.com/feed/', parser: 'rss', pools: ['GLOBAL_ENV_HEALTH'] },

  // ═══ INDIA_BUSINESS_REG — currently 5, add 4 more ═══
  { id: 'mca_notifications', name: 'MCA Notifications', type: 'http', url: 'https://www.mca.gov.in/content/mca/global/en/acts-rules/ebooks/acts.html', parser: 'generic_html', parserConfig: { listUrl: 'https://www.mca.gov.in/content/mca/global/en/about-us/news.html', selectors: { item: 'div.cmp-teaser', title: 'a', link: 'a', desc: 'p' } }, pools: ['INDIA_BUSINESS_REG'] },
  { id: 'india_business_news', name: 'India Business (Google News)', type: 'rss', url: 'https://news.google.com/rss/search?q=india+business+finance+markets&hl=en-IN&gl=IN&ceid=IN:en', parser: 'rss', pools: ['INDIA_BUSINESS_REG'] },
  { id: 'moneycontrol', name: 'Moneycontrol', type: 'rss', url: 'https://www.moneycontrol.com/rss/latestnews.xml', parser: 'rss', pools: ['INDIA_BUSINESS_REG'] },
  { id: 'mint_markets', name: 'Livemint Markets', type: 'rss', url: 'https://www.livemint.com/rss/markets', parser: 'rss', pools: ['INDIA_BUSINESS_REG'] },

  // ═══ INDIA_NATIONAL_BASE — add 2 more for breadth ═══
  { id: 'india_national_gn', name: 'India National (Google News)', type: 'rss', url: 'https://news.google.com/rss/search?q=india+news+politics+economy&hl=en-IN&gl=IN&ceid=IN:en', parser: 'rss', pools: ['INDIA_NATIONAL_BASE'] },
  { id: 'mint_politics', name: 'Livemint Politics', type: 'rss', url: 'https://www.livemint.com/rss/politics', parser: 'rss', pools: ['INDIA_NATIONAL_BASE'] },

  // ═══ INDIA_REGION — add more state feeds ═══
  { id: 'ie_maharashtra', name: 'Indian Express (Maharashtra)', type: 'rss', url: 'https://indianexpress.com/section/cities/pune/feed/', parser: 'rss', pools: ['INDIA_REGION', 'INDIA_CITIES'] },
  { id: 'ie_west_bengal', name: 'Indian Express (West Bengal)', type: 'rss', url: 'https://indianexpress.com/section/cities/kolkata/feed/', parser: 'rss', pools: ['INDIA_REGION', 'INDIA_CITIES'] },
];

// ── Helpers ─────────────────────────────────────────────
async function readYaml(f) { return (await import('js-yaml')).default.load(await fs.readFile(f, 'utf8')); }
async function writeYaml(f, obj) {
  const yaml = (await import('js-yaml')).default;
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, yaml.dump(obj, { noRefs: true, lineWidth: 120 }), 'utf8');
}

async function main() {
  const file = path.join(defaultDir, 'sources.yml');
  const doc = await readYaml(file);
  const existing = doc.sources || [];

  let added = 0, skipped = 0;
  for (const src of additions) {
    if (src.is_active === undefined) src.is_active = true;
    const idx = existing.findIndex(s => s.id === src.id);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...src, pools: src.pools };
      skipped++;
    } else {
      existing.push(src);
      added++;
    }
  }

  doc.sources = existing;
  await writeYaml(file, doc);

  // Print pool summary
  const poolCounts = {};
  for (const s of existing) {
    for (const p of s.pools) { poolCounts[p] = (poolCounts[p] || 0) + 1; }
  }

  console.log(`Added ${added} new sources, ${skipped} existing updated`);
  console.log(`Total sources: ${existing.length}`);
  console.log('\nPool distribution:');
  for (const [p, c] of Object.entries(poolCounts).sort()) {
    const flag = c < 3 ? ' ⚠' : '';
    console.log(`  ${p}: ${c}${flag}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
