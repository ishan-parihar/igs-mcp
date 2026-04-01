# IGS Architectural Upgrade Plan — April 2, 2026

## Context

IGS currently cannot answer historical date queries (e.g., "fetch news from 2020" or "what happened in July 2025"), and lacks Reddit and research paper sources. Testing revealed:

- **Google News RSS supports `after:YYYY-MM-DD before:YYYY-MM-DD` URL params** — but the current code fetches static feeds and post-filters, which always returns 0 for past dates.
- **Reddit Atom feeds work** with a User-Agent header — `https://www.reddit.com/r/{sub}/.rss` returns structured entries with title, link, author, pubDate, content.
- **arXiv RSS works** — `https://rss.arxiv.org/rss/{category}` returns structured paper entries.
- **`enrichArticles` is a no-op** — GN proxy items already have `raw.content`; the function only processes GN links but doesn't enrich non-GN items at all.
- **Sources are fetched sequentially** — a `for` loop calls `parseBySource` one at a time instead of using the existing PQueue.

## Phase 1: Fix Core Fetching (Critical)

### 1A. Google News Date/Keyword URL Injection

**New file: `src/utils/gn-url.ts`**

```typescript
/**
 * Rewrites a Google News RSS URL to inject date range and/or keyword params.
 *
 * GN search URLs have format:
 *   https://news.google.com/rss/search?q=<existing_query>&hl=...&gl=...&ceid=...
 *
 * We inject into the q param:
 *   - after:YYYY-MM-DD  (from start date)
 *   - before:YYYY-MM-DD (from end date)
 *   - keyword terms (appended to existing query)
 *
 * Non-GN URLs pass through unchanged.
 */
export function rewriteGnUrl(
  sourceUrl: string,
  opts: { start?: string; end?: string; keywords?: string[] }
): string { ... }
```

**Rules:**
- Only applies to URLs containing `news.google.com/rss/search`
- Parses existing `q` param, appends `after:YYYY-MM-DD` and/or `before:YYYY-MM-DD`
- Appends keyword terms to query if provided
- Leaves all other URL params (hl, gl, ceid) unchanged
- Non-GN sources: returns URL unchanged (date filtering happens post-fetch)

**Integration point in `news.ts`:**
- Call `rewriteGnUrl(src.url, { start, end, keywords })` before `parseBySource`
- Pass the rewritten URL to `http.fetch()` instead of `src.url`

### 1B. Parallel Source Fetching

Replace the sequential `for` loop with `Promise.allSettled` using a concurrency-limited approach:

```typescript
import PQueue from 'p-queue';

const queue = new PQueue({ concurrency: settings.http.concurrency }); // default 6
const all: NewsItem[] = [];

const fetchPromises = sources.map(src =>
  queue.add(async () => {
    const url = rewriteGnUrl(src.url, { start: args.start, end: args.end, keywords: args.keywords });
    const items = await parseBySource(src, http, url, args.cacheMode);
    for (const it of items) all.push(it);
  })
);

await Promise.allSettled(fetchPromises);
```

**Changes:**
- `parseBySource` takes an optional `url` param (defaults to `source.url`)
- Use the existing `settings.http.concurrency` (default 6) for parallelism
- Track per-source success/failure for `meta.sourcesSucceeded` / `meta.sourcesFailed`

### 1C. Fix `enrichArticles`

The function currently only processes GN proxy links. Fix: also enrich items that lack `content_snippet` or have snippets shorter than 100 chars, regardless of link domain.

```typescript
async function enrichArticlesFromLinks(items: NewsItem[]): Promise<NewsItem[]> {
  const toEnrich = items.filter(it =>
    it.link.includes('news.google.com') ||  // GN proxy links
    (!it.content_snippet || it.content_snippet.length < 100)  // items lacking content
  );
  // ... fetch with undici, extractArticleContent, update content_snippet
}
```

### 1D. Track Source Success/Failure

```typescript
let sourcesSucceeded = 0;
let sourcesFailed = 0;

// Inside fetch loop:
try {
  const items = await parseBySource(src, http, url, args.cacheMode);
  sourcesSucceeded++;
  for (const it of items) all.push(it);
} catch {
  sourcesFailed++;
}
```

Update `meta.sourcesSucceeded` and `meta.sourcesFailed` in output.

---

## Phase 2: Reddit Sources

### 2A. Source Type Extension

Add `sourceCategory` to distinguish source "flavors":

```typescript
// types/news.ts
export type Source = {
  // ... existing fields
  sourceCategory?: 'news' | 'community' | 'research';
};

// config/schemas.ts
export const SourceSchema = z.object({
  // ... existing fields
  sourceCategory: z.enum(['news', 'community', 'research']).optional().default('news'),
});
```

