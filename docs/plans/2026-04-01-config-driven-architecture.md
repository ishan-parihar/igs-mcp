# Config-Driven Architecture Refactor

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate all hardcoded source→country/city/domain mappings from TypeScript. Make YAML config the single source of truth for source metadata, filtering, and resolution.

**Architecture:** Add `countries`, `cities`, `domains` metadata fields directly to each source entry in `sources.yml`. The TS resolver becomes a dumb filter on these fields. `countries.yml` becomes a pure reference lookup (name/code/continent). Delete all hardcoded maps from `news.ts`. Add `domains` as a first-class filter parameter to `news.fetch`.

**Tech Stack:** TypeScript, Zod (schema validation), js-yaml, MCP SDK

---

## Root Cause Analysis

Every bug found in the audit traces to the same pattern: **logic that belongs in config is hardcoded in TypeScript**.

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| US/UK country resolution generates wrong IDs (`guardian_us-news` vs `guardian_us`) | `countries.ts:17` generates IDs from slugs that don't match source IDs | Remove ID generation; sources declare their own countries |
| Australia/NZ Guardian sources missing | `countries.yml` has slugs but no corresponding source entries exist | Sources declare `countries: [AU]` directly; Guardian AU source added |
| `CITY_SOURCE_MAP` references phantom sources (`gn_tokyo`, `leparisien_paris`) | `news.ts:119-140` hardcoded map | Sources declare `cities: [Tokyo]` directly |
| `ie_maharashtra`/`ie_west_bengal` reuse city feed URLs | No validation that state feeds differ from city feeds | Unique URLs enforced by config, not code |
| `news.fetch` output schema mismatch | `meta` field has extra properties | Align schema |

**Principle:** Config files are the database. TypeScript is the query engine. Never put data in code.

---

## Data Model (After)

### sources.yml — each source gets optional metadata

```yaml
sources:
  - id: reuters
    name: Reuters (via Google News)
    type: rss
    url: https://news.google.com/rss/search?q=site%3Areuters.com&hl=en-US&gl=US&ceid=US%3Aen
    parser: rss
    pools: [GLOBAL_BREAKING]
    countries: [ALL]          # covers all countries
    domains: [geopolitics, business, finance, breaking]
    is_active: true

  - id: guardian_india
    name: Guardian (India)
    type: rss
    url: https://www.theguardian.com/world/india/rss
    parser: rss
    pools: [GLOBAL_COUNTRIES]
    countries: [IN]
    domains: [geopolitics, society, culture]
    is_active: true

  - id: techcrunch
    name: TechCrunch
    type: rss
    url: https://techcrunch.com/feed/
    parser: rss
    pools: [GLOBAL_TECH_CYBER]
    countries: [ALL]
    domains: [tech, business, startups]
    is_active: true

  - id: the_hindu_delhi
    name: The Hindu (Delhi)
    type: rss
    url: https://www.theguardian.com/news/cities/Delhi/feeder/default.rss
    parser: rss
    pools: [INDIA_CITIES]
    countries: [IN]
    cities: [Delhi]
    domains: [geopolitics, local]
    is_active: true
```

### countries.yml — pure reference, no source slugs

```yaml
countries:
  - code: IN
    name: India
    continent: Asia
    cities: [Delhi, Mumbai, Bengaluru, Chennai, Hyderabad, Kolkata]
  - code: US
    name: United States
    continent: North America
    cities: [New York, Washington DC, Los Angeles, San Francisco]
  - code: AU
    name: Australia
    continent: Oceania
    cities: [Sydney, Melbourne]
  # ... etc
```

### Resolver logic (in TS)

```typescript
// Filter by countries
function filterByCountries(sources: Source[], countryCodes: string[]): Source[] {
  return sources.filter(s =>
    s.countries?.includes('ALL') ||
    s.countries?.some(c => countryCodes.includes(c))
  );
}

// Filter by domains
function filterByDomains(sources: Source[], domains: string[]): Source[] {
  return sources.filter(s =>
    s.domains?.some(d => domains.includes(d))
  );
}

// Filter by cities
function filterByCities(sources: Source[], cities: string[]): Source[] {
  return sources.filter(s =>
    s.cities?.some(c => cities.map(x => x.toLowerCase()).includes(c.toLowerCase()))
  );
}
```

