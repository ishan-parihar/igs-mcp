# IGS News Source Expansion Plan

## TL;DR

> **Objective:** Expand IGS from 325 sources across 14 pools to 370+ sources across 18 pools by adding dedicated Health, Science, Environment/Climate, and Defense pools, integrating Reddit and Twitter social media sources, implementing source quality tiering, and establishing automated source health monitoring.
>
> **Deliverables:**
> - 4 new pool configurations with ~45 validated sources
> - 2 new parsers (`reddit`, `twitter`)
> - Updated YAML schema with `platform`, `tier`, and `rate_limit` fields
> - Centralized rate limiter for social APIs
> - Source health monitoring script
> - Reactivated international legal bodies
>
> **Estimated Effort:** Large (~6-8 waves, 22+ tasks)
> **Parallel Execution:** YES - 5-7 tasks per wave after Wave 1
> **Critical Path:** Schema changes → Pool creation → Source validation → Parser development → Social integration → Final verification

---

## Context

### Original Request
User requested comprehensive research on missing news sources across all domains and a plan to address the 7 critical gaps identified in the IGS audit:
1. Social/cultural pool needs revival
2. Health/science needs dedicated pool
3. Environment needs climate sources
4. International legal bodies inactive
5. No defense/military pool
6. No source quality scoring
7. No health monitoring automation

### Research Findings
- **Reddit API utility** (`src/utils/reddit-api.ts`) exists but is NOT configured as a source
- **No Twitter/X integration** exists at all
- **12 parsers** exist but none for social media
- Academic journal RSS feeds (BMJ, Lancet, NEJM, JAMA) may be paywalled/headlines-only
- Twitter API budget is a hard prerequisite (free tier: 1,500 tweets/month is insufficient)

### Metis Review Findings (Addressed)
1. **Source quality tiering** (Tier 1/2/3) added to schema
2. **Pre-validation required** for all RSS feeds before activation
3. **Twitter API budget** flagged as critical prerequisite
4. **2 new parsers** (`reddit`, `twitter`) required
5. **`platform` field** added to YAML schema for social sources
6. **Strict rate limiting** documented (Reddit: 60 req/min, Twitter: 1,500-10,000 tweets/mo)
7. **Health and Science** split into separate pools
8. **Environment** gets its own pool
9. **No historical backfill** - forward-fetching only
10. **No NLP/monitoring/dashboard** scope creep

---

## Work Objectives

### Core Objective
Add ~45 new sources across 4 new pools, integrate Reddit and Twitter as first-class sources, implement source quality tiering, and build automated health monitoring - all while maintaining zero regression on existing 309 active sources.

### Concrete Deliverables
- `config/pools.yml` - 4 new pool entries (health, science, environment, defense)
- `config/sources.yml` - ~45 new validated source entries
- `src/parsers/reddit.ts` - Reddit API → IGS article format parser
- `src/parsers/twitter.ts` - Twitter API v2 → IGS article format parser
- `src/utils/twitter-api.ts` - Twitter API authentication and fetch utility
- `src/utils/rate-limiter.ts` - Centralized rate limiter for social APIs
- `src/utils/source-validator.ts` - Pre-validation script for RSS feeds
- `src/utils/source-health-monitor.ts` - Automated health monitoring script
- Updated YAML schema validator for conditional fields

### Definition of Done
- [ ] All new sources produce parseable content on first fetch (≥90% success rate)
- [ ] All existing 309 sources continue to parse successfully (zero regression)
- [ ] Reddit parser fetches and parses ≥3 subreddits with ≥95% success rate
- [ ] Twitter parser fetches and parses ≥3 accounts with ≥95% success rate
- [ ] System handles combined fetch schedule without queue backup exceeding 2x polling interval
- [ ] Every source entry passes schema validator

### Must Have
- 4 new pools with minimum 8 sources each
- Source quality `tier` field on all new sources
- Reddit integration via existing `reddit-api.ts`
- Twitter integration (pending API budget confirmation)
- Rate limiting on all social media sources
- Pre-validation of all RSS feed URLs

### Must NOT Have (Guardrails)
- Historical backfill of any source
- NLP, sentiment analysis, or summarization improvements
- Monitoring dashboard or UI changes
- New social platforms (Telegram, Discord, Mastodon, Bluesky)
- Changes to existing pool configurations (except reactivating inactive sources)
- Parser modifications for existing 12 parsers

---

## Verification Strategy

### Test Decision
- **Infrastructure exists:** YES - bun test framework detected
- **Automated tests:** Tests-after (no TDD requirement for config/YAML work)
- **Framework:** bun test
- **Agent-Executed QA:** MANDATORY for all tasks

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Config/YAML validation:** Bash (node script) - Validate YAML syntax and schema compliance
- **Parser development:** Bun test - Unit tests for parsing functions
- **API integration:** Bash (curl) - Test Reddit/Twitter API endpoints
- **Source validation:** Bash (node script) - Test fetch and parse for each source
- **Health monitoring:** Bash (node script) - Run monitor and verify output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - schema + pools + utilities):
├── Task 1: Update source YAML schema (platform, tier, rate_limit fields)
├── Task 2: Add tier field to existing source validator
├── Task 3: Create 4 new pool configurations
├── Task 4: Build source pre-validation script
├── Task 5: Build centralized rate limiter utility
└── Task 6: Update YAML validator for conditional schema

Wave 2 (Core sources - parallel by domain):
├── Task 7: Add and validate Health pool sources (CDC, BMJ, Lancet, NEJM, JAMA, KFF)
├── Task 8: Add and validate Science pool sources (Live Science, Knowable Magazine)
├── Task 9: Add and validate Environment/Climate pool sources (Carbon Brief, Inside Climate News, Yale Climate, Skeptical Science)
├── Task 10: Add and validate Defense/Security pool sources (Janes, RAND, Newsweek)
├── Task 11: Reactivate international legal bodies (ICJ, ICC, WTO, OHCHR, HRW, Amnesty)
└── Task 12: Add Cultural/Arts sources to Social pool

Wave 3 (Social media - parsers + integration):
├── Task 13: Build Reddit parser (src/parsers/reddit.ts)
├── Task 14: Build Twitter API utility (src/utils/twitter-api.ts)
├── Task 15: Build Twitter parser (src/parsers/twitter.ts)
├── Task 16: Add Reddit subreddit sources to sources.yml
├── Task 17: Add Twitter/X account sources to sources.yml
└── Task 18: Integrate social parsers into fetch pipeline

Wave 4 (Health monitoring + final validation):
├── Task 19: Build source health monitoring script
├── Task 20: Run full source validation suite across all 370+ sources
├── Task 21: Update project documentation
└── Task 22: Performance test - verify queue handling under full load

