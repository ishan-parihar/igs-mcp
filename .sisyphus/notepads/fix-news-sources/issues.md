# Issues & Summary

## Task: Fix all 34 broken sources in config/sources.yml

### Date: 2026-05-02

### Changes Applied

#### Group A: 17 The Hindu city feeds → State-level feeds
All 17 entries re-targeted from city-level RSS (404) to state-level RSS.
- 16/17 new state feeds verified working by test_all_sources.ts
- `the_hindu_jammu_kashmir` still failing (feed returns 0 items) - may need alternate URL
- 6 northeast states (Tripura, Meghalaya, Manipur, Mizoram, Arunachal Pradesh, Nagaland) use "other-states" feed since The Hindu doesn't have individual state feeds for them

#### Group B: Typo fix
- `google_news_cairom` → `google_news_cairo`

#### Group C1: Deactivated (is_active: false)
| Source | Reason |
|--------|--------|
| article14 | Domain doesn't exist |
| caravan | 404 not found |
| the_news_minute | 404 not found |
| hbr | 504 server blocks |
| ie_news | 403 IEA blocks scraping |
| brazil_news | Domain dead |
| mca_notifications | 403 blocks |

#### Group C2: URL/Parser fixes
| Source | Fix | Status |
|--------|-----|--------|
| china_daily | Changed to https URL | Still failing (304/network) |
| world_bank | Changed to /news/rss | Still failing (304/network) |
| imf_news | Changed Rss → RSS | Still failing (0 items) |
| us_state_dept | Changed to state.gov/feed/ | Still failing (0 items) |
| ussf_cfc | Switched to Google News RSS | Still failing (0 items) |
| boom_live | Switched to RSS | Still failing (0 items) |
| idsa | Switched to RSS (idsa.in/rss/news) | Still failing (0 items) |
| bar_and_bench | Switched to RSS | Still failing (0 items) |
| nse_circulars | New API URL + selectors | Still failing (timeout) |
| rbi_notifications | Switched to RSS (rbi.org.in/rss/rssmain.aspx) | Still failing (0 items) |

### Key Observations
1. The test script (`scripts/test_all_sources.ts`) loads from `~/.config/igs-mcp/sources.yml`, not from `config/sources.yml` directly
2. After bootstrapping, changes to `config/sources.yml` only propagate to user config via `mergeMissingDefaultSources()` which adds NEW sources but doesn't update or remove old ones
3. Several replaced URLs still fail in tests - these may need further investigation (the RSS feeds might have different response patterns)
4. `google_news_cairom` still appears in user config (legacy entry) alongside new `google_news_cairo`
5. The 17 old city-level The Hindu entries still exist in user config until manually cleaned up

### Next Steps
- Sync `config/sources.yml` → `~/.config/igs-mcp/sources.yml` to pick up all changes
- Investigate why some RSS replacements still return 0 items (e.g., idsa, imf, us_state_dept)
- The `the_hindu_jammu_kashmir` feed may need verification against actual feed URL
- Clean up legacy city-level entries from user config