---

## Task 1: Extend Source Schema

**Files:**
- Modify: `src/config/schemas.ts:14-37`
- Modify: `src/types/news.ts:8-27`

**Step 1: Add metadata fields to SourceSchema**

In `src/config/schemas.ts`, add three optional fields to the Source zod schema (after `pools` on line 35):

```typescript
export const SourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['rss', 'http']),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  parser: z.string().optional(),
  parserConfig: z
    .object({
      listUrl: z.string().url().optional(),
      selectors: z
        .object({
          item: z.string().min(1),
          title: z.string().optional(),
          link: z.string().optional(),
          date: z.string().optional(),
          desc: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  pools: z.array(z.string()).default([]),
  countries: z.array(z.string()).optional().default([]),
  cities: z.array(z.string()).optional().default([]),
  domains: z.array(z.string()).optional().default([]),
  is_active: z.boolean().optional().default(true),
});
```

**Step 2: Update Source type**

In `src/types/news.ts`, add matching fields:

```typescript
export type Source = {
  id: string;
  name: string;
  type: 'rss' | 'http';
  url: string;
  headers?: Record<string, string>;
  parser?: string;
  parserConfig?: {
    listUrl?: string;
    selectors?: {
      item: string;
      title?: string;
      link?: string;
      date?: string;
      desc?: string;
    };
  };
  pools: string[];
  countries?: string[];
  cities?: string[];
  domains?: string[];
  is_active?: boolean;
};
```

**Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS (new fields are optional with defaults, no breakage)

**Step 4: Commit**

```bash
git add src/config/schemas.ts src/types/news.ts
git commit -m "feat: add countries/cities/domains metadata to source schema"
```

---

## Task 2: Rewrite Country/City Resolver (Delete Hardcoded Maps)

**Files:**
- Modify: `src/tools/news.ts:119-170`
- Modify: `src/tools/countries.ts`

**Step 1: Delete hardcoded maps from news.ts**

Remove entirely:
- `CITY_SOURCE_MAP` (lines 119-140)
- `COUNTRY_CURATED_MAP` (lines 142-155)
- `resolveCountrySources` function (lines 157-170)

**Step 2: Add config-driven filter functions**

Replace with:

```typescript
function resolveSourcesByFilter(
  sources: Source[],
  opts: { countries?: string[]; cities?: string[]; domains?: string[]; keywords?: string[] }
): Source[] {
  let result = sources;

  if (opts.countries?.length) {
    const codes = opts.countries.map(c => c.toUpperCase());
    const names = opts.countries.map(c => c.toLowerCase());
    result = result.filter(s => {
      const sc = (s.countries || []).map(x => x.toUpperCase());
      return sc.includes('ALL') || sc.some(c => codes.includes(c) || names.includes(c));
    });
  }

  if (opts.cities?.length) {
    const lc = opts.cities.map(c => c.toLowerCase());
    result = result.filter(s =>
      (s.cities || []).some(c => lc.includes(c.toLowerCase()))
    );
  }

  if (opts.domains?.length) {
    const ld = opts.domains.map(d => d.toLowerCase());
    result = result.filter(s =>
      (s.domains || []).some(d => ld.includes(d.toLowerCase()))
    );
  }

  return result;
}
```

**Step 3: Update the `news.fetch` handler**

In the `news.fetch` tool handler (~line 172), replace the country/city resolution block:

```typescript
// OLD (delete):
const countriesDoc = await loadCountries();
const mappedCountrySources = args.countries?.length ? resolveCountrySources(countriesDoc, args.countries) : [];
const mappedCitySources = args.cities?.length ? args.cities.flatMap((c: string) => CITY_SOURCE_MAP[c] || []) : [];

// NEW:
// Add 'domains' to FetchInput schema
// Then in the filter block:
if (args.sources?.length) {
  sources = sources.filter(s => args.sources!.includes(s.id));
} else {
  let filtered = sources;
  if (args.pools?.length) filtered = filtered.filter(s => s.pools.some(p => args.pools!.includes(p)));
  filtered = resolveSourcesByFilter(filtered, {
    countries: args.countries,
    cities: args.cities,
    domains: args.domains,
  });
  sources = filtered;
}
```

**Step 4: Add `domains` to FetchInput schema**

In `news.ts`, update the Zod input schema (line 18):

```typescript
const FetchInput = z.object({
  pools: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),   // NEW
  start: z.string().optional(),
  end: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  excludeKeywords: z.array(z.string()).optional(),
  matchAll: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(500).default(100),
  cacheMode: z.enum(['prefer','bypass','only']).default('prefer'),
  includeRaw: z.boolean().optional().default(false),
});
```

**Step 5: Remove `loadCountries` import from news.ts**

The `loadCountries` import at line 3 is no longer needed in news.ts (countries.ts still uses it).

**Step 6: Update countries.ts resolver**

Rewrite `sources.countries` tool to count matching sources from config:

```typescript
export async function registerCountryCityTools(srv: McpServer) {
  srv.registerTool('sources.countries', {
    description: 'List countries with available sources. Use with news.fetch countries param.',
    outputSchema: { countries: z.array(z.object({
      name: z.string(),
      code: z.string(),
      source_count: z.number(),
    })) }
  }, async () => {
    const cd = await loadCountries();
    const sf = await loadSources();
    const out = (cd.countries || []).map((c: any) => {
      const count = sf.sources.filter(s =>
        s.is_active !== false &&
        (s.countries || []).some((sc: string) =>
          sc.toUpperCase() === c.code?.toUpperCase()
        )
      ).length;
      return { name: c.name, code: c.code, source_count: count };
    });
    const structuredContent = { countries: out };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  });

  // cities tool — same pattern
  srv.registerTool('sources.cities', {
    description: 'List cities with available sources.',
    outputSchema: { cities: z.array(z.object({
      name: z.string(),
      source_count: z.number(),
    })) }
  }, async () => {
    const sf = await loadSources();
    const cityMap: Record<string, number> = {};
    for (const s of sf.sources) {
      if (s.is_active === false) continue;
      for (const c of (s.cities || [])) {
        cityMap[c] = (cityMap[c] || 0) + 1;
      }
    }
    const out = Object.entries(cityMap).map(([name, count]) => ({ name, source_count: count }));
    const structuredContent = { cities: out };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  });

  // NEW: domains tool
  srv.registerTool('sources.domains', {
    description: 'List available topic domains and source counts. Use with news.fetch domains param.',
    outputSchema: { domains: z.array(z.object({
      name: z.string(),
      source_count: z.number(),
    })) }
  }, async () => {
    const sf = await loadSources();
    const domainMap: Record<string, number> = {};
    for (const s of sf.sources) {
      if (s.is_active === false) continue;
      for (const d of (s.domains || [])) {
        domainMap[d] = (domainMap[d] || 0) + 1;
      }
    }
    const out = Object.entries(domainMap)
      .map(([name, count]) => ({ name, source_count: count }))
      .sort((a, b) => b.source_count - a.source_count);
    const structuredContent = { domains: out };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  });
}
```

**Step 7: Run typecheck**

```bash
npm run typecheck
```

**Step 8: Commit**

```bash
git add src/tools/news.ts src/tools/countries.ts
git commit -m "refactor: config-driven source filtering, delete hardcoded maps"
```

---

## Task 3: Simplify countries.yml

**Files:**
- Modify: `config/countries.yml`

**Step 1: Strip slug fields**

Remove `guardian_slug` and `france24_slug` from every country entry. Keep only: `code`, `name`, `continent`, `cities`.

Result:

```yaml
countries:
  - code: IN
    name: India
    continent: Asia
    cities: [Delhi, Mumbai, Bengaluru, Chennai, Hyderabad, Kolkata]
  - code: US
    name: United States
    continent: North America
    cities: [New York, Washington DC, Los Angeles, San Francisco]
  - code: AU
    name: Australia
    continent: Oceania
    cities: [Sydney, Melbourne]
  # ... etc for all 45 countries
```

**Step 2: Commit**

```bash
git add config/countries.yml
git commit -m "config: simplify countries.yml, remove source slug fields"
```

---

## Task 4: Tag All Sources with Metadata in sources.yml

**Files:**
- Modify: `config/sources.yml` — every source entry

**Step 1: Define domain vocabulary**

Standardized domain tags (lowercase, no spaces):

| Domain | Covers |
|--------|--------|
| `breaking` | Fast event detection, wire services |
| `geopolitics` | International relations, defense, diplomacy |
| `finance` | Markets, trading, central banks, M&A |
| `business` | Corporate strategy, industry, supply chain |
| `tech` | Technology, software, hardware, AI |
| `cyber` | Cybersecurity, CISA alerts, vulnerabilities |
| `science` | Academic research, space, biotech |
| `health` | Disease, WHO, public health |
| `environment` | Climate, biodiversity, energy transition |
| `energy` | Oil, gas, renewables, commodities |
| `law` | Courts, sanctions, regulation, treaties |
| `culture` | Society, ideology, media, arts |
| `india-domestic` | India-specific national reporting |
| `india-regional` | India state/city level |
| `factcheck` | Verification, misinformation |
| `finance-india` | India markets, RBI, SEBI |
| `local` | City-level news |

**Step 2: Tag each source**

Example transformations (apply to all ~180 sources):

```yaml
# Global breaking sources
- id: reuters
  # ... existing fields ...
  countries: [ALL]
  domains: [breaking, geopolitics, business, finance]

- id: bbc_world
  # ...
  countries: [ALL]
  domains: [breaking, geopolitics, society]

- id: ft
  # ...
  countries: [ALL]
  domains: [finance, business, geopolitics]

# Country-specific sources
- id: guardian_india
  # ...
  countries: [IN]
  domains: [geopolitics, society, culture]

- id: france24_india
  # ...
  countries: [IN]
  domains: [geopolitics, breaking]

- id: guardian_us
  # ...
  countries: [US]
  domains: [geopolitics, society]

# City sources
- id: the_hindu_delhi
  # ...
  countries: [IN]
  cities: [Delhi]
  domains: [india-domestic, local]

- id: standard_london
  # ...
  countries: [GB]
  cities: [London]
  domains: [geopolitics, local]

# Domain-specific sources
- id: techcrunch
  # ...
  countries: [ALL]
  domains: [tech, business, startups]

- id: mit_tech_review
  # ...
  countries: [ALL]
  domains: [tech, science]

- id: cisa_alerts
  # ...
  countries: [ALL]
  domains: [cyber, law]

# Think tanks
- id: rand
  # ...
  countries: [ALL]
  domains: [geopolitics, defense]

# India business
- id: et_india
  # ...
  countries: [IN]
  domains: [india-domestic, finance-india, business]

- id: nse_circulars
  # ...
  countries: [IN]
  domains: [finance-india, law]
```

**Step 3: Fix broken sources while tagging**

- Add missing `guardian_australia` source:
  ```yaml
  - id: guardian_australia
    name: Guardian (Australia)
    type: rss
    url: https://www.theguardian.com/australia-news/rss
    parser: rss
    pools: [GLOBAL_COUNTRIES]
    countries: [AU]
    domains: [geopolitics, society]
    is_active: true
  ```

- Add missing `guardian_newzealand` source:
  ```yaml
  - id: guardian_newzealand
    name: Guardian (New Zealand)
    type: rss
    url: https://www.theguardian.com/world/newzealand/rss
    parser: rss
    pools: [GLOBAL_COUNTRIES]
    countries: [NZ]
    domains: [geopolitics, society]
    is_active: true
  ```