Wave FINAL (4 parallel reviews + user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 (Schema) | - | 2, 6, 7-12, 16-17 |
| 2 (Tier validator) | 1 | 7-12 |
| 3 (Pools) | - | 7-12 |
| 4 (Pre-validation) | - | 7-12 |
| 5 (Rate limiter) | - | 13-18 |
| 6 (YAML validator) | 1 | 7-12, 16-17 |
| 7 (Health sources) | 1, 2, 3, 4, 6 | 20 |
| 8 (Science sources) | 1, 2, 3, 4, 6 | 20 |
| 9 (Environment sources) | 1, 2, 3, 4, 6 | 20 |
| 10 (Defense sources) | 1, 2, 3, 4, 6 | 20 |
| 11 (Legal bodies) | 1, 2, 4, 6 | 20 |
| 12 (Cultural sources) | 1, 2, 3, 4, 6 | 20 |
| 13 (Reddit parser) | 5 | 16, 18 |
| 14 (Twitter utility) | 5 | 15, 17 |
| 15 (Twitter parser) | 14 | 17, 18 |
| 16 (Reddit sources) | 1, 6, 13 | 20 |
| 17 (Twitter sources) | 1, 6, 15 | 20 |
| 18 (Pipeline integration) | 13, 15 | 20 |
| 19 (Health monitor) | - | 20 |
| 20 (Full validation) | 7-12, 16-17, 18, 19 | 21, 22 |
| 21 (Documentation) | 20 | F1-F4 |
| 22 (Performance test) | 20 | F1-F4 |

### Critical Path
Task 1 → Tasks 7-12 (parallel) → Task 20 → Tasks 21-22 (parallel) → F1-F4 → user okay

Parallel Speedup: ~65% faster than sequential
Max Concurrent: 6 (Wave 2)

---

## TODOs

- [ ] 1. Update source YAML schema (platform, tier, rate_limit fields)

  **What to do**:
  - Add `platform` field to source schema: enum `[rss, reddit, twitter]` (default: `rss`)
  - Add `tier` field: enum `[1, 2, 3]` (default: `2`) with semantic meaning documented
  - Add `rate_limit` object: `{ interval_seconds: number, batch_size: number }` (optional, for social sources)
  - Update TypeScript `Source` interface in `src/types/source.ts`
  - Update YAML schema documentation in `docs/source-schema.md`
  - Ensure backward compatibility: existing sources without these fields must still validate

  **Must NOT do**:
  - Remove or modify existing fields
  - Change default behavior for existing sources
  - Add validation that breaks existing 309 active sources

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `test-driven-development`
    - TDD: Ensure schema changes don't break existing tests

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5, 6)
  - **Blocks**: Tasks 2, 6, 7-12, 16-17
  - **Blocked By**: None

  **References**:
  - `src/types/source.ts` - Current Source interface definition
  - `config/sources.yml` - Existing source entries to verify backward compatibility
  - `docs/source-schema.md` - Schema documentation to update

  **Acceptance Criteria**:
  - [ ] `bun test src/types/source.test.ts` passes (or create test if none exists)
  - [ ] `bun run validate:sources` passes on existing sources.yml without errors
  - [ ] New fields are optional with sensible defaults
  - [ ] TypeScript compilation succeeds: `bunx tsc --noEmit`

  **QA Scenarios**:

  ```
  Scenario: Schema backward compatibility
    Tool: Bash (bun)
    Preconditions: Existing sources.yml unchanged
    Steps:
      1. Run: bun run validate:sources
      2. Verify: exits with code 0, no validation errors
    Expected Result: All 309 existing sources validate successfully
    Evidence: .sisyphus/evidence/task-1-backward-compat.log

  Scenario: New fields accepted
    Tool: Bash (node)
    Preconditions: Create test source with platform, tier, rate_limit
    Steps:
      1. Create temporary test YAML with new fields
      2. Run: bun run validate:sources --test-file=tmp.yml
      3. Verify: validation passes
    Expected Result: New optional fields are accepted and parsed correctly
    Evidence: .sisyphus/evidence/task-1-new-fields.log
  ```

  **Commit**: YES
  - Message: `feat(schema): add platform, tier, and rate_limit fields to source schema`
  - Files: `src/types/source.ts`, `docs/source-schema.md`, any validator files

---

- [ ] 2. Add tier field to existing source validator

  **What to do**:
  - Update the source validation script to check `tier` field values (1, 2, or 3)
  - Add tier validation logic: reject invalid tier values
  - Document tier semantics: Tier 1 = primary/official, Tier 2 = major/reputable, Tier 3 = social/alternative
  - If no validator script exists, create `scripts/validate-sources.ts`

  **Must NOT do**:
  - Require tier on existing sources (make it optional with default)
  - Create a separate validation system

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 7-12
  - **Blocked By**: Task 1

  **References**:
  - `scripts/validate-sources.ts` or equivalent validation script
  - `src/types/source.ts` - Updated from Task 1

  **Acceptance Criteria**:
  - [ ] Validator accepts sources with tier=1, tier=2, tier=3
  - [ ] Validator rejects sources with tier=0 or tier=4
  - [ ] Validator accepts sources without tier field (uses default)

  **QA Scenarios**:

  ```
  Scenario: Tier validation
    Tool: Bash (node/bun)
    Steps:
      1. Create test YAML with valid tiers (1, 2, 3)
      2. Run validator
      3. Create test YAML with invalid tier (4)
      4. Run validator, expect failure
    Expected Result: Valid tiers pass, invalid tier fails
    Evidence: .sisyphus/evidence/task-2-tier-validation.log
  ```

  **Commit**: YES (group with Task 1)

---

- [ ] 3. Create 4 new pool configurations

  **What to do**:
  - Add 4 new pool entries to `config/pools.yml`:
    - `health` - Health, medicine, public health, epidemiology
    - `science` - General science, research, technology breakthroughs
    - `environment` - Climate change, environmental policy, energy transition
    - `defense` - Defense, military, geopolitical security, strategic affairs
  - For each pool, define: name, description, domains, tags, priority
  - Follow existing pool configuration patterns exactly

  **Must NOT do**:
  - Modify existing 14 pools
  - Create pools with overlapping scope (health ≠ science, defense ≠ political)

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 7-12
  - **Blocked By**: None

  **References**:
  - `config/pools.yml` - Existing pool definitions to match
  - `docs/pools.md` - Pool documentation (if exists)

  **Acceptance Criteria**:
  - [ ] 4 new pools appear in `config/pools.yml`
  - [ ] Pool validator (if exists) passes
  - [ ] Pool names are unique and don't conflict with existing 14 pools

  **QA Scenarios**:

  ```
  Scenario: Pool creation
    Tool: Bash (cat/grep)
    Steps:
      1. Verify: grep -c "^  health:" config/pools.yml (or equivalent)
      2. Verify: grep -c "^  science:" config/pools.yml
      3. Verify: grep -c "^  environment:" config/pools.yml
      4. Verify: grep -c "^  defense:" config/pools.yml
    Expected Result: Each pool exists exactly once
    Evidence: .sisyphus/evidence/task-3-pools-created.log
  ```

  **Commit**: YES
  - Message: `feat(pools): add health, science, environment, and defense pools`
  - Files: `config/pools.yml`

