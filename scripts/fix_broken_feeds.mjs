import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDir = path.resolve(__dirname, '..', 'config');

async function readYaml(f) { return (await import('js-yaml')).default.load(await fs.readFile(f, 'utf8')); }
async function writeYaml(f, obj) {
  const yaml = (await import('js-yaml')).default;
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, yaml.dump(obj, { noRefs: true, lineWidth: 120 }), 'utf8');
}

// Fixes for broken sources
const FIXES = [
  { id: 'rand', url: 'https://news.google.com/rss/search?q=site:rand.org+defense+security+geopolitics&hl=en-US&gl=US&ceid=US:en', parser: 'rss', note: 'replaced broken direct RSS with Google News site search' },
  { id: 'brookings', url: 'https://news.google.com/rss/search?q=site:brookings.edu+international+geopolitics&hl=en-US&gl=US&ceid=US:en', parser: 'rss', note: 'replaced broken direct RSS with Google News site search' },
  { id: 'the_wire', url: 'https://news.google.com/rss/search?q=site:thewire.in&hl=en-IN&gl=IN&ceid=IN:en', parser: 'rss', note: 'replaced broken RSS with Google News site search' },
  { id: 'moneycontrol', url: 'https://news.google.com/rss/search?q=site:moneycontrol.com+markets+business&hl=en-IN&gl=IN&ceid=IN:en', parser: 'rss', note: 'replaced broken RSS with Google News site search' },
  { id: 'ie_south', url: 'https://news.google.com/rss/search?q=site:indianexpress.com+south+india&hl=en-IN&gl=IN&ceid=IN:en', parser: 'rss', note: 'replaced broken section RSS with Google News site search' },
  { id: 'scroll_in', url: 'https://news.google.com/rss/search?q=site:scroll.in&hl=en-IN&gl=IN&ceid=IN:en', parser: 'rss', note: 'replaced broken feedburner with Google News site search' },
];

async function main() {
  const file = path.join(defaultDir, 'sources.yml');
  const doc = await readYaml(file);
  const sources = doc.sources || [];
  let fixed = 0;

  for (const fix of FIXES) {
    const idx = sources.findIndex(s => s.id === fix.id);
    if (idx >= 0) {
      sources[idx].url = fix.url;
      sources[idx].parser = fix.parser || sources[idx].parser;
      // Remove parserConfig if switching to RSS
      if (fix.parser === 'rss' && sources[idx].parserConfig) delete sources[idx].parserConfig;
      console.log(`✓ Fixed ${fix.id}: ${fix.note}`);
      fixed++;
    }
  }

  doc.sources = sources;
  await writeYaml(file, doc);
  console.log(`\nFixed ${fixed} sources. Total: ${sources.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