- Fix `ie_maharashtra` URL (currently same as `ie_pune`):
  Change to a Google News proxy or remove and add Maharashtra tag to `ie_pune`.

- Fix `ie_west_bengal` URL (currently same as `ie_kolkata`):
  Change to a Google News proxy or remove and add West Bengal tag to `ie_kolkata`.

**Step 4: Run typecheck and test a source**

```bash
npm run typecheck
npm run dev &
# In another terminal, test:
# Use news.testSource to verify a tagged source still works
```

**Step 5: Commit**

```bash
git add config/sources.yml
git commit -m "config: add countries/cities/domains metadata to all sources, fix broken entries"
```

---

## Task 5: Add Domain Sources for R&D Expansion

**Files:**
- Modify: `config/sources.yml` — add new source entries
- Modify: `config/pools.yml` — add new pools if needed

**Step 1: Add new finance sources**

```yaml
- id: cnbc_markets
  name: CNBC Markets
  type: rss
  url: https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114
  parser: rss
  pools: [GLOBAL_GEOECON]
  countries: [ALL]
  domains: [finance, business]
  is_active: true

- id: marketwatch_top
  name: MarketWatch
  type: rss
  url: https://feeds.marketwatch.com/marketwatch/topstories/
  parser: rss
  pools: [GLOBAL_GEOECON]
  countries: [ALL]
  domains: [finance, business]
  is_active: true

- id: reuters_business
  name: Reuters Business (via Google News)
  type: rss
  url: https://news.google.com/rss/search?q=site:reuters.com+business+markets&hl=en-US&gl=US&ceid=US:en
  parser: rss
  pools: [GLOBAL_GEOECON]
  countries: [ALL]
  domains: [finance, business, breaking]
  is_active: true

- id: hbr
  name: Harvard Business Review
  type: rss
  url: https://hbr.org/feed
  parser: rss
  pools: [GLOBAL_GEOECON]
  countries: [ALL]
  domains: [business, strategy]
  is_active: true
```

**Step 2: Add new energy sources**

```yaml
- id: oilprice
  name: OilPrice.com
  type: rss
  url: https://oilprice.com/rss/main
  parser: rss
  pools: [GLOBAL_GEOECON]
  countries: [ALL]
  domains: [energy, finance, geopolitics]
  is_active: true

- id: ie_news
  name: IEA News
  type: rss
  url: https://www.iea.org/rss/news.xml
  parser: rss
  pools: [GLOBAL_GEOECON, GLOBAL_ENV_HEALTH]
  countries: [ALL]
  domains: [energy, environment, science]
  is_active: true
```

**Step 3: Add new science sources**

```yaml
- id: scientific_american
  name: Scientific American
  type: rss
  url: https://www.scientificamerican.com/feed/
  parser: rss
  pools: [GLOBAL_ENV_HEALTH, GLOBAL_TECH_CYBER]
  countries: [ALL]
  domains: [science, health, tech]
  is_active: true

- id: new_scientist
  name: New Scientist
  type: rss
  url: https://www.newscientist.com/feed/home
  parser: rss
  pools: [GLOBAL_ENV_HEALTH, GLOBAL_TECH_CYBER]
  countries: [ALL]
  domains: [science, tech, health]
  is_active: true
```

**Step 4: Add India tech sources**

```yaml
- id: inc42
  name: Inc42
  type: rss
  url: https://inc42.com/feed/
  parser: rss
  pools: [INDIA_BUSINESS_REG]
  countries: [IN]
  domains: [tech, business, startups]
  is_active: true

- id: yourstory
  name: YourStory
  type: rss
  url: https://yourstory.com/feed
  parser: rss
  pools: [INDIA_BUSINESS_REG]
  countries: [IN]
  domains: [tech, business, startups]
  is_active: true
```

**Step 5: Commit**

```bash
git add config/sources.yml
git commit -m "config: add finance, energy, science, India tech sources"
```

---

## Task 6: Fix news.fetch Output Schema

**Files:**
- Modify: `src/tools/news.ts` (output schema + meta construction)