---

- [ ] 4. Build source pre-validation script

  **What to do**:
  - Create `scripts/validate-source-urls.ts` that:
    - Reads a source entry (or list of entries)
    - Performs an HTTP HEAD/GET request to the source URL/API endpoint
    - Verifies the response is valid (200 OK, parseable content)
    - For RSS feeds: validates XML structure and checks for at least 1 item
    - For Reddit: tests API connectivity
    - Outputs pass/fail for each source with detailed error messages
  - Script should be runnable as: `bun run validate-source-urls [source-name]` or `--all`

  **Must NOT do**:
  - Modify existing sources (read-only validation)
  - Run validation against production fetch schedule

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 7-12
  - **Blocked By**: None

  **References**:
  - `scripts/test_new_sources.ts` - Existing test script to learn from
  - `src/utils/fetcher.ts` or equivalent HTTP client

  **Acceptance Criteria**:
  - [ ] Script runs without errors: `bun run validate-source-urls --all`
  - [ ] Script correctly identifies broken/unreachable URLs
  - [ ] Script validates RSS XML structure
  - [ ] Script outputs JSON or structured report

  **QA Scenarios**:

  ```
  Scenario: Validate existing sources
    Tool: Bash (bun)
    Steps:
      1. Run: bun run validate-source-urls --sample=10
      2. Verify: outputs results for 10 random existing sources
      3. Check: at least 8/10 pass (allowing for transient failures)
    Expected Result: Most existing sources validate successfully
    Evidence: .sisyphus/evidence/task-4-validate-existing.log

  Scenario: Validate broken source
    Tool: Bash (bun)
    Steps:
      1. Create test entry with invalid URL
      2. Run: bun run validate-source-urls test-broken-source
      3. Verify: script reports FAIL with specific error
    Expected Result: Broken source correctly identified
    Evidence: .sisyphus/evidence/task-4-validate-broken.log
  ```

  **Commit**: YES
  - Message: `feat(utils): add source pre-validation script`
  - Files: `scripts/validate-source-urls.ts`

---

- [ ] 5. Build centralized rate limiter utility

  **What to do**:
  - Create `src/utils/rate-limiter.ts` implementing:
    - Token bucket or sliding window algorithm
    - Per-source rate limit tracking
    - Platform-specific defaults (Reddit: 60 req/min, Twitter: tier-dependent)
    - Method: `acquire(sourceId, platform): Promise<void>` - resolves when safe to proceed
    - Method: `getStatus(): RateLimitStatus[]` - for monitoring
  - Export singleton instance for use across parsers
  - Must be non-blocking: if rate limit exceeded, queue and resolve later

  **Must NOT do**:
  - Block the entire fetch pipeline on one rate-limited source
  - Hardcode API keys or credentials
  - Apply rate limits to RSS sources (they use existing scheduling)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 13-18
  - **Blocked By**: None

  **References**:
  - `src/utils/reddit-api.ts` - Existing Reddit utility for API patterns
  - `src/types/source.ts` - rate_limit field from Task 1

  **Acceptance Criteria**:
  - [ ] Unit tests pass: `bun test src/utils/rate-limiter.test.ts`
  - [ ] Rate limiter enforces per-source limits
  - [ ] Rate limiter handles multiple sources concurrently
  - [ ] Rate limiter logs/exports status for monitoring

  **QA Scenarios**:

  ```
  Scenario: Rate limit enforcement
    Tool: Bun test
    Steps:
      1. Create rate limiter with 2 req/sec limit
      2. Fire 5 requests simultaneously
      3. Measure: all 5 complete, but timestamps show ≥500ms spacing
    Expected Result: Requests are throttled to 2/sec
    Evidence: .sisyphus/evidence/task-5-rate-limit.log

  Scenario: Multi-source isolation
    Tool: Bun test
    Steps:
      1. Create 2 sources with different limits (A: 2/sec, B: 5/sec)
      2. Fire requests to both simultaneously
      3. Verify: A is throttled to 2/sec, B to 5/sec, no cross-contamination
    Expected Result: Per-source isolation works
    Evidence: .sisyphus/evidence/task-5-multi-source.log
  ```

  **Commit**: YES
  - Message: `feat(utils): add centralized rate limiter for social APIs`
  - Files: `src/utils/rate-limiter.ts`, `src/utils/rate-limiter.test.ts`

---

- [ ] 6. Update YAML validator for conditional schema

  **What to do**:
  - Update the source YAML validator to handle conditional required fields:
    - If `platform == 'rss'` (or undefined): `url` is required, `subreddit`/`handle` forbidden
    - If `platform == 'reddit'`: `subreddit` is required, `url` optional
    - If `platform == 'twitter'`: `handle` is required, `url` optional
  - Update validation errors to be descriptive (e.g., "Twitter source 'X' missing required field 'handle'")
  - Ensure backward compatibility: sources without `platform` field validate as before

  **Must NOT do**:
  - Break validation for existing 309 sources
  - Add overly strict validation that prevents valid edge cases

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 7-12, 16-17
  - **Blocked By**: Task 1

  **References**:
  - `scripts/validate-sources.ts` or equivalent validator
  - `src/types/source.ts` - Updated interface from Task 1

  **Acceptance Criteria**:
  - [ ] Validator accepts existing RSS-only sources (no platform field)
  - [ ] Validator rejects Reddit source without `subreddit`
  - [ ] Validator rejects Twitter source without `handle`
  - [ ] Validator accepts social sources with all required fields

  **QA Scenarios**:

  ```
  Scenario: Conditional validation
    Tool: Bash (bun)
    Steps:
      1. Create test YAML with 3 sources: valid RSS, valid Reddit, invalid Twitter (no handle)
      2. Run validator
      3. Verify: RSS passes, Reddit passes, Twitter fails with specific error
    Expected Result: Conditional validation works correctly
    Evidence: .sisyphus/evidence/task-6-conditional-validation.log
  ```

  **Commit**: YES (group with Task 1)

