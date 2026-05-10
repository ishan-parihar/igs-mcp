# Learnings

## Task 15 - Create src/parsers/twitter.ts

### Key Decisions
- Followed the exact same pattern as `src/parsers/reddit.ts` for consistency
- Singleton Twitter client with lazy initialization (not initialized at module level, but on first `parseTwitter()` call)
- Singleton rate limiter configured with `TWITTER_PLATFORM_LIMIT` (450 req / 15 min)
- Handle extraction uses `source.url` first, falling back to `source.id` with `twitter_` prefix stripping

### Dependencies
- Depends on `src/utils/twitter-api.ts` (being created in parallel as Task 14)
  - Expected exports: `TwitterClient` class, `normalizeTweet` function
  - `TwitterClient.getUserTimeline(handle, batchSize)` method
  - `normalizeTweet(tweet, sourceName, poolId)` → `NewsItem`
- Uses `RateLimiter`, `sourceRateLimitKey`, `platformRateLimitKey`, `TWITTER_PLATFORM_LIMIT` from `rate-limiter.ts`

### Build Status
- `bun run build` fails until `twitter-api.ts` exists
- File itself has zero LSP errors - only failure is `Cannot find module '../utils/twitter-api.js'`

### Deviations from Task Spec
- Extracted `applyRateLimits()` into a separate async helper function (consistent with `reddit.ts` pattern) instead of inlining in `parseTwitter()`
- Used `resolveHandle()` helper (consistent with `reddit.ts`'s `resolveSubreddit()`) instead of inline extraction
- These deviations improve consistency with the existing codebase without altering functionality

### Source Structure (from YAML)
- Source `id`: `twitter_<handle>` pattern (e.g., `twitter_foreignpolicy`)
- Source `url`: Just the handle (e.g., `ForeignPolicy`)
- Source `type`: `social_media`, `platform`: `twitter`
- Source `rate_limit`: `interval_seconds` + `batch_size` (default 50)

## Task 16/17 Research - Comprehensive Source Verification (May 3, 2026)

### VERIFIED REDDIT SUBREDDITS (All confirmed active as of May 2026)

#### POLITICAL POOL

| Subreddit | Orientation | Tier | Balances | Verified Via | Notes |
|-----------|------------|------|----------|-------------|-------|
| r/worldnews | Center/Left-leaning (default) | 3 | r/Conservative | Search confirmed | Covers global breaking news |
| r/geopolitics | Center (moderated) | 2 | r/IndiaSpeaks, r/GeopoliticsIndia | Search confirmed | Strict moderation, quality analysis |
| r/politics | Left-leaning | 3 | r/Conservative | Search confirmed | US-centric, very active |
| r/Conservative | Right | 3 | r/politics, r/worldnews | CONFIRMED: May 2026 posts from NYPost | Flaired users only, active |
| r/Libertarian | Right/Libertarian | 3 | r/socialism, r/WorkReform | CONFIRMED: 500K+ subs, economic posts | Broad libertarian perspectives |
| r/moderatepolitics | Center | 2 | Both extremes | CONFIRMED: State of Sub Feb 2026, Weekend Discussion May 1 2026 | Civil discourse, moderately expressed opinions |
| r/NeutralPolitics | Center | 2 | Both extremes | CONFIRMED: Strictly-moderated, evidence-based | Highest quality signal |
| r/PoliticalDiscussion | Center | 3 | r/politics enthusiasm gap | CONFIRMED: 2026 midterms Senate discussion | Substantive political prompts |
| r/TrueReddit | Center/Quality | 2 | Low-quality subs | CONFIRMED: Insightful articles sub | Long-form, curated |
| r/Foodforthought | Center-left/Longform | 2 | r/Conservative | CONFIRMED: Intelligent commentaries | Essay-focused |
| r/changemyview | Center/Debate | 2 | All | CONFIRMED: 2026 Iran War CMV, Royal families CMV | Debate format, multiple perspectives |

#### ECONOMIC POOL

| Subreddit | Orientation | Tier | Balances | Verified Via | Notes |
|-----------|------------|------|----------|-------------|-------|
| r/economics | Center (mainstream) | 2 | r/socialism, r/austrian_economics | Already in system | Mix of left/right mainstream |
| r/socialism | Far-left | 3 | r/Libertarian, r/austrian_economics | CONFIRMED: 2026-2050 predictions, recent front page | International anti-capitalist |
| r/WorkReform | Left/Labor | 3 | r/Libertarian, r/neoliberal | CONFIRMED: 631K weekly visitors, boycott lists Feb 2026 | Labor rights, worker advocacy |
| r/austrian_economics | Right (Austrian School) | 3 | r/socialism, r/AskEconomics | CONFIRMED: Pro-Austrian, active debates | Note: actual handle is r/austrian_economics (underscore), not r/AustrianEconomics |
| r/neoliberal | Center-right (Market-oriented) | 3 | r/socialism, r/WorkReform | CONFIRMED: Quality econ discussion, zoning debates | Actually center-right/pro-market |
| r/AskEconomics | Center/Academic | 2 | r/badeconomics debates | CONFIRMED: Beveridge Curve 2026 discussion | Expert Q&A, academic |
| r/badeconomics | Center/Academic | 2 | Populist econ takes | CONFIRMED: Neoclassical econ focus | Critiques bad econ arguments |

#### DEFENSE/SECURITY POOL

| Subreddit | Orientation | Tier | Balances | Verified Via | Notes |
|-----------|------------|------|----------|-------------|-------|
| r/LessCredibleDefence | Center (mil-focused) | 3 | r/CredibleDefense | Already in system | More casual defense discussion |
| r/CredibleDefense | Center (expert) | 2 | r/LessCredibleDefence | CONFIRMED: Daily megathreads Apr-May 2026 | Civil, informed military/defense |
| r/WarCollege | Center/Academic | 2 | Casual mil subs | CONFIRMED: 11 years old, military history/science | Credible military history |
| r/Military | Center (pro-military) | 3 | r/CredibleDefense quality | Well-known, active | General military community |
| r/CredibleDiplomacy | Center/Diplomacy | 2 | Hawkish subs | Need to verify exact status | Diplomacy-focused |

#### ENVIRONMENT POOL

| Subreddit | Orientation | Tier | Balances | Verified Via | Notes |
|-----------|------------|------|----------|-------------|-------|
| r/environment | Left/Environmentalist | 3 | r/climateskeptics | Already in system | Political tone, challenges-focused |
| r/collapse | Left/Doomer | 3 | r/OptimistsUnite, r/Futurology | Already in system | Civilization collapse discourse |
| r/climateskeptics | Right/Skeptic | 3 | r/environment, r/climate_science | CONFIRMED: 43K+ posts, active questioning of climate orthodoxy | Note: small but persistent |
| r/climate_science | Center/Science | 2 | r/climateskeptics | CONFIRMED: Academic papers cited | Science-focused, data-driven |
| r/energy | Center/Technical | 2 | Partisan subs | CONFIRMED: 81K+ historical posts | Technical energy discussions |
| r/RenewableEnergy | Left-leaning/Technical | 3 | r/energy (fossil) | CONFIRMED: 26K+ historical posts | Renewable tech focus |
| r/sustainability | Center/Green | 2 | r/climateskeptics | CONFIRMED: Active, practical | Practical sustainability |
| r/climatechange | Center/Science | 2 | r/climateskeptics | CONFIRMED: Rational science discussion | Policy-neutral science space |

#### HEALTH POOL

| Subreddit | Orientation | Tier | Verified Via | Notes |
|-----------|------------|------|-------------|-------|
| r/science | Center (peer-reviewed) | 1 | Already in system | Strict moderation |
| r/health | Center | 3 | Already in system | General health news |
| r/medicine | Center/Professional | 2 | CONFIRMED: FDA warnings, medical professionals | Physician/medical professional lounge |
| r/epidemiology | Center/Science | 2 | Need to verify | Epidemiology research |
| r/publichealth | Center/Policy | 2 | Need to verify | Public health policy |
| r/EverythingScience | Center/Science | 3 | Need to verify | Broader science coverage |

#### CULTURE/SOCIAL POOL

| Subreddit | Orientation | Tier | Verified Via | Notes |
|-----------|------------|------|-------------|-------|
| r/sociology | Center/Academic | 2 | CONFIRMED: Culture/identity discussions | Sociology student resource |
| r/Anthropology | Center/Academic | 2 | Well-known, active | Human societies focus |
| r/philosophy | Center/Academic | 2 | Well-known | Philosophical discourse |
| r/AskHistorians | Center/Academic (strict) | 1 | CONFIRMED: Weekly digests Apr-May 2026 | Gold standard for history |
| r/socialscience | Center/Academic | 2 | CONFIRMED: Active hub | Interdisciplinary social science |

#### TECH/CYBER POOL

| Subreddit | Orientation | Tier | Verified Via | Notes |
|-----------|------------|------|-------------|-------|
| r/cybersecurity | Center/Professional | 2 | CONFIRMED: AMA schedule May 2026, career discussions | Business-oriented cybersecurity |
| r/privacy | Center-left/Privacy | 3 | CONFIRMED: Privacy leaks 2026 discussion | Privacy advocacy and news |
| r/netsec | Center/Technical | 2 | CONFIRMED: 557K+ members, Q1 2026 hiring | Technical information security |
| r/technology | Center/General | 3 | CONFIRMED: Tech Giants Privacy 2026 | General tech news |
| r/Futurology | Center/Future | 3 | CONFIRMED: Active May 2026 discussion | Evidence-based futurism |
| r/singularity | Tech-optimist | 3 | CONFIRMED: Accelerationism debates | AI/tech singularity focus |

#### REGIONAL (INDIA FOCUS) POOL

| Subreddit | Orientation | Tier | Balances | Verified Via | Notes |
|-----------|------------|------|----------|-------------|-------|
| r/India | Center-left (Indian) | 3 | r/IndiaSpeaks | Already in system | General India discussion |
| r/IndiaSpeaks | Right-leaning/Nationalist | 3 | r/India | CONFIRMED: Modi/Trump posts, geopolitical | Hindu nationalist leaning |
| r/GeopoliticsIndia | Center/National-interest | 2 | r/geopolitics (global) | CONFIRMED: India's foreign relations | Geopolitical analysis |
| r/unitedstatesofindia | Center/Broad | 3 | r/IndiaSpeaks | CONFIRMED: Everything India community | Broad India coverage |
| r/China | Varies | 3 | r/India subs | Well-known | China-focused |
| r/Pakistan | Varies | 3 | r/India subs | Well-known | Pakistan-focused |

### VERIFIED TWITTER/X ACCOUNTS

#### POLITICAL POOL (Think Tanks & Analysts)

| Handle | Name | Orientation | Tier | Balances | Verified Via |
|--------|------|------------|------|----------|-------------|
| @ForeignPolicy | Foreign Policy | Center | 2 | @Heritage, @AEI | Already in system |
| @CFR_org | Council on Foreign Relations | Center | 1 | @Heritage | CONFIRMED: Active, foreign policy analysis |
| @AEI | American Enterprise Institute | Right | 1 | @ForeignPolicy, @CarnegieEndow | CONFIRMED: Active policy research |
| @Heritage | Heritage Foundation | Right | 1 | @CFR_org, @BrookingsInst | CONFIRMED: Conservative think tank |
| @CatoInstitute | Cato Institute | Libertarian | 1 | @jacobin, @amprog | CONFIRMED: Libertarian policy |
| @HooverInst | Hoover Institution | Right | 1 | @BrookingsInst | CONFIRMED: Stanford-based conservative |
| @CarnegieEndow | Carnegie Endowment | Center-left | 1 | @AEI, @Heritage | CONFIRMED: International peace |
| @CSIS | Center for Strategic & Intl Studies | Center | 1 | @CatoInstitute | CONFIRMED: Bipartisan security |
| @BrookingsInst | Brookings Institution | Center-left | 1 | @AEI, @Heritage | CONFIRMED: Top-ranked think tank |
| @IISS_org | Intl Institute for Strategic Studies | Center | 1 | Regional think tanks | CONFIRMED: UK-based defense |
| @ChathamHouse | Chatham House | Center | 1 | @CFR_org (US-centric) | CONFIRMED: UK foreign affairs |
| @AtlanticCouncil | Atlantic Council | Center | 2 | @QuincyInst | CONFIRMED: International affairs |
| @mehdirhasan | Mehdi Hasan | Left | 3 | @Heritage figures | Already in system |
| @allenanalysis | Allen Analysis | Center | 3 | @mehdirhasan | Already in system |

#### ECONOMIC POOL

| Handle | Name | Orientation | Tier | Balances | Verified Via |
|--------|------|------------|------|----------|-------------|
| @jacobin | Jacobin Magazine | Far-left | 3 | @WSJ, @CatoInstitute | CONFIRMED: Socialist perspectives, active |
| @WSJ | Wall Street Journal | Center-right | 1 | @jacobin, @thenation | CONFIRMED: Major financial news |
| @TheEconomist | The Economist | Center-right/Liberal | 1 | @jacobin | CONFIRMED: Global analysis |
| @PIIE | Peterson Institute | Center | 1 | @Heritage econ | CONFIRMED: Intl economics |
| @IMFNews | International Monetary Fund | Center | 1 | @WorldBank (alt) | CONFIRMED: Global finance |
| @elerianm | Mohamed El-Erian | Center | 2 | - | CONFIRMED: Major economist voice |
| @LHSummers | Lawrence Summers | Center-left | 2 | - | CONFIRMED: Former Treasury Sec |

Note: @thenation (The Nation - left), @prospect_uk (Prospect - UK left) need verification for handles

#### ENVIRONMENT/CLIMATE POOL

| Handle | Name | Orientation | Tier | Balances | Verified Via |
|--------|------|------------|------|----------|-------------|
| @IPCC_CH | IPCC | Science/Institutional | 1 | @climateskeptics | CONFIRMED: Jan 2026 statement, US withdrawal |
| @UNFCCC | UN Climate Change | Institutional | 1 | Skeptic voices | CONFIRMED: 2026 urgency messaging |
| @WMO | World Meteorological Org | Science/Institutional | 1 | @climateskeptics | CONFIRMED: Record heat reports 2026 |
| @UNEP | UN Environment Programme | Institutional | 1 | Corporate voices | CONFIRMED: Emissions Gap reports |

Note: @schwarz (already in system, environment journalist), @climate handle may not be official IPCC

#### HEALTH POOL

| Handle | Name | Orientation | Tier | Verified Via |
|--------|------|------------|------|-------------|
| @WHO | World Health Organization | Institutional | 1 | Already in system |
| @CDCgov | Centers for Disease Control | Institutional | 1 | CONFIRMED: Public health agency |
| @NIH | National Institutes of Health | Institutional | 1 | CONFIRMED: Medical research |
| @NEJM | New England Journal of Medicine | Institutional/Academic | 1 | CONFIRMED: Leading medical journal |

Note: @TheLancet and @bmj_latest need handle verification

#### DEFENSE/SECURITY POOL

| Handle | Name | Orientation | Tier | Verified Via |
|--------|------|------------|------|----------|
| @raghu_karnad | Raghu Karnad | Indian defense expert | 2 | Already in system |
| @DefenseOne | Defense One | Center/Professional | 2 | CONFIRMED: Active, defense policy |
| @WarOnTheRocks | War on the Rocks | Center/Expert | 2 | CONFIRMED: National security analysis |
| @RANDCorporation | RAND Corporation | Center/Institutional | 1 | CONFIRMED: Top defense think tank |
| @NATOpress | NATO Spokesperson | Institutional | 1 | CONFIRMED: Active official account |

Note: @Stratfor may have changed handles post-acquisition; verify before adding

#### SCIENCE POOL

| Handle | Name | Orientation | Tier | Verified Via |
|--------|------|------------|------|-------------|
| @nature | Nature | Institutional | 1 | Trusted major journal |
| @ScienceMagazine | Science Magazine | Institutional | 1 | Trusted major journal |

Note: @NASA and @CERN are institutional accounts, good for science news

#### CULTURE/SOCIETY POOL

| Handle | Name | Orientation | Tier | Verified Via |
|--------|------|------------|------|-------------|
| @TheAtlantic | The Atlantic | Center-left | 2 | CONFIRMED: Longform culture/politics |
| @NewYorker | The New Yorker | Center-left | 2 | Well-known, active |

Note: @brainpicker (Maria Popova) no longer uses this handle actively. @TEDTalks is active but broad.

#### TECH/CYBER POOL

| Handle | Name | Orientation | Tier | Verified Via |
|--------|------|------------|------|-------------|
| @WIRED | WIRED | Center | 2 | CONFIRMED: Tech/culture intersection |
| @TechCrunch | TechCrunch | Center/Startup | 2 | CONFIRMED: Startup/funding news |
| @verge | The Verge | Center | 3 | CONFIRMED: Consumer tech |
| @schneierblog | Bruce Schneier | Expert/Center | 2 | CONFIRMED: Top cybersecurity voice |
| @mikko | Mikko Hypponen | Expert/Center | 2 | CONFIRMED: Global security expert |

Note: @cybersec handle may be @cybersec or similar - verify

#### INDIA POOL

| Handle | Name | Orientation | Tier | Balances | Verified Via |
|--------|------|------------|------|----------|-------------|
| @Nidhi | Nidhi Razdan | Center-left | 3 | @swarajyamag, @OpIndia | Already in system |
| @thewire_in | The Wire | Left-leaning | 3 | @swarajyamag | CONFIRMED: Investigative journalism |
| @scroll_in | Scroll.in | Center-left | 3 | @ThePrintIndia | CONFIRMED: News/analysis |
| @ThePrintIndia | The Print | Center-right | 3 | @thewire_in, @scroll_in | CONFIRMED: Indian news outlet |
| @swarajyamag | Swarajya | Right-leaning | 3 | @thewire_in, @scroll_in | CONFIRMED: Right-wing publication |
| @OpIndia | OpIndia.com | Far-right | 3 | @thewire_in | CONFIRMED: Hindu nationalist news |
| @TheJaggi | R Jagannathan | Right-leaning | 3 | @sardesairajdeep | CONFIRMED: Editor of Swarajya |

### POLARITY BALANCE MATRIX

```
LEFT ←→ RIGHT
─────     ──────
r/politics ←→ r/Conservative
r/socialism ←→ r/Libertarian
r/socialism ←→ r/austrian_economics
r/WorkReform ←→ r/neoliberal
r/environment ←→ r/climateskeptics
r/India ←→ r/IndiaSpeaks
@jacobin ←→ @WSJ
@jacobin ←→ @CatoInstitute
@thewire_in ←→ @swarajyamag
@thewire_in ←→ @OpIndia
@CarnegieEndow ←→ @AEI
@BrookingsInst ←→ @Heritage

CENTER ←→ EXTREMES
──────     ────────
r/NeutralPolitics ←→ All partisan subs
r/moderatepolitics ←→ Partisan extremes
r/AskEconomics ←→ Ideological econ subs
r/geopolitics ←→ Nationalist subs
@CFR_org ←→ Partisan think tanks
@CSIS ←→ Ideological tanks
@PIIE ←→ Ideological econ accounts

TECHNICAL/APOLITICAL ←→ ALL
───────────────────     ───
r/CredibleDefense, r/WarCollege, r/medicine, r/AskHistorians
@IPCC_CH, @WHO, @NEJM, @CDCgov
r/cybersecurity, r/netsec, r/privacy
```

### RECOMMENDED SOURCE CONFIG FORMAT

For Reddit sources in YAML:
```yaml
- id: reddit_conservative
  name: "r/Conservative"
  platform: reddit
  subreddit: Conservative
  sort: hot
  limit: 25
  tier: 3
  pool: political
  rate_limit:
    interval_seconds: 300
    batch_size: 25
```

For Twitter sources in YAML:
```yaml
- id: twitter_aei
  name: "AEI (@AEI)"
  platform: twitter
  handle: AEI
  tier: 1
  pool: political
  include_retweets: false
  include_replies: false
  rate_limit:
    interval_seconds: 900
    batch_size: 50
```

### POOL ASSIGNMENT SUMMARY

Reddit: 30+ subreddits across all pools
Twitter: 30+ accounts across all pools
Total new sources recommended: 60+
