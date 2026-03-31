import { loadSources, saveSources } from '../dist/config/loader.js';

const additions = [
  // Site homepages (auto-discover RSS via HTML rel=alternate)
  { id: 'scroll_in', name: 'Scroll.in', type: 'http', url: 'https://scroll.in/', pools: ['POOL_A_MACRO'], is_active: true },
  { id: 'axios', name: 'Axios', type: 'http', url: 'https://www.axios.com/', pools: ['POOL_A_MACRO'], is_active: true },
  { id: 'semafor', name: 'Semafor', type: 'http', url: 'https://www.semafor.com/', pools: ['POOL_A_MACRO'], is_active: true },
  { id: 'orfonline', name: 'ORF Online', type: 'http', url: 'https://www.orfonline.org/', pools: ['POOL_B_STRATEGY'], is_active: true },

  // Haaretz RSS feeds
  { id: 'haaretz_latest', name: 'Haaretz: Latest Headlines', type: 'rss', url: 'https://www.haaretz.com/srv/haaretz-latest-headlines', parser: 'rss', pools: ['POOL_A_MACRO'], is_active: true },
  { id: 'haaretz_world', name: 'Haaretz: World News', type: 'rss', url: 'https://www.haaretz.com/srv/world-news-rss', parser: 'rss', pools: ['POOL_A_MACRO'], is_active: true },
  { id: 'haaretz_opinion', name: 'Haaretz: Opinion', type: 'rss', url: 'https://www.haaretz.com/srv/opinion-rss', parser: 'rss', pools: ['POOL_D_CULTURE'], is_active: true },
  { id: 'haaretz_life_culture', name: 'Haaretz: Life & Culture', type: 'rss', url: 'https://www.haaretz.com/srv/life-&-culture-rss', parser: 'rss', pools: ['POOL_D_CULTURE'], is_active: true },
];

function upsert(arr, src) {
  const i = arr.findIndex(s => s.id === src.id);
  if (i >= 0) arr[i] = { ...arr[i], ...src };
  else arr.push(src);
}

async function run() {
  const sf = await loadSources();
  for (const s of additions) upsert(sf.sources, s);
  await saveSources(sf);
  console.log(`Added/updated ${additions.length} sources in user config`);
}

run().catch(e => { console.error(e); process.exit(1); });