- [ ] 7. Add and validate Health pool sources

  **What to do**:
  - Add 8-10 health sources to `config/sources.yml`:
    - CDC (Centers for Disease Control) - cdc.gov RSS
    - BMJ (British Medical Journal) - RSS (headlines/abstracts only)
    - The Lancet - RSS (headlines/abstracts only)
    - NEJM (New England Journal of Medicine) - RSS (headlines/abstracts only)
    - JAMA (Journal of the American Medical Association) - RSS (headlines/abstracts only)
    - KFF Health News - JSON feed or RSS
    - WHO (World Health Organization) - RSS
    - Stat News - RSS
  - Set `tier: 1` for CDC, WHO, NEJM, Lancet, BMJ
  - Set `tier: 2` for KFF, Stat News, JAMA
  - Run pre-validation script (Task 4) on each source before activation
  - Tag all with `health`, `medicine`, `public-health` plus specialty tags

  **Must NOT do**:
  - Add sources without pre-validation
  - Expect full article content from paywalled journals (handle partial content)

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 9, 10, 11, 12)
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 1, 2, 3, 4, 6

  **References**:
  - `config/sources.yml` - Existing source format
  - `scripts/validate-source-urls.ts` - From Task 4

  **Acceptance Criteria**:
  - [ ] 8-10 health sources added to `config/sources.yml`
  - [ ] All sources validate via pre-validation script
  - [ ] All sources have `pool: health` and `tier` set
  - [ ] At least 90% produce parseable content on first fetch

  **QA Scenarios**:

  ```
  Scenario: Health sources fetch test
    Tool: Bash (bun)
    Steps:
      1. Run: bun run validate-source-urls --pool=health
      2. Verify: all sources return 200 OK and valid parseable content
      3. Check: at least 8/10 sources pass validation
    Expected Result: ≥90% health sources validate successfully
    Evidence: .sisyphus/evidence/task-7-health-sources.log
  ```

  **Commit**: YES
  - Message: `feat(sources): add health pool sources`
  - Files: `config/sources.yml`

---

- [ ] 8. Add and validate Science pool sources

  **What to do**:
  - Add 8-10 science sources to `config/sources.yml`:
    - Live Science - RSS
    - Knowable Magazine - RSS
    - Nature News - RSS
    - Science Magazine - RSS
    - Scientific American - RSS
    - New Scientist - RSS
    - Phys.org - RSS
    - Space.com - RSS
  - Set `tier: 1` for Nature, Science Magazine
  - Set `tier: 2` for Scientific American, New Scientist
  - Set `tier: 3` for Live Science, Phys.org, Space.com
  - Run pre-validation on each source

  **Must NOT do**:
  - Overlap with Technology pool (keep science focused on research/discovery)

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 1, 2, 3, 4, 6

  **Acceptance Criteria**:
  - [ ] 8-10 science sources added
  - [ ] All sources validate via pre-validation script
  - [ ] At least 90% produce parseable content on first fetch

  **QA Scenarios**:

  ```
  Scenario: Science sources fetch test
    Tool: Bash (bun)
    Steps:
      1. Run: bun run validate-source-urls --pool=science
      2. Verify: all sources return valid content
      3. Check: ≥90% pass rate
    Expected Result: Science pool sources validated
    Evidence: .sisyphus/evidence/task-8-science-sources.log
  ```

  **Commit**: YES
  - Message: `feat(sources): add science pool sources`
  - Files: `config/sources.yml`

---

- [ ] 9. Add and validate Environment/Climate pool sources

  **What to do**:
  - Add 8-10 environment sources to `config/sources.yml`:
    - Carbon Brief - RSS
    - Inside Climate News - RSS
    - Yale Climate Connections - RSS
    - Skeptical Science - RSS
    - Climate Central - RSS
    - The Guardian Environment - RSS (section feed)
    - Grist - RSS
    - Environmental Health News - RSS
  - Set `tier: 1` for IPCC (if PDF reports added), Carbon Brief
  - Set `tier: 2` for Inside Climate News, Yale Climate, Grist
  - Set `tier: 3` for Skeptical Science, Climate Central
  - Run pre-validation on each source

  **Must NOT do**:
  - Add general news environment sections (keep focused on climate-specific)

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 1, 2, 3, 4, 6

  **Acceptance Criteria**:
  - [ ] 8-10 environment sources added
  - [ ] All sources validate via pre-validation script
  - [ ] At least 90% produce parseable content on first fetch

  **QA Scenarios**:

  ```
  Scenario: Environment sources fetch test
    Tool: Bash (bun)
    Steps:
      1. Run: bun run validate-source-urls --pool=environment
      2. Verify: all sources return valid content
      3. Check: ≥90% pass rate
    Expected Result: Environment pool sources validated
    Evidence: .sisyphus/evidence/task-9-environment-sources.log
  ```

  **Commit**: YES
  - Message: `feat(sources): add environment and climate pool sources`
  - Files: `config/sources.yml`

---

- [ ] 10. Add and validate Defense/Security pool sources

  **What to do**:
  - Add 6-8 defense sources to `config/sources.yml`:
    - Jane's Defence Weekly (if accessible) or Jane's RSS
    - RAND Corporation - RSS
    - Defense News - RSS
    - Breaking Defense - RSS
    - War on the Rocks - RSS
    - The Drive (War Zone) - RSS
    - Arms Control Wonk - RSS
    - Defense One - RSS
  - Set `tier: 1` for RAND, Jane's
  - Set `tier: 2` for Defense News, Defense One, War on the Rocks
  - Set `tier: 3` for Breaking Defense, The Drive
  - Run pre-validation on each source
  - Note: Some defense sources may be geo-blocked or paywalled

  **Must NOT do**:
  - Overlap with Political pool (focus on defense policy, military affairs, strategic analysis)

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 1, 2, 3, 4, 6

  **Acceptance Criteria**:
  - [ ] 6-8 defense sources added
  - [ ] All sources validate via pre-validation script
  - [ ] At least 75% produce parseable content (defense sources are more restricted)

  **QA Scenarios**:

  ```
  Scenario: Defense sources fetch test
    Tool: Bash (bun)
    Steps:
      1. Run: bun run validate-source-urls --pool=defense
      2. Verify: sources return valid content
      3. Check: ≥75% pass rate (accounting for geo-blocks)
    Expected Result: Defense pool sources validated
    Evidence: .sisyphus/evidence/task-10-defense-sources.log
  ```

  **Commit**: YES
  - Message: `feat(sources): add defense and security pool sources`
  - Files: `config/sources.yml`

---

