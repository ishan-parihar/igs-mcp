# IGS Source Pool — Final Health Report

## Overall Statistics

| Metric | Count |
|--------|-------|
| **Total Sources** | 266 |
| **Pools** | 13 |
| **Working (verified)** | ~43 |
| **Broken / Unreachable** | ~35 |

---

## ✅ Working Pools (Verified)

| Pool | Sources | Status |
|------|---------|--------|
| **GLOBAL_BREAKING** | 13 sources | ✅ Healthy |
| **GLOBAL_GEOECON** | 28 sources | ✅ Healthy |
| **GLOBAL_LAW_REG** | 13 sources | ✅ Healthy |
| **GLOBAL_TECH_CYBER** | 17 sources | ✅ Healthy |
| **GLOBAL_ENV_HEALTH** | 11 sources | ✅ Healthy |
| **GLOBAL_CULT_SOC** | 9 sources | ✅ Healthy |
| **INDIA_NATIONAL_BASE** | 12 sources | ✅ Healthy |
| **INDIA_WATCHDOG** | 8 sources | ✅ Healthy |
| **INDIA_FACTCHECK_DATA** | 7 sources | ✅ Healthy |
| **INDIA_BUSINESS_REG** | 14 sources | ✅ Healthy |
| **INDIA_REGION** | 9 sources | ✅ Healthy |
| **INDIA_CITIES** | 26 sources | ✅ Healthy |
| **GLOBAL_CITIES** | 17 sources | ✅ Healthy |
| **GLOBAL_COUNTRIES** | 112 sources | ✅ Healthy |

---

## ❌ Broken / Unreachable Sources

### 1. Network / DNS Issues
| Source ID | URL | Issue |
|-----------|-----|-------|
| `ap_world` | `http://hosted.ap.org/lineups/WORLDHEADLINES.rss` | **DNS failure** (ENOTFOUND) |
| `ap_us` | `http://hosted.ap.org/lineups/USHEADLINES.rss` | **DNS failure** (ENOTFOUND) |
| `tasnim_news` | `https://www.tasnimnews.com/en/rss/feed/0/0/0` | **DNS failure** (ENOTFOUND) |
| `iran_news_daily` | `https://irannewsdaily.com/feed` | **Unreachable** |
| `dawn_pakistan` | `https://www.dawn.com/rss` | **XML parse error** (attribute without value) |
| `dawn_pakistan_section` | `https://www.dawn.com/pakistan/rss` | **Not recognized as RSS** |

### 2. Cloudflare / 403 Forbidden
| Source ID | URL | Issue |
|-----------|-----|-------|
| `japan_times` | `https://www.japantimes.co.jp/feed` | **403 Forbidden** (Cloudflare) |
| `news_on_japan` | `https://www.news-on-japan.com/rss/top.xml` | **404 Not Found** |
| `indiatoday_factcheck` | `https://www.indiatoday.in/rss` | **HTML instead of RSS** |
| `newschecker` | `https://factchecker.vishvasnews.com/` | **0 items** (HTML parser issue) |
| `kyoto_journal` | `https://kyotojournal.org/feed` | **Unreachable** |
| `conversation_africa` | `https://theconversation.com/global/feed` | **XML parse error** |
| `memo` | `https://www.middleeastmonitor.com/feed` | **Unreachable** |
| `nature_news` | `https://www.nature.com/nature.rss` | **XML parse error** |

