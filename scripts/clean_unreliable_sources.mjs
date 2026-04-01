import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfgDir = path.resolve(__dirname, '..', 'config');

async function readYaml(f) { return (await import('js-yaml')).default.load(await fs.readFile(f, 'utf8')); }
async function writeYaml(f, obj) { const y=(await import('js-yaml')).default; await fs.writeFile(f, y.dump(obj, { noRefs:true, lineWidth:120 }), 'utf8'); }

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function testRss(src, http){
  const { parseRss } = await import('../dist/parsers/rss.js');
  let attempts = 0;
  while (attempts < 2){
    attempts++;
    try{
      const res = await http.fetch(src.url, src.headers || {}, 'bypass');
      if (!('response' in res)) continue;
      const items = await parseRss(src, res.response.bodyText, true);
      if (items && items.length > 0) return true;
    }catch(e){ /* ignore and retry */ }
    await sleep(300);
  }
  return false;
}

async function run(){
  const { loadSettings, getUserConfigDir } = await import('../dist/config/loader.js');
  const { HttpClient } = await import('../dist/http/client.js');
  const settings = await loadSettings();
  const baseCfg = getUserConfigDir();
  const cacheDir = path.isAbsolute(settings.cache.dir) ? settings.cache.dir : path.join(baseCfg, settings.cache.dir);
  const http = new HttpClient(settings.http, cacheDir);

  const sourcesFile = path.join(cfgDir, 'sources.yml');
  const doc = await readYaml(sourcesFile);
  const sources = doc.sources || [];

  const targetPools = new Set(['GLOBAL_COUNTRIES','GLOBAL_CITIES']);
  const candidates = sources.filter(s => s.pools?.some(p => targetPools.has(p)));
  const keep = new Set(sources.map(s => s.id));
  const removed = [];

  for (const src of candidates){
    // Only test RSS type; others not expected here
    if (src.type !== 'rss') continue;
    const ok = await testRss(src, http);
    if (!ok){
      keep.delete(src.id);
      removed.push(src);
      console.log(`Removing unreliable source: ${src.id} (${src.name})`);
    } else {
      console.log(`OK: ${src.id}`);
    }
  }

  const pruned = sources.filter(s => keep.has(s.id));
  await writeYaml(sourcesFile, { sources: pruned });
  console.log(`\nRemoved ${removed.length} unreliable sources. New total: ${pruned.length}`);
}

run().catch(e => { console.error(e); process.exit(1); });
