# IGS Source Architecture

## Overview

IGS monitors **366 sources** across **14 pools**, **50 countries**, and **31 domain tags**. Sources break down into three types: RSS feeds (338), custom HTTP parsers (11), and social media endpoints (17). The architecture supports quality tiering, rate limiting, platform-aware configuration, and pre-deployment validation.

This document covers the source schema, pool definitions, quality tiers, rate limiting strategy, and how to add or modify sources.

---

## Source Schema

Every source in `config/sources.yml` follows this schema:

```yaml
- id: example_source        # Unique identifier (lowercase, underscores)
  name: Example Source      # Human-readable label
  type: rss                 # rss | http | social_media
  url: https://example.com/feed.xml
  parser: rss               # Parser module to use
  pools:
    - GLOBAL_TECH_CYBER     # Pool membership (one or more)
  countries:
    - US                    # ISO country codes (ALL = global)
  cities:
    - San Francisco         # Optional city association
  domains:
    - tech                  # Topic domain tags
  is_active: true           # false = disabled, kept in config
  sourceCategory: news      # news | community | research | social
  platform: web             # web | reddit | twitter (required for social_media type)
  tier: 2                   # 1 | 2 | 3 (optional, see quality tiers)
  rate_limit:               # Optional per-source rate limit
    interval_seconds: 300
    batch_size: 25
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique identifier, lowercase with underscores |
| `name` | yes | Human-readable label |
| `type` | yes | `rss`, `http`, or `social_media` |
| `url` | yes | Feed URL or resource identifier |
| `parser` | no | Parser module (rss, reddit, generic_html, etc.) |
| `headers` | no | Custom HTTP headers for requests |
| `parserConfig` | no | Advanced parser config (CSS selectors, etc.) |
| `pools` | yes | Array of pool IDs the source belongs to |
| `countries` | no | Country codes (ISO 3166-1 alpha-2) |
| `cities` | no | City names |
| `domains` | no | Topic domain tags |
| `is_active` | no | Boolean, defaults to true |
| `sourceCategory` | no | One of `news`, `community`, `research`, `social` |
| `platform` | conditional | Required when `type` is `social_media` |
| `tier` | no | Quality tier: 1, 2, or 3 |
| `rate_limit` | no | Per-source interval and batch settings |

### Platform Field

Required when `type` is `social_media`. Valid values:

- `reddit` - Reddit API source (subreddit search)
- `twitter` - Twitter/X source (API v2 or Nitter RSS fallback)
- `web` - General web platform

The schema enforces this via a superRefine validation rule: social_media sources without a platform field will fail validation.

---

## Pool Definitions

IGS has 14 pools. Four are newly split from the former `GLOBAL_ENV_HEALTH` pool (which is now deactivated).

### Global Pools

| Pool ID | Description |
|---------|-------------|
| `GLOBAL_BREAKING` | Fast, low-spin event detection |
| `GLOBAL_GEOECON` | Geopolitics and geoeconomics |
| `GLOBAL_LAW_REG` | Law and regulation |
| `GLOBAL_TECH_CYBER` | Tech and cyber |
| `GLOBAL_CULT_SOC` | Culture and society |
| `GLOBAL_COUNTRIES` | Country-specific international feeds |
| `GLOBAL_CITIES` | City-specific international feeds |

### India Pools

| Pool ID | Description |
|---------|-------------|
| `INDIA_NATIONAL_BASE` | Sober daily reporting with national breadth |
| `INDIA_WATCHDOG` | Investigations and accountability |
| `INDIA_FACTCHECK_DATA` | Verification and public-interest data |
| `INDIA_BUSINESS_REG` | Markets, filings, and regulatory signals |
| `INDIA_REGION` | State-level and zonal reporting |
| `INDIA_CITIES` | City-level feeds (Delhi, Mumbai, Bengaluru) |

### New Pools (Source Expansion)

| Pool ID | Description | Split From |
|---------|-------------|------------|
| `GLOBAL_HEALTH` | Pandemics, disease outbreaks, health policy, medical research, biosecurity | GLOBAL_ENV_HEALTH (deactivated) |
| `GLOBAL_ENVIRONMENT` | Climate change, biodiversity, energy transition, environmental policy, natural disasters | GLOBAL_ENV_HEALTH (deactivated) |
| `GLOBAL_SCIENCE` | Scientific research, space exploration, physics, biology, chemistry, discovery | New |
| `GLOBAL_DEFENSE_SECURITY` | Military, defense, aerospace, security policy, strategic forces, arms control | New |

The old `GLOBAL_ENV_HEALTH` pool is set to `is_active: false` and kept in the config for backward compatibility.

---

## Source Types

### RSS Feeds

The default source type. Standard RSS 2.0 and Atom feeds.

```yaml
- id: example_blog
  name: Example Blog
  type: rss
  url: https://example.com/blog/feed.xml
  parser: rss
  pools:
    - GLOBAL_TECH_CYBER
  countries:
    - US
  domains:
    - tech
  tier: 2
  is_active: true