**Step 1: Align meta output with schema**

The `meta` object returned by `news.fetch` includes `regionTags`, `cityTags`, `topicTags` that aren't in the output schema. Either add them to the schema or remove them from the output.

Fix: Update the output schema to match what's actually returned:

```typescript
outputSchema: {
  items: z.array(z.any()),
  count: z.number(),
  meta: z.object({
    sourcesQueried: z.number(),
    sourcesSucceeded: z.number(),
    sourcesFailed: z.number(),
    poolIds: z.array(z.string()),
    countryTags: z.array(z.string()),
    cityTags: z.array(z.string()),
    domainTags: z.array(z.string()),
    keywords: z.array(z.string()),
    excludeKeywords: z.array(z.string()),
    matchAll: z.boolean(),
    timeRange: z.object({ start: z.string(), end: z.string() }),
  }).optional(),
}
```

And fix the meta construction to use `domainTags` instead of `topicTags`:

```typescript
const structuredContent = { items: filtered, count: filtered.length, meta: {
  sourcesQueried: sources.length,
  sourcesSucceeded: 0,
  sourcesFailed: 0,
  poolIds: args.pools || [],
  countryTags: args.countries || [],
  cityTags: args.cities || [],
  domainTags: args.domains || [],
  keywords: args.keywords || [],
  excludeKeywords: args.excludeKeywords || [],
  matchAll: args.matchAll || false,
  timeRange: { start: args.start || '', end: args.end || '' }
} };
```

**Step 2: Run typecheck**

```bash
npm run typecheck
```

**Step 3: Commit**

```bash
git add src/tools/news.ts
git commit -m "fix: align news.fetch output schema with meta fields"
```

---

## Task 7: Integration Test

**Step 1: Start server and verify tools load**

```bash
npm run build
npm start
```

**Step 2: Test country filtering**

```
sources.countries → should show source_count > 0 for all 45 countries
news.fetch(countries=['IN'], domains=['finance']) → should return India finance sources
news.fetch(countries=['AU']) → should now return Guardian Australia + France24 Australia
```

**Step 3: Test domain filtering**

```
sources.domains → should show all domains with counts
news.fetch(domains=['tech', 'science']) → should return MIT Tech Review, TechCrunch, Nature, etc.
news.fetch(domains=['finance'], countries=['US']) → should return US finance sources
```

**Step 4: Test city filtering**

```
sources.cities → should show cities with counts
news.fetch(cities=['Delhi']) → should return The Hindu Delhi + IE Delhi
```

**Step 5: Verify no regressions on existing functionality**

```
news.fetch() → default behavior unchanged (GLOBAL_BREAKING + INDIA_NATIONAL_BASE)
news.fetch(pools=['GLOBAL_GEOECON']) → pool filtering still works
news.testSource(id='reuters') → single source testing still works
```

**Step 6: Final commit**

```bash
git add -A
git commit -m "refactor: complete config-driven architecture migration"
```

---

## Summary of Changes

| File | Change | Lines Affected |
|------|--------|---------------|
| `src/config/schemas.ts` | Add `countries`, `cities`, `domains` to SourceSchema | ~5 lines added |
| `src/types/news.ts` | Add matching fields to Source type | ~3 lines added |
| `src/tools/news.ts` | Delete 2 hardcoded maps + 1 resolver function. Add `resolveSourcesByFilter`. Add `domains` to FetchInput. Fix meta schema. | ~50 lines deleted, ~25 added |
| `src/tools/countries.ts` | Rewrite to filter from config. Add `sources.domains` tool. | ~53 lines rewritten |
| `config/countries.yml` | Remove `guardian_slug`, `france24_slug` from all entries | ~45 entries simplified |
| `config/sources.yml` | Add `countries`, `cities`, `domains` to all ~180 entries. Add ~10 new sources. Fix 3 broken entries. | ~180 entries modified |

**Net effect:** ~75 lines of TS deleted, ~30 added. Config files gain ~540 metadata fields. Zero hardcoded maps remain in code.