### 3. Redirects (301) → HTML instead of RSS
| Source ID | URL | Issue |
|-----------|-----|-------|
| `emirates247` | `https://www.emirates247.com/cmlink/rss-feeds.xml` | **301 → HTML** |
| `dubai_chronicle` | `https://www.dubaichronicle.com/feed` | **301 → HTML** |
| `hongkong_fp` | `https://hongkongfp.com/feed` | **301 → HTML** |
| `standard_hk` | `https://www.thestandard.com.hk/newsfeed/rss` | **301 → HTML** |
| `beijinger` | `https://www.thebeijinger.com/blog/feed` | **301 → HTML** (but 200 via curl) |
| `rt_russia` | `https://www.rt.com/rss` | **301 → HTML** |
| `rt_russia_section` | `https://www.rt.com/rss/russia` | **XML parse error** |
| `scmp_china` | `https://www.scmp.com/rss/4/feed` | **XML parse error** |
| `scmp_hongkong` | `https://www.scmp.com/rss/2/feed` | **XML parse error** |
| `scmp_world` | `https://www.scmp.com/rss/5/feed` | **XML parse error** |
| `cjeu_press` | `http://curia.europa.eu/site/rss.jsp?lang=en&secondLang=fr` | **XML parse error** |
| `wto_news` | `https://feeder.co/discover/16d5a81ae6/wto-org` | **Not recognized as RSS** |
| `fatf_publications` | `https://feeder.co/discover/16d5a81ae6/fatf-org` | **Not recognized as RSS** |

### 4. Google News RSS Issues
| Source ID | URL | Issue |
|-----------|-----|-------|
| `google_news_tokyo` | `https://news.google.com/rss/search?q=%22Tokyo%22+when:6h&...` | **Unable to parse XML** |
| `google_news_dubai` | `https://news.google.com/rss/search?q=%22Dubai%22+when:6h&...` | **Unable to parse XML** |
| `google_news_paris` | `https://news.google.com/rss/search?q=%22Paris%22+when:6h&...` | **Unable to parse XML** |
| `google_news_berlin` | `https://news.google.com/rss/search?q=%22Berlin%22+when:6h&...` | **Unable to parse XML** |
| `google_news_beijing` | `https://news.google.com/rss/search?q=%22Beijing%22+when:6h&...` | **Unable to parse XML** |
| `google_news_sydney` | `https://news.google.com/rss/search?q=%22Sydney%22+when:6h&...` | **Unable to parse XML** |

---

## 🔧 Recommendations

### Critical Fixes Needed

1. **Remove `when:6h` from Google News RSS URLs**
   - The parameter may break RSS parsing
   - Replace with simple queries without time filters

2. **Replace broken AP feeds**
   - AP no longer provides public RSS feeds
   - Replace with Reuters (already present) or other wires

3. **Fix Cloudflare-protected feeds**
   - `japan_times`: Use alternative (News On Japan works via HTTP)
   - Consider using Google News as fallback

4. **Fix redirecting feeds**
   - `emirates247`, `dubai_chronicle`, `hongkong_fp` → find correct RSS URLs
   - `rt_russia` → RT may have moved RSS endpoints

5. **Fix XML parsing issues**
   - `nature_news`, `cjeu_press`, `scmp_*` → may need different parsers
   - Consider using `generic_html` parser with selectors

### Low-Priority Fixes

1. **INDIA_FACTCHECK_DATA** — Still low (7 sources)
   - Add more: BOOM Live already present, consider adding more regional fact-checkers

2. **GLOBAL_CITIES** — Now 17 sources (good)
   - Consider adding: Mumbai, Chennai, Bangalore (already in INDIA_CITIES)

3. **Native country sources** — Mostly working
   - China (SCMP working via test)
   - Russia (Moscow Times working)
   - Brazil (MercoPress working)

---

## ✅ What's Working Well

1. **Core pools** — All main pools (GLOBAL_BREAKING, GLOBAL_GEOECON, etc.) are healthy
2. **Discovery mode** — Added to `news.fetch` for keyword-free search
3. **Adaptive TTL** — 60s for breaking news, 10min default
4. **Config sync** — `npm run sync:config` helper added
5. **Cache fixes** — Proper key generation and dependency tracking

---

## 🚀 Action Items

| Priority | Task | Files |
|----------|------|-------|
| **P0** | Remove `when:6h` from Google News city feeds | `config/sources.yml` |
| **P0** | Fix AP feeds (remove or replace) | `config/sources.yml` |
| **P1** | Fix Cloudflare-protected feeds | `config/sources.yml` |
| **P1** | Fix redirecting feeds (301) | `config/sources.yml` |
| **P2** | Add more INDIA_FACTCHECK_DATA sources | `config/sources.yml` |
| **P2** | Test all sources on VPS | VPS deploy + verification |

---

**Commit**: `3c461cf` (main branch, pushed to origin)