- [ ] 11. Reactivate international legal bodies

  **What to do**:
  - Identify currently INACTIVE international legal sources in `config/sources.yml`
  - Investigate why each is inactive (feed broken, content irrelevant, temporary outage)
  - Fix or update URLs for broken feeds
  - Reactivate sources that are viable:
    - ICJ (International Court of Justice) - press releases RSS
    - ICC (International Criminal Court) - RSS
    - WTO - news RSS
    - UN OHCHR - news RSS
    - Human Rights Watch - RSS
    - Amnesty International - RSS
  - If sources are permanently broken, document and remove them
  - If no inactive legal sources exist, add new ones from the list above

  **Must NOT do**:
  - Reactivate sources without validating they work
  - Leave broken sources in active state

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 1, 2, 4, 6

  **References**:
  - `config/sources.yml` - Search for `active: false` entries
  - `scripts/validate-source-urls.ts` - From Task 4

  **Acceptance Criteria**:
  - [ ] All previously inactive legal sources are either reactivated or removed
  - [ ] Reactivated sources pass validation
  - [ ] Legal pool has ≥6 active sources

  **QA Scenarios**:

  ```
  Scenario: Legal bodies reactivation
    Tool: Bash (bun)
    Steps:
      1. Run: bun run validate-source-urls --pool=legal
      2. Verify: all legal sources pass validation
      3. Check: count active legal sources ≥6
    Expected Result: Legal pool revived with working sources
    Evidence: .sisyphus/evidence/task-11-legal-bodies.log
  ```

  **Commit**: YES
  - Message: `feat(sources): reactivate international legal bodies`
  - Files: `config/sources.yml`

---

- [ ] 12. Add Cultural/Arts sources to Social pool

  **What to do**:
  - Add 6-8 cultural sources to expand the weakest pool:
    - ArtsJournal - RSS
    - Hyperallergic - RSS
    - Artnet News - RSS
    - The Paris Review - RSS
    - Literary Hub - RSS
    - Smithsonian Magazine - RSS
    - Artsy - RSS
    - Frieze - RSS
  - Set `tier: 2` for Smithsonian, The Paris Review
  - Set `tier: 3` for ArtsJournal, Hyperallergic, Artnet
  - Run pre-validation on each source

  **Must NOT do**:
  - Overlap with existing social/cultural sources (check for duplicates)

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 1, 2, 3, 4, 6

  **Acceptance Criteria**:
  - [ ] 6-8 cultural sources added to social pool
  - [ ] All sources validate via pre-validation script
  - [ ] Social pool has ≥10 active sources (was 4)

  **QA Scenarios**:

  ```
  Scenario: Cultural sources fetch test
    Tool: Bash (bun)
    Steps:
      1. Run: bun run validate-source-urls --pool=social
      2. Verify: all sources return valid content
      3. Check: social pool active count ≥10
    Expected Result: Social pool expanded and validated
    Evidence: .sisyphus/evidence/task-12-cultural-sources.log
  ```

  **Commit**: YES
  - Message: `feat(sources): expand social and cultural pool`
  - Files: `config/sources.yml`

- [ ] 13. Build Reddit parser

  **What to do**:
  - Create `src/parsers/reddit.ts` that:
    - Imports existing `src/utils/reddit-api.ts`
    - Accepts a source config with `platform: reddit`, `subreddit`, `sort`, `limit`
    - Fetches posts from Reddit API using the existing utility
    - Transforms Reddit post JSON into IGS Article format:
      - `title` → post title
      - `url` → post permalink or external link
      - `content` → post selftext (if text post) or null
      - `published_at` → post created_utc
      - `source` → subreddit name
      - `author` → post author
      - `metadata` → { subreddit, score, num_comments, is_self, link_flair_text }
    - Handles pagination via `after` cursor for incremental fetching
    - Respects rate limits via centralized rate limiter (Task 5)
  - Create unit tests: `src/parsers/reddit.test.ts`

  **Must NOT do**:
  - Modify `src/utils/reddit-api.ts` unless it's broken (test first)
  - Fetch comments (posts only, not comment threads)
  - Hardcode subreddit names in parser

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `test-driven-development`
    - TDD: Write failing tests for Reddit→Article mapping first

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14, 15)
  - **Blocks**: Tasks 16, 18
  - **Blocked By**: Task 5

  **References**:
  - `src/utils/reddit-api.ts` - Existing Reddit utility
  - `src/types/article.ts` or equivalent - Article interface
  - `src/parsers/` - Existing parsers for pattern matching

  **Acceptance Criteria**:
  - [ ] `bun test src/parsers/reddit.test.ts` passes
  - [ ] Parser fetches and parses ≥3 subreddits with ≥95% success rate
  - [ ] Output matches Article interface exactly
  - [ ] Rate limiter is called before each API request

  **QA Scenarios**:

  ```
  Scenario: Reddit parser happy path
    Tool: Bun test
    Preconditions: Valid Reddit source config for r/worldnews
    Steps:
      1. Call: parseRedditSource({ subreddit: 'worldnews', sort: 'hot', limit: 5 })
      2. Verify: returns array of Article objects
      3. Verify: each Article has title, url, published_at, source, author
      4. Verify: metadata includes subreddit, score, num_comments
    Expected Result: 5 articles parsed successfully
    Evidence: .sisyphus/evidence/task-13-reddit-parser-pass.png

  Scenario: Reddit parser error handling
    Tool: Bun test
    Preconditions: Invalid subreddit name
    Steps:
      1. Call: parseRedditSource({ subreddit: 'nonexistent_xyz_12345', sort: 'hot', limit: 5 })
      2. Verify: returns empty array or throws with descriptive error
      3. Verify: does not crash the process
    Expected Result: Graceful handling of invalid subreddit
    Evidence: .sisyphus/evidence/task-13-reddit-parser-error.log
  ```

  **Commit**: YES
  - Message: `feat(parsers): add reddit parser with article mapping`
  - Files: `src/parsers/reddit.ts`, `src/parsers/reddit.test.ts`

---

- [ ] 14. Build Twitter API utility

  **What to do**:
  - Create `src/utils/twitter-api.ts` that:
    - Handles Twitter API v2 authentication (Bearer token from env var `TWITTER_BEARER_TOKEN`)
    - Method: `fetchUserTweets(handle, maxResults): Promise<Tweet[]>`
    - Method: `fetchUserByHandle(handle): Promise<User>`
    - Implements rate limit tracking and backoff
    - Uses centralized rate limiter (Task 5)
    - Handles API errors: rate limit (429), unauthorized (401), not found (404)
  - Export TypeScript interfaces for Tweet and User objects
  - Add environment variable documentation

  **CRITICAL PREREQUISITE**: Twitter API budget must be confirmed before starting this task. If budget is not available, this task and Task 15/17 should be deferred to Phase 2.

  **Must NOT do**:
  - Hardcode API credentials
  - Use Twitter API v1.1 (use v2 only)
  - Exceed free tier limits without budget confirmation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 15, 17
  - **Blocked By**: Task 5

  **References**:
  - `src/utils/reddit-api.ts` - Pattern for API utilities
  - Twitter API v2 docs: `https://developer.twitter.com/en/docs/twitter-api/tweets/timelines/api-reference/get-users-id-tweets`

  **Acceptance Criteria**:
  - [ ] Utility authenticates successfully with Bearer token
  - [ ] `fetchUserTweets()` returns array of Tweet objects
  - [ ] Rate limiter integration works
  - [ ] Error handling covers 401, 404, 429 status codes

  **QA Scenarios**:

  ```
  Scenario: Twitter utility fetch tweets
    Tool: Bun test (with mocked API if no token)
    Steps:
      1. Call: fetchUserTweets('ForeignPolicy', 10)
      2. Verify: returns array of 10 Tweet objects
      3. Verify: each Tweet has id, text, created_at, author_id
    Expected Result: Tweets fetched and structured correctly
    Evidence: .sisyphus/evidence/task-14-twitter-utility.log

  Scenario: Twitter utility rate limit
    Tool: Bun test
    Steps:
      1. Mock API to return 429 status with retry-after header
      2. Call: fetchUserTweets('test', 10)
      3. Verify: utility waits for retry-after period
      4. Verify: does not crash
    Expected Result: Graceful rate limit handling
    Evidence: .sisyphus/evidence/task-14-twitter-rate-limit.log
  ```

  **Commit**: YES
  - Message: `feat(utils): add twitter api v2 client`
  - Files: `src/utils/twitter-api.ts`, `.env.example`

