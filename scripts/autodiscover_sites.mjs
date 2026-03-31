import { loadSettings } from '../dist/config/loader.js';
import { HttpClient } from '../dist/http/client.js';
import { autodiscoverList } from '../dist/parsers/generic_html.js';

const sites = [
  { id: 'scroll_in', name: 'Scroll.in', url: 'https://scroll.in/' },
  { id: 'axios', name: 'Axios', url: 'https://www.axios.com/' },
  { id: 'semafor', name: 'Semafor', url: 'https://www.semafor.com/' },
  { id: 'orfonline', name: 'ORF Online', url: 'https://www.orfonline.org/' },
];

async function run() {
  const settings = await loadSettings();
  const http = new HttpClient(settings.http, settings.cache.dir);
  for (const s of sites) {
    const res = await autodiscoverList({ id: s.id, name: s.name, type: 'http', url: s.url, pools: [], is_active: true }, http);
    console.log(`Site ${s.name} -> kind=${res.kind} url=${res.url || ''}`);
    if (res.selectors) console.log(`  selectors: ${JSON.stringify(res.selectors)}`);
    if (res.sample?.length) console.log(`  sample: ${res.sample.slice(0, 3).map(x => x.title).join(' | ')}`);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