```

### HTTP (Custom Parsing)

For sites that don't offer RSS feeds. Uses HTML scraping with cheerio-based parsers.

```yaml
- id: example_custom
  name: Example Custom
  type: http
  url: https://example.com/articles
  parser: generic_html
  parserConfig:
    selectors:
      item: article.post
      title: h2.title a
      link: h2.title a
      date: time.published
  pools:
    - GLOBAL_TECH_CYBER
  countries:
    - US
  domains:
    - tech
  tier: 2
  is_active: true
```

### Social Media

Reddit and Twitter sources with platform-aware rate limiting.

```yaml
- id: reddit_worldnews
  name: Reddit /r/worldnews
  type: social_media
  platform: reddit
  url: worldnews
  parser: reddit
  pools:
    - GLOBAL_BREAKING
  countries:
    - ALL
  domains:
    - breaking
    - geopolitics
  is_active: true
  tier: 3
  rate_limit:
    interval_seconds: 300
    batch_size: 25
```

```yaml
- id: twitter_news
  name: Twitter News Account
  type: social_media
  platform: twitter
  url: news_account
  parser: nitter
  pools:
    - GLOBAL_BREAKING
  countries:
    - ALL
  domains:
    - breaking
  is_active: true
  tier: 3
  rate_limit:
    interval_seconds: 300
    batch_size: 25
```

**Current inventory**: 10 Reddit sources, 7 Twitter sources (17 total social_media).

---

## Source Quality Tiers

Tiers control cache behavior and dedup priority. Implemented in `src/utils/tier-validator.ts`.

| Tier | Label | Cache Multiplier | Authoritative | Description |
|------|-------|-----------------|---------------|-------------|
| 1 | Primary / Official | 2.0x | Yes | Official sources, government agencies, peer-reviewed journals (CDC, WHO, ICJ, Lancet) |
| 2 | Major Outlet | 1.0x | No | Established outlets, think tanks, reputable media (Carbon Brief, NYT, BBC) |
| 3 | Blog / Social / Niche | 0.5x | No | Blogs, social media, niche publications (Reddit, Twitter) |

How tiers affect behavior:

- **Cache TTL**: Tier 1 sources cache 2x longer (authoritative content changes slowly). Tier 3 sources cache at 0.5x (social media is fast-moving).
- **Dedup priority**: When two sources cover the same story, the tier 1 source wins. Tier 3 sources never win dedup conflicts.
- **Default**: Sources without a tier are treated as tier 2 for cache purposes.

Currently **42 sources** have explicit tier assignments. The rest default to tier 2 behavior.

---

## Rate Limiting

Implemented in `src/utils/rate-limiter.ts`. Two modes working together.

### Per-Source Interval Limits

Each source can define its own rate limit via `rate_limit.interval_seconds`. This controls the minimum time between fetches from that source.

```yaml
rate_limit:
  interval_seconds: 300   # Wait 5 minutes between fetches
  batch_size: 25          # Max items per fetch
