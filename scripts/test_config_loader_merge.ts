import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'igs-config-'));
await fs.writeFile(
  path.join(tmpDir, 'sources.yml'),
  `sources:\n  - id: reuters\n    name: Reuters (via Google News)\n    type: rss\n    url: https://news.google.com/rss/search?q=site%3Areuters.com&hl=en-US&gl=US&ceid=US%3Aen\n    parser: rss\n    pools: [GLOBAL_BREAKING]\n    countries: [ALL]\n    domains: [breaking, geopolitics, business, finance]\n    is_active: true\n`,
  'utf8'
);

process.env.IGS_CONFIG_DIR = tmpDir;

const { loadSources } = await import('../src/config/loader.js');

const loaded = await loadSources();

assert(loaded.sources.length > 1, 'default sources should be merged into stale user config');
assert(loaded.sources.some(s => s.id === 'bbc_world'), 'merged config should include default sources like BBC World News');

console.log('config loader merge checks passed');