---

- [ ] 15. Build Twitter parser

  **What to do**:
  - Create `src/parsers/twitter.ts` that:
    - Imports `src/utils/twitter-api.ts` (Task 14)
    - Accepts a source config with `platform: twitter`, `handle`
    - Fetches tweets via Twitter API utility
    - Transforms Tweet JSON into IGS Article format:
      - `title` → tweet text (first 100 chars + ellipsis if longer)
      - `url` → tweet permalink (https://twitter.com/{handle}/status/{id})
      - `content` → full tweet text
      - `published_at` → tweet created_at
      - `source` → Twitter handle
      - `author` → tweet author name
      - `metadata` → { handle, retweet_count, like_count, reply_count, is_retweet, is_reply }
    - Filters out retweets and replies (configurable via source flags)
    - Respects rate limits via centralized rate limiter
  - Create unit tests: `src/parsers/twitter.test.ts`

  **Must NOT do**:
  - Modify Twitter utility (use as-is from Task 14)
  - Hardcode handle names

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `test-driven-development`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 17, 18
  - **Blocked By**: Task 14

  **References**:
  - `src/utils/twitter-api.ts` - From Task 14
    - `src/parsers/reddit.ts` - Pattern from Task 13
    - `src/types/article.ts` - Article interface

  **Acceptance Criteria**:
  - [ ] `bun test src/parsers/twitter.test.ts` passes
  - [ ] Parser fetches and parses ≥3 accounts with ≥95% success rate
  - [ ] Output matches Article interface exactly
  - [ ] Retweets and replies are filtered based on source config

  **QA Scenarios**:

  ```
  Scenario: Twitter parser happy path
    Tool: Bun test
    Steps:
      1. Call: parseTwitterSource({ handle: 'ForeignPolicy', include_retweets: false, include_replies: false })
      2. Verify: returns array of Article objects
      3. Verify: each Article has title, url, published_at, source, author
      4. Verify: no retweets or replies in output
    Expected Result: Articles parsed successfully with filtering
    Evidence: .sisyphus/evidence/task-15-twitter-parser-pass.png

  Scenario: Twitter parser with retweets
    Tool: Bun test
    Steps:
      1. Call: parseTwitterSource({ handle: 'test', include_retweets: true })
      2. Verify: retweets are included when flag is true
    Expected Result: Configurable retweet inclusion
    Evidence: .sisyphus/evidence/task-15-twitter-retweets.log
  ```

  **Commit**: YES
  - Message: `feat(parsers): add twitter parser with article mapping`
  - Files: `src/parsers/twitter.ts`, `src/parsers/twitter.test.ts`

---

- [ ] 16. Add Reddit subreddit sources to sources.yml

  **What to do**:
  - Add 8-10 Reddit subreddit sources to `config/sources.yml`:
    - r/worldnews (Tier 3)
    - r/geopolitics (Tier 3)
    - r/politics (Tier 3)
    - r/economics (Tier 3)
    - r/MiddleEast (Tier 3)
    - r/europe (Tier 3)
    - r/india (Tier 3) - if not already present
    - r/technology (Tier 3) - check for overlap with Tech pool
  - Set `platform: reddit`, `parser: reddit`, `pool: appropriate`
  - Set `rate_limit: { interval_seconds: 300, batch_size: 25 }`
  - Set `sort: hot`, `limit: 25`
  - Set `tier: 3` for all
  - Run pre-validation script to test Reddit API connectivity

  **Must NOT do**:
  - Add subreddits that violate Reddit ToS or are quarantined/banned
  - Set rate limits that exceed Reddit API limits

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14, 15, 17)
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 1, 6, 13

  **References**:
  - `config/sources.yml` - Existing source format
  - `src/parsers/reddit.ts` - From Task 13

  **Acceptance Criteria**:
  - [ ] 8-10 Reddit sources added to sources.yml
  - [ ] All sources pass YAML validator
  - [ ] Reddit API connectivity verified for each subreddit
  - [ ] Rate limits configured correctly

  **QA Scenarios**:

  ```
  Scenario: Reddit sources validation
    Tool: Bash (bun)
    Steps:
      1. Run: bun run validate:sources
      2. Verify: all Reddit sources pass validation
      3. Run: bun run validate-source-urls --platform=reddit
      4. Verify: Reddit API returns valid data for each subreddit
    Expected Result: All Reddit sources configured and validated
    Evidence: .sisyphus/evidence/task-16-reddit-sources.log
  ```

  **Commit**: YES
  - Message: `feat(sources): add reddit subreddit sources`
  - Files: `config/sources.yml`

---

- [ ] 17. Add Twitter/X account sources to sources.yml

  **What to do**:
  - Add 5-8 Twitter account sources to `config/sources.yml`:
    - @ForeignPolicy (Tier 2)
    - @Nidhi (Tier 3)
    - @praffulgarg97 (Tier 3)
    - @mehdirhasan (Tier 3)
    - @allenanalysis (Tier 3)
    - @TheEconomist (Tier 2) - if not duplicating RSS
    - @BBCWorld (Tier 2) - if not duplicating RSS
  - Set `platform: twitter`, `parser: twitter`, `pool: appropriate`
  - Set `rate_limit: { interval_seconds: 900, batch_size: 50 }`
  - Set `include_retweets: false`, `include_replies: false`
  - Set `tier: 2` for major outlets, `tier: 3` for individual analysts

  **CRITICAL**: Only proceed if Twitter API budget is confirmed. If deferred, mark task as blocked and skip.

  **Must NOT do**:
  - Add accounts that duplicate RSS sources unless explicitly desired
  - Set rate limits that exceed API tier budget

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 1, 6, 15

  **References**:
  - `config/sources.yml` - Existing source format
  - `src/parsers/twitter.ts` - From Task 15

  **Acceptance Criteria**:
  - [ ] 5-8 Twitter sources added to sources.yml
  - [ ] All sources pass YAML validator
  - [ ] Twitter API connectivity verified (if budget available)

  **QA Scenarios**:

  ```
  Scenario: Twitter sources validation
    Tool: Bash (bun)
    Steps:
      1. Run: bun run validate:sources
      2. Verify: all Twitter sources pass validation
      3. If API budget available: run bun run validate-source-urls --platform=twitter
      4. Verify: Twitter API returns valid data
    Expected Result: All Twitter sources configured and validated
    Evidence: .sisyphus/evidence/task-17-twitter-sources.log
  ```

  **Commit**: YES
  - Message: `feat(sources): add twitter/x account sources`
  - Files: `config/sources.yml`