### 2B. Reddit Content Parser

**New file: `src/parsers/reddit.ts`**

Reddit Atom feeds use `<content type="html">` with embedded HTML. The parser:
1. Extracts the external link from `[link]` anchor (if present)
2. Extracts the actual article link from `<a href="...">` in the content (the Reddit post URL vs the external URL)
3. Uses the Reddit post link as the `link` field (for dedup)
4. Extracts media thumbnail via `<media:thumbnail>` → `media_url`
5. Strips HTML from content for `content_snippet`

```typescript
export function parseRedditAtom(source: Source, xmlBody: string): Promise<NewsItem[]> {
  // Atom format, uses <entry> instead of <item>
  // Uses cheerio to parse the Atom XML
  // Maps: title, link[@href], published, content, media:thumbnail
}
```

### 2C. Reddit Sources in `sources.yml`

~25 subreddits across domains:

```yaml
# Reddit — Community Intelligence
- id: reddit_worldnews
  name: "Reddit r/worldnews"
  type: rss
  url: https://www.reddit.com/r/worldnews/.rss
  parser: rss  # Atom feeds parse via rss-parser
  headers:
    User-Agent: "Mozilla/5.0 (compatible; IGS/1.0)"
  pools: [REDDIT]
  countries: [ALL]
  domains: [geopolitics, community]
  sourceCategory: community
  is_active: true

- id: reddit_science
  name: "Reddit r/science"
  type: rss
  url: https://www.reddit.com/r/science/.rss
  parser: rss
  headers:
    User-Agent: "Mozilla/5.0 (compatible; IGS/1.0)"
  pools: [REDDIT]
  countries: [ALL]
  domains: [science, community]
  sourceCategory: community
  is_active: true

# ... and ~23 more:
# r/technology, r/finance, r/economics, r/politics, r/india,
# r/geopolitics, r/cybersecurity, r/environment, r/health,
# r/energy, r/AI, r/MachineLearning, r/space, r/climate,
# r/investing, r/wallstreetbets, r/AskHistorians, r/TrueReddit,
# r/baduk, r/LessCredibleDefence, r/anime_titties (worldnews alt),
# r/CredibleDefense, r/NeutralPolitics, r/Futurology
```

### 2D. Reddit Pool

```yaml
# pools.yml
- id: REDDIT
  name: Reddit Community Intelligence
  description: Reddit subreddits for community-sourced intelligence
  is_active: true
```

### 2E. RSS Parser Compatibility

The existing `rss-parser` library handles Atom feeds natively, so `parser: rss` works for Reddit feeds. No custom parser needed for basic extraction. However, Reddit content includes HTML tables with image/link/comment links — the `rss.ts` parser's `stripHtml` + 600-char truncation handles this.

The custom `reddit.ts` parser is optional enhancement for extracting the external article URL from Reddit content HTML.

---

## Phase 3: Research Paper Sources

### 3A. arXiv Sources in `sources.yml`

~15 arXiv categories:

```yaml
# Research Papers — arXiv
- id: arxiv_cs_ai
  name: "arXiv — Artificial Intelligence"
  type: rss
  url: https://rss.arxiv.org/rss/cs.AI
  parser: rss
  pools: [RESEARCH_PAPERS]
  countries: [ALL]
  domains: [research, tech, science]
  sourceCategory: research
  is_active: true

- id: arxiv_cs_cl
  name: "arXiv — Computation and Language (NLP)"
  type: rss
  url: https://rss.arxiv.org/rss/cs.CL
  parser: rss
  pools: [RESEARCH_PAPERS]
  countries: [ALL]
  domains: [research, tech, science]
  sourceCategory: research
  is_active: true

# ... and ~13 more:
# cs.CV (Computer Vision), cs.LG (Machine Learning),
# cs.CR (Cryptography/Security), cs.CY (Computers and Society),
# cs.DB (Databases), cs.DC (Distributed Computing),
# stat.ML (Stats/ML), econ.EM (Econometrics),
# physics.soc-ph (Physics/Social), q-bio (Quantitative Biology),
# math.OC (Optimization), eess.SY (Systems/Control),
# cs.SE (Software Engineering)
```

### 3B. Semantic Scholar Sources

Semantic Scholar provides a free API for research paper search:

