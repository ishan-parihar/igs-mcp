import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfgDir = path.resolve(__dirname, '..', 'config');

async function readYaml(f) { return (await import('js-yaml')).default.load(await fs.readFile(f, 'utf8')); }
async function writeYaml(f, obj) { const y=(await import('js-yaml')).default; await fs.writeFile(f, y.dump(obj, { noRefs:true, lineWidth:120 }), 'utf8'); }

function guardianCountrySource(slug, code, name) {
  return {
    id: `guardian_${slug}`,
    name: `Guardian (${name})`,
    type: 'rss',
    url: `https://www.theguardian.com/world/${slug}/rss`,
    parser: 'rss',
    pools: ['GLOBAL_COUNTRIES'],
    is_active: true,
  };
}

function france24CountrySource(slug, code, name) {
  return {
    id: `france24_${slug}`,
    name: `France24 (${name})`,
    type: 'rss',
    url: `https://www.france24.com/en/tag/${slug}/rss`,
    parser: 'rss',
    pools: ['GLOBAL_COUNTRIES'],
    is_active: true,
  };
}

async function main() {
  const countries = await readYaml(path.join(cfgDir, 'countries.yml'));
  const sourcesFile = path.join(cfgDir, 'sources.yml');
  const doc = await readYaml(sourcesFile);
  const existing = doc.sources || [];

  let added = 0, updated = 0;

  for (const c of countries.countries) {
    if (c.guardian_slug) {
      const s = guardianCountrySource(c.guardian_slug, c.code, c.name);
      const idx = existing.findIndex(x => x.id === s.id);
      if (idx >= 0) { existing[idx] = { ...existing[idx], ...s }; updated++; } else { existing.push(s); added++; }
    }
    if (c.france24_slug) {
      const s = france24CountrySource(c.france24_slug, c.code, c.name);
      const idx = existing.findIndex(x => x.id === s.id);
      if (idx >= 0) { existing[idx] = { ...existing[idx], ...s }; updated++; } else { existing.push(s); added++; }
    }
  }

  doc.sources = existing;
  await writeYaml(sourcesFile, doc);
  console.log(`Added ${added}, updated ${updated}. Total sources: ${existing.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