---

- [ ] 18. Integrate social parsers into fetch pipeline

  **What to do**:
  - Update the main fetch pipeline to route sources based on `platform` field:
    - If `platform == 'reddit'` or `platform == 'twitter'`: skip URL fetch, use parser directly
    - If `platform` is undefined or `'rss'`: use existing URL fetch → parser flow
  - Update `src/fetcher.ts` or equivalent to:
    - Import Reddit and Twitter parsers
    - Check `source.platform` before fetching
    - Call appropriate parser for social sources
    - Pass parsed articles through existing store/filter pipeline
  - Ensure social media articles are tagged with platform in metadata

  **Must NOT do**:
  - Break existing RSS fetch flow
  - Skip existing validation/filtering steps for social articles

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: NO (integration task, depends on both parsers)
  - **Parallel Group**: Sequential
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 13, 15

  **References**:
  - `src/fetcher.ts` or main fetch orchestrator
  - `src/parsers/reddit.ts` - From Task 13
  - `src/parsers/twitter.ts` - From Task 15

  **Acceptance Criteria**:
  - [ ] Reddit sources are fetched via Reddit parser, not URL fetcher
  - [ ] Twitter sources are fetched via Twitter parser, not URL fetcher
  - [ ] RSS sources continue to use existing fetch flow
  - [ ] All articles flow through same store/filter pipeline

  **QA Scenarios**:

  ```
  Scenario: Pipeline integration
    Tool: Bun test or Bash (bun)
    Steps:
      1. Trigger fetch for 1 Reddit source + 1 RSS source + 1 Twitter source
      2. Verify: Reddit source uses reddit parser
      3. Verify: RSS source uses existing fetcher
      4. Verify: Twitter source uses twitter parser
      5. Verify: all 3 produce Article objects in same format
    Expected Result: Pipeline correctly routes by platform
    Evidence: .sisyphus/evidence/task-18-pipeline-integration.log
  ```

  **Commit**: YES
  - Message: `feat(pipeline): integrate social media parsers into fetch flow`
  - Files: `src/fetcher.ts` or equivalent

- [ ] 19. Build source health monitoring script

  **What to do**:
  - Create `scripts/monitor-source-health.ts` that:
    - Runs periodically (designed for cron job)
    - Checks all active sources: attempts fetch, measures response time, validates parse output
    - Categorizes sources as: HEALTHY, DEGRADED (slow/errors), BROKEN (consistent failures)
    - Outputs structured report: JSON or markdown
    - Alerts on new failures (compares to previous run state)
    - Tracks historical health trends
    - Optionally auto-deactivates consistently broken sources (with flag)
  - Store health state in `data/source-health.json` or similar
  - Add `bun run monitor:sources` script to package.json

  **Must NOT do**:
  - Build a web dashboard (output to CLI/files only)
  - Auto-deactivate without explicit flag (default: report only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 20, 21, 22)
  - **Blocks**: Task 20 (uses monitor for validation)
  - **Blocked By**: None

  **References**:
  - `scripts/validate-source-urls.ts` - From Task 4
  - `src/utils/fetcher.ts` - Fetch patterns

  **Acceptance Criteria**:
  - [ ] Script runs without errors: `bun run monitor:sources`
  - [ ] Script checks all active sources and produces report
  - [ ] Report categorizes sources correctly
  - [ ] Historical state is tracked between runs

  **QA Scenarios**:

  ```
  Scenario: Health monitor run
    Tool: Bash (bun)
    Steps:
      1. Run: bun run monitor:sources
      2. Verify: completes without errors
      3. Verify: outputs report with source counts
      4. Verify: report saved to data/source-health.json
    Expected Result: Health monitor runs and reports status
    Evidence: .sisyphus/evidence/task-19-health-monitor.log

  Scenario: Health monitor detects failure
    Tool: Bash (bun)
    Steps:
      1. Temporarily modify a source URL to invalid endpoint
      2. Run: bun run monitor:sources
      3. Verify: report flags the source as BROKEN
      4. Restore original URL
      5. Run again: verify source returns to HEALTHY
    Expected Result: Monitor detects and tracks failures
    Evidence: .sisyphus/evidence/task-19-health-detect.log
  ```

  **Commit**: YES
  - Message: `feat(monitoring): add source health monitor script`
  - Files: `scripts/monitor-source-health.ts`, `package.json`

---

- [ ] 20. Run full source validation suite across all 370+ sources

  **What to do**:
  - Run `bun run validate-source-urls --all` on all sources (existing + new)
  - Run `bun run monitor:sources` to check health
  - Generate comprehensive report:
    - Total sources: expected 370+
    - Active sources: expected 350+
    - New pool source counts
    - Failed sources: identify and fix or document
    - Response time statistics
  - Fix any critical failures (broken URLs, parser errors)
  - Document any known issues (paywalled feeds, geo-blocked sources)

  **Must NOT do**:
  - Skip validation for "trusted" sources
  - Hide failures without documentation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: NO (final validation gate)
  - **Parallel Group**: Sequential
  - **Blocks**: Tasks 21, 22
  - **Blocked By**: Tasks 7-12, 16-17, 18, 19

  **Acceptance Criteria**:
  - [ ] Full validation report generated
  - [ ] ≥90% of all sources pass validation
  - [ ] Zero regression on original 309 sources
  - [ ] All new pools have ≥6 active sources
  - [ ] Known issues documented

  **QA Scenarios**:

  ```
  Scenario: Full validation suite
    Tool: Bash (bun)
    Steps:
      1. Run: bun run validate-source-urls --all
      2. Run: bun run monitor:sources
      3. Verify: total source count ≥370
      4. Verify: active source count ≥350
      5. Verify: failure rate ≤10%
    Expected Result: System-wide validation passes
    Evidence: .sisyphus/evidence/task-20-full-validation.log
  ```

  **Commit**: YES (only if fixes made)

---

