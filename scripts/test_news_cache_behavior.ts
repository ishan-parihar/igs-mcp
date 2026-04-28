import assert from 'node:assert/strict';
import { buildQueryKeyForNews, resolveNewsCacheDependencyUrl, resolveNewsQueryTtlMs } from '../src/tools/news.js';

const baseKey = buildQueryKeyForNews({
  pools: ['GLOBAL_BREAKING'],
  sources: ['reuters'],
  start: '2026-04-25',
  end: '2026-04-26',
  limit: 50,
  keywords: ['assassination'],
  matchAll: false,
});

assert.notEqual(
  baseKey,
  buildQueryKeyForNews({
    pools: ['GLOBAL_BREAKING'],
    sources: ['reuters'],
    start: '2026-04-25',
    end: '2026-04-26',
    limit: 50,
    keywords: ['assassination'],
    excludeKeywords: ['white house'],
    matchAll: false,
  }),
  'excludeKeywords must affect the cache key'
);

assert.notEqual(
  baseKey,
  buildQueryKeyForNews({
    pools: ['GLOBAL_BREAKING'],
    sources: ['reuters'],
    start: '2026-04-25',
    end: '2026-04-26',
    limit: 50,
    keywords: ['assassination'],
    matchAll: false,
    discoveryMode: true,
  }),
  'discoveryMode must affect the cache key'
);

assert.equal(
  resolveNewsCacheDependencyUrl('https://news.google.com/rss/search?q=site%3Areuters.com', {
    start: '2026-04-25',
    end: '2026-04-26',
    keywords: ['assassination'],
  }),
  'https://news.google.com/rss/search?q=site%3Areuters.com+after%3A2026-04-25+before%3A2026-04-26+assassination'
);

assert.equal(
  resolveNewsQueryTtlMs(600000, { discoveryMode: true }),
  60000,
  'discovery mode should clamp query TTL to 60s'
);

console.log('news cache behavior checks passed');