```yaml
- id: semantic_scholar_ai
  name: "Semantic Scholar — AI Papers"
  type: http
  url: https://api.semanticscholar.org/graph/v1/paper/search?query=artificial+intelligence&limit=20&fields=title,url,abstract,year,authors,publicationDate&sort=publicationDate:desc
  parser: semantic_scholar
  pools: [RESEARCH_PAPERS]
  countries: [ALL]
  domains: [research, tech, science]
  sourceCategory: research
  is_active: true

# ... more queries:
# semantic_scholar_ml, semantic_scholar_nlp, semantic_scholar_cv,
# semantic_scholar_cyber, semantic_scholar_energy,
# semantic_scholar_climate, semantic_scholar_health,
# semantic_scholar_economics
```

### 3C. Semantic Scholar Parser

**New file: `src/parsers/semantic_scholar.ts`**

```typescript
export function parseSemanticScholarJson(source: Source, body: string): NewsItem[] {
  const data = JSON.parse(body);
  return (data.data || []).map(paper => ({
    id: paper.paperId,
    title: paper.title,
    link: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
    pubDate: paper.publicationDate || `${paper.year}-01-01`,
    source_name: source.name,
    pool_id: source.pools[0] || '',
    content_snippet: (paper.abstract || '').slice(0, 600),
    author: (paper.authors || []).map(a => a.name).join(', '),
  }));
}
```

### 3D. Research Papers Pool

```yaml
# pools.yml
- id: RESEARCH_PAPERS
  name: Research Papers
  description: arXiv, Semantic Scholar, and academic paper sources
  is_active: true
```

### 3E. Parser Registration

Add `semantic_scholar` case to `parseBySource` dispatch chain in `news.ts`:

```typescript
} else if (source.parser === 'semantic_scholar') {
  items = parseSemanticScholarJson(source, res.response.bodyText);
}
```

---

## Phase 4: Bug Fixes & Polish

### 4A. Cache Key Includes Keywords

Current `buildQueryKey` ignores `keywords` and `domains`:
```typescript
// BEFORE:
function buildQueryKey(kind, pools, sources, start, end, limit)

// AFTER:
function buildQueryKey(kind, pools, sources, start, end, limit, keywords, domains, matchAll)
```

### 4B. Source Count in Output Meta

Add `totalSourcesAvailable` to meta for visibility:

```typescript
meta: {
  sourcesQueried: sources.length,
  sourcesSucceeded,
  sourcesFailed,
  totalSourcesAvailable: sf.sources.filter(s => s.is_active !== false).length,
  // ...
}
```

### 4C. Copy Updated Config to User Dir

After modifying `sources.yml` and `pools.yml` in the repo, manually copy:
```bash
cp config/sources.yml ~/.config/igs-mcp/sources.yml
cp config/pools.yml ~/.config/igs-mcp/pools.yml
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/utils/gn-url.ts` | Google News URL rewriting with date/keyword injection |
| `src/parsers/reddit.ts` | Reddit Atom content parser (extracts external links) |
| `src/parsers/semantic_scholar.ts` | Semantic Scholar JSON → NewsItem[] parser |

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/news.ts` | Add `sourceCategory` field to Source type |
| `src/config/schemas.ts` | Add `sourceCategory` to SourceSchema |
| `src/tools/news.ts` | GN URL rewriting, parallel fetch, enrichArticles fix, source success tracking, semantic_scholar parser dispatch, buildQueryKey fix |
| `src/server.ts` | Register new parsers if needed |
| `config/sources.yml` | Add ~40 new sources (25 Reddit, 15 arXiv, 8 Semantic Scholar) |
| `config/pools.yml` | Add REDDIT and RESEARCH_PAPERS pools |

## Testing Plan

After implementation, test:

1. `news.fetch(start='2020-03-01', end='2020-03-31', keywords=['coronavirus'])` — must return 2020 articles
2. `news.fetch(domains=['community'])` — must return Reddit posts
3. `news.fetch(domains=['research'])` — must return arXiv/Semantic Scholar papers
4. `news.fetch(domains=['research', 'tech'], keywords=['large language model'])` — research + tech filtered
5. `news.fetch(pools=['REDDIT'])` — pool-scoped Reddit fetch
6. `news.fetch(pools=['RESEARCH_PAPERS'])` — pool-scoped research fetch
7. `news.fetch(start='2025-07-01', end='2025-07-31')` — recent historical month
8. `news.fetch(enrichArticles=true, limit=5)` — verify enrichment adds content
9. `news.fetch(domains=['finance'], countries=['us'])` — combined filters
10. Verify `meta.sourcesSucceeded` and `meta.sourcesFailed` are non-zero

## Estimated Scope

- ~3 new files (utils, 2 parsers)
- ~6 modified files
- ~40 new source entries in YAML
- ~2 new pool entries
- ~300 lines of new TypeScript
- ~100 lines of modified TypeScript
