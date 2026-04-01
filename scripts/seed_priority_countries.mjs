import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfgDir = path.resolve(__dirname, '..', 'config');

async function readYaml(f) { return (await import('js-yaml')).default.load(await fs.readFile(f, 'utf8')); }
async function writeYaml(f, obj) { const y=(await import('js-yaml')).default; await fs.writeFile(f, y.dump(obj, { noRefs:true, lineWidth:120 }), 'utf8'); }

const curated = [
  // United States
  { id: 'guardian_us', name: 'Guardian (US News)', url: 'https://www.theguardian.com/us-news/rss' },
  { id: 'npr_top', name: 'NPR Top News', url: 'https://feeds.npr.org/1001/rss.xml' },

  // United Kingdom
  { id: 'bbc_uk', name: 'BBC UK', url: 'https://feeds.bbci.co.uk/news/uk/rss.xml' },
  { id: 'guardian_uk', name: 'Guardian (UK)', url: 'https://www.theguardian.com/uk-news/rss' },

  // France
  { id: 'france24_fr', name: 'France24 (France)', url: 'https://www.france24.com/en/tag/france/rss' },

  // Germany / Europe
  { id: 'bbc_europe', name: 'BBC Europe', url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml' },
  { id: 'politico_europe', name: 'Politico Europe', url: 'https://www.politico.eu/feed/' },

  // Japan
  { id: 'guardian_japan', name: 'Guardian (Japan)', url: 'https://www.theguardian.com/world/japan/rss' },

  // Australia
  { id: 'abc_au_top', name: 'ABC Australia (Top Stories)', url: 'https://www.abc.net.au/news/feed/51120/rss.xml' },

  // Canada
  { id: 'guardian_canada', name: 'Guardian (Canada)', url: 'https://www.theguardian.com/world/canada/rss' },

  // China
  { id: 'guardian_china', name: 'Guardian (China)', url: 'https://www.theguardian.com/world/china/rss' },

  // Russia
  { id: 'moscow_times', name: 'The Moscow Times (News)', url: 'https://www.themoscowtimes.com/rss/news' },

  // Africa
  { id: 'bbc_africa', name: 'BBC Africa', url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml' },

  // Middle East
  { id: 'france24_me', name: 'France24 (Middle East)', url: 'https://www.france24.com/en/middle-east/rss' },
];

async function main() {
  const sourcesFile = path.join(cfgDir, 'sources.yml');
  const doc = await readYaml(sourcesFile);
  const existing = doc.sources || [];
  let added = 0, updated = 0;
  for (const c of curated) {
    const src = {
      id: c.id,
      name: c.name,
      type: 'rss',
      url: c.url,
      parser: 'rss',
      pools: ['GLOBAL_COUNTRIES'],
      is_active: true,
    };
    const idx = existing.findIndex(s => s.id === c.id);
    if (idx >= 0) { existing[idx] = { ...existing[idx], ...src }; updated++; } else { existing.push(src); added++; }
  }
  doc.sources = existing;
  await writeYaml(sourcesFile, doc);
  console.log(`Priority countries: added ${added}, updated ${updated}. Total: ${existing.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
