# News Search And Config Sync Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `news.fetch` resilient for breaking-news discovery and ensure VPS user config stays aligned with repo defaults.

**Architecture:** Fix query caching so cache keys and dependencies match the actual fetch inputs, not just the source URL. Add a discovery-oriented request mode that can broaden source selection and loosen keyword dependence, then add a small config sync helper so the runtime user config can be refreshed from the tracked defaults when needed.

**Tech Stack:** TypeScript, Zod, YAML, Node.js, existing `news.fetch` / config loader / HTTP cache utilities.

---

### Task 1: Add regression coverage for cache-key and URL-rewrite behavior

**Files:**
- Create: `scripts/test_news_cache_behavior.ts`
- Modify: `package.json` (if needed to add a runnable test script)

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import { buildQueryKeyForNews, resolveNewsCacheDependencyUrl } from '../src/tools/news.js';

assert.notEqual(
  buildQueryKeyForNews({ pools: ['GLOBAL_BREAKING'], keywords: ['a'] }),
  buildQueryKeyForNews({ pools: ['GLOBAL_BREAKING'], keywords: ['a'], excludeKeywords: ['b'] })
);

assert.equal(
  resolveNewsCacheDependencyUrl('https://news.google.com/rss/search?q=site%3Areuters.com', {
    start: '2026-04-01',
    end: '2026-04-02',
    keywords: ['assassination']
  }),
  'https://news.google.com/rss/search?q=site%3Areuters.com+after%3A2026-04-01+before%3A2026-04-02+assassination'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test_news_cache_behavior.ts`
Expected: FAIL because the exported helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildQueryKeyForNews(/* args */) { /* include all request-shaping inputs */ }
export function resolveNewsCacheDependencyUrl(sourceUrl: string, opts: { start?: string; end?: string; keywords?: string[] }) {
  return rewriteGnUrl(sourceUrl, opts);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test_news_cache_behavior.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/test_news_cache_behavior.ts src/tools/news.ts package.json
git commit -m "test: cover news cache key and rewrite behavior"
```

### Task 2: Fix cache dependencies and add discovery mode to `news.fetch`

**Files:**
- Modify: `src/tools/news.ts`
- Modify: `src/config/schemas.ts` (if request schema needs new fields)

- [ ] **Step 1: Write the failing test**

Extend `scripts/test_news_cache_behavior.ts` with an assertion that `buildQueryKeyForNews()` changes when `countries`, `cities`, `cacheMode`, `fallbackToRealtime`, or `discoveryMode` change.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test_news_cache_behavior.ts`
Expected: FAIL until the key includes the new fields.

- [ ] **Step 3: Write minimal implementation**

```ts
const key = buildQueryKeyForNews({
  pools: args.pools,
  sources: args.sources,
  countries: args.countries,
  cities: args.cities,
  domains: args.domains,
  start: args.start,
  end: args.end,
  limit: args.limit,
  keywords: args.keywords,
  excludeKeywords: args.excludeKeywords,
  matchAll: args.matchAll,
  cacheMode: args.cacheMode,
  includeRaw: args.includeRaw,
  enrichArticles: args.enrichArticles,
  fallbackToRealtime: args.fallbackToRealtime,
  realtimeLimit: args.realtimeLimit,
  realtimeTopic: args.realtimeTopic,
  discoveryMode: args.discoveryMode,
});
```

Add `discoveryMode` to `FetchInput` and make it relax keyword filtering / broaden matching when enabled.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test_news_cache_behavior.ts`
Expected: PASS.

### Task 3: Make query cache TTL adaptive for breaking news

**Files:**
- Modify: `src/tools/news.ts`
- Modify: `src/config/schemas.ts` if a new cache setting is introduced

- [ ] **Step 1: Write the failing test**

Add a test that uses a short TTL when `discoveryMode` is enabled or when a request is clearly breaking-news oriented.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test_news_cache_behavior.ts`
Expected: FAIL until TTL selection is implemented.

- [ ] **Step 3: Write minimal implementation**

```ts
const queryTtlMs = args.discoveryMode ? Math.min(settings.cache.queryTtlMs, 60_000) : settings.cache.queryTtlMs;
const qcache = new QueryCache(cacheDir, queryTtlMs);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test_news_cache_behavior.ts`
Expected: PASS.

### Task 4: Add a config sync helper for the VPS runtime config

**Files:**
- Create: `scripts/sync_user_config.ts`
- Modify: `package.json`
- Optional: `README.md` / `INSTALL.md`

- [ ] **Step 1: Write the failing test**

Use the helper in dry-run mode to verify it reports missing `settings.yml` / `sources.yml` when the user config is stale.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/sync_user_config.ts --dry-run`
Expected: the helper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement a small script that copies tracked `config/*.yml` into the resolved user config directory, with a `--dry-run` flag and a `--replace` flag for explicit refreshes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/sync_user_config.ts --dry-run`
Expected: prints the files that would be synced.

### Task 5: Verify build and type safety

**Files:**
- Modify: any files required by the checks above

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit the finished upgrade**

```bash
git add src/config/loader.ts src/tools/news.ts src/types/news.ts scripts/sync_user_config.ts scripts/test_news_cache_behavior.ts scripts/test_config_loader_merge.ts package.json docs/superpowers/plans/2026-04-28-news-search-and-config-sync-upgrade.md
git commit -m "fix: improve news discovery and config sync"
```