- [ ] 21. Update project documentation

  **What to do**:
  - Update `README.md` or project docs to reflect:
    - New pools (health, science, environment, defense)
    - Social media source support (Reddit, Twitter)
    - Source quality tiering system
    - Health monitoring usage
    - Updated source count statistics
  - Update `docs/source-schema.md` with new fields (platform, tier, rate_limit)
  - Update `docs/pools.md` with new pool descriptions
  - Add `docs/social-media-setup.md` with Reddit/Twitter configuration guide
  - Update any architecture diagrams

  **Must NOT do**:
  - Write duplicate documentation (reference existing docs)
  - Document features not yet implemented

  **Recommended Agent Profile**:
  - **Category**: `writing`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: Task 20

  **Acceptance Criteria**:
  - [ ] README reflects new pool count (18 pools)
  - [ ] Source schema docs updated
  - [ ] Social media setup guide created
  - [ ] No broken internal links

  **QA Scenarios**:

  ```
  Scenario: Documentation check
    Tool: Bash (grep)
    Steps:
      1. Verify: grep -c "health" README.md ≥1
      2. Verify: grep -c "reddit" docs/social-media-setup.md ≥1
      3. Verify: grep -c "tier" docs/source-schema.md ≥1
    Expected Result: Documentation updated comprehensively
    Evidence: .sisyphus/evidence/task-21-docs.log
  ```

  **Commit**: YES
  - Message: `docs: update documentation for source expansion`
  - Files: `README.md`, `docs/*.md`

---

- [ ] 22. Performance test - verify queue handling under full load

  **What to do**:
  - Run a simulated full fetch cycle with all 370+ sources
  - Measure:
    - Total fetch time
    - Queue depth over time
    - Memory usage
    - Rate limiter effectiveness
    - Parser throughput (articles/second)
  - Verify queue does not back up beyond 2x polling interval
  - Identify bottlenecks and document
  - If issues found, tune rate limits or batch sizes

  **Must NOT do**:
  - Run tests against production environment
  - Skip performance measurement for "small" changes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: Task 20

  **Acceptance Criteria**:
  - [ ] Full fetch cycle completes without crashes
  - [ ] Queue depth stays within acceptable bounds
  - [ ] Performance report generated
  - [ ] No memory leaks detected

  **QA Scenarios**:

  ```
  Scenario: Full load performance test
    Tool: Bash (bun)
    Steps:
      1. Run: bun run test:performance --full-fetch
      2. Verify: completes without errors
      3. Verify: queue depth never exceeds 2x polling interval
      4. Verify: memory usage stable
    Expected Result: System handles full load gracefully
    Evidence: .sisyphus/evidence/task-22-performance.log
  ```

  **Commit**: YES (only if tuning changes made)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1:** `feat(schema): add platform, tier, and rate_limit fields` + `feat(pools): add health, science, environment, defense pools` + `feat(utils): add pre-validation and rate limiter`
- **Wave 2:** `feat(sources): add health pool sources` + `feat(sources): add science pool sources` + `feat(sources): add environment pool sources` + `feat(sources): add defense pool sources` + `feat(sources): reactivate international legal bodies` + `feat(sources): expand cultural coverage`
- **Wave 3:** `feat(parsers): add reddit parser` + `feat(utils): add twitter api client` + `feat(parsers): add twitter parser` + `feat(sources): add reddit subreddits` + `feat(sources): add twitter accounts` + `feat(pipeline): integrate social media parsers`
- **Wave 4:** `feat(monitoring): add source health monitor` + `test(validation): full source validation suite` + `docs: update source expansion documentation` + `test(performance): verify queue handling`

---

## Success Criteria

### Verification Commands
```bash
# Schema validation
bun run validate:sources

# All tests pass
bun test

# Health monitor runs without errors
bun run monitor:sources

# Reddit parser test
bun test src/parsers/reddit.test.ts

# Twitter parser test (if API key available)
bun test src/parsers/twitter.test.ts

# Full source count
cat config/sources.yml | grep "^\- name:" | wc -l  # Expected: 370+

# Active source count
cat config/sources.yml | grep "active: true" | wc -l  # Expected: 350+
```

### Final Checklist
- [ ] All 4 new pools have ≥8 active sources each
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Zero regression on existing 309 sources
- [ ] Reddit parser fetches ≥3 subreddits successfully
- [ ] Twitter parser fetches ≥3 accounts successfully (if budget confirmed)
- [ ] Source health monitor runs and reports status
- [ ] All evidence files present in `.sisyphus/evidence/`
- [ ] Documentation updated with new pools and source types

---

## Risk Matrix

| Risk | Severity | Probability | Mitigation |
|---|---|---|---|
| Twitter API cost unknown | Critical | High | Gate Task 14/15/17 behind budget confirmation |
| Academic RSS feeds paywalled/broken | High | Medium | Pre-test all feeds in Task 4; design for partial content |
| Social media volume overwhelms system | High | Medium | Strict rate-limit per source (Task 5); separate queue |
| Reddit API utility out of date | Medium | Medium | Test before integration (Task 13); rewrite if needed |
| Scope creep (NLP, backfill, monitoring UI) | Medium | High | Guardrails in "Must NOT Have"; enforce in review |
| Existing source breakage (silent failures) | Medium | High | Health monitor (Task 19) catches these |
| No dedup for 2x content volume | Medium | High | Document as known gap; future plan |

---

## Notes

### Twitter API Budget Prerequisite
**CRITICAL**: Twitter/X integration (Tasks 14, 15, 17) is gated behind confirming API budget. The free tier (1,500 tweets/month) is insufficient for 5+ accounts. Options:
- **Basic ($100/month):** 10,000 tweets/month - viable for 5 accounts at conservative polling
- **Pro ($5,000/month):** 100,000+ tweets/month - comfortable headroom

**Decision needed before Wave 3**: Confirm Twitter API tier budget, or defer Twitter integration to Phase 2.

### Source Quality Tiers
- **Tier 1 (Primary):** Official government bodies, international organizations, peer-reviewed journals (CDC, ICJ, WHO, IPCC)
- **Tier 2 (Major):** Established news outlets, major think tanks, reputable NGOs (BMJ, Carbon Brief, RAND, HRW)
- **Tier 3 (Social/Alternative):** Social media, blogs, aggregators (Reddit, Twitter, Live Science)

Tier controls: dedup priority, summarization inclusion, alert urgency.

### Academic Journal RSS Caveats
BMJ, Lancet, NEJM, and JAMA RSS feeds typically provide headlines + abstracts only. Full article content requires subscription. Parser must handle partial content gracefully and tag with `partial_content: true` in metadata.

### Rate Limits (Enforced)
- **Reddit:** Max 60 req/min aggregate across all subreddits. Per-subreddit: 1 fetch / 5 minutes.
- **Twitter:** Dependent on API tier. At Basic tier: 5 accounts × 1 fetch / 15 minutes.
- **RSS feeds:** Existing rate limits unchanged (typically 1 fetch / 15 minutes).