```

The source-level interval acts as a per-source cooldown. The rate limiter uses a sliding window counter stored in memory. No external dependencies.

### Per-Platform Aggregate Quotas

Platform-wide quotas apply on top of per-source limits. These prevent the system from hitting API rate limits for shared services.

| Platform | Quota | Window |
|----------|-------|--------|
| Reddit | 60 requests | 60 seconds |
| Twitter/X | 450 requests | 15 minutes |

These are stored as presets in the rate limiter:

```
REDDIT_PLATFORM_LIMIT: maxRequests=60, windowMs=60000
TWITTER_PLATFORM_LIMIT: maxRequests=450, windowMs=900000
```

### RateLimitError

When a rate-limited operation times out waiting for a slot, a `RateLimitError` is thrown with:

- `key` - The rate limit key that was exceeded
- `retryAfterMs` - Milliseconds until a slot frees up

The default timeout for waiting is 30 seconds. The limiter polls every 100 ms.

### Key Structure

Rate limit keys follow two patterns:

- `source:<sourceId>` - Per-source interval key
- `platform:<platform>` - Per-platform aggregate key

---

## Pre-Validation Workflow

Before adding or modifying sources, run the validation scripts.

### Basic Source Validation

Tests each source URL for HTTP 200 status, content-type inspection, and parse simulation.

```bash
bun run scripts/validate-sources.ts --url <url> --parser <parser>
bun run scripts/validate-sources.ts --file <path-to-yaml>
```

Exit code 0 means all pass. Exit code 1 means at least one failed.

The script supports these parser types for validation: `rss`, `json_feed`, `generic_html`, `article_content`, `sitemap`, `ofac`, `ussf_cfc`, `newslaundry`, `who_dons`, `semantic_scholar`, `pdf-extractor`, `pdf-to-markdown`.

### Schema Validation

Sources are validated at load time against the Zod schema in `src/config/schemas.ts`. Key schema rules:

- `id` and `name` are required, non-empty strings
- `type` must be one of `rss`, `http`, or `social_media`
- `url` must be a valid URL
- `pools` defaults to an empty array if omitted
- `social_media` type requires a `platform` field
- `tier` must be 1, 2, or 3
- `rate_limit.interval_seconds` must be a positive integer
- `sourceCategory` defaults to `news`

---

## Adding New Sources

### Step 1: Add the source entry

Edit `config/sources.yml` (or `~/.config/igs-mcp/sources.yml` for user configs). Changes load automatically if the server detects file changes.

### Step 2: Validate the URL

```bash
bun run scripts/validate-sources.ts --url <feed-url> --parser <parser>
```

Check that the output shows `status: ok` and a reasonable `items_count`.

### Step 3: Assign a tier

New sources should get an appropriate tier:

- Tier 1: Government agencies, official data sources, peer-reviewed journals
- Tier 2: Established news outlets, major think tanks, reputable independent media
- Tier 3: Blogs, social media, community sources, niche publications

### Step 4: Configure rate limits

Social media sources should always include rate_limit settings. Start with `interval_seconds: 300` and `batch_size: 25` and adjust based on observed fetch behavior.

### Step 5: Run source health check

```bash
bun run scripts/health-monitor.ts
```

This checks all active sources and reports any that are failing, slow, or returning empty results.

---

## Social Media Source Configuration

### Reddit

Reddit sources use the `reddit` parser with `platform: reddit`. The `url` field is the subreddit name (without `/r/`).

```yaml
- id: reddit_example
  name: Reddit /r/example
  type: social_media
  platform: reddit
  url: example                # Subreddit name only
  parser: reddit
  pools:
    - GLOBAL_TECH_CYBER
  countries:
    - ALL
  domains:
    - tech
  tier: 3
  rate_limit:
    interval_seconds: 300
    batch_size: 25
```

Platform quota: 60 requests per 60 seconds (shared across all Reddit sources).

### Twitter/X

Twitter sources use either the Twitter API v2 or a Nitter RSS fallback. The `url` field is the account handle or search term.

```yaml
- id: twitter_example
  name: Twitter @example
  type: social_media
  platform: twitter
  url: example                # Account handle (without @)
  parser: nitter
  pools:
    - GLOBAL_TECH_CYBER
  countries:
    - ALL
  domains:
    - tech
  tier: 3
  rate_limit:
    interval_seconds: 300
    batch_size: 25
```

Platform quota: 450 requests per 15 minutes (shared across all Twitter sources).

### Social Media Tiering

All social media sources default to tier 3. This means:

- Cache TTL is halved (content becomes stale quickly)
- They never win in dedup priority against tier 1 or tier 2 sources
- They are the first sources to be deprioritized under heavy load

---

## Source Categories

Every source has a `sourceCategory` field that classifies its content type:

| Category | Description |
|----------|-------------|
| `news` | Traditional news outlets (default) |
| `community` | Community-driven content (forums, subreddits) |
| `research` | Academic journals, preprints, research databases |
| `social` | Individual social media accounts |

Currently all 366 sources are classified as `news`, but the field is available for future granularity.

---

## Tips

- Give sources meaningful IDs that won't change if the URL changes
- Tag sources with as many relevant domain tags as possible
- Use `countries: [ALL]` for global sources instead of listing every country
- Test new sources on a single pool before adding them to multiple pools
- Monitor the health report after adding new sources to catch failures early
