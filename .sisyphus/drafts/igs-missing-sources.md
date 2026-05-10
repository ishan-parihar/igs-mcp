# Draft: IGS Missing Sources Research & Plan

## Research Findings

### Health/Science Sources Found
- **CDC**: https://tools.cdc.gov/api/v2/resources/media/132608.rss
- **BMJ** (British Medical Journal): General health/medical research
- **The Lancet**: Premier medical journal
- **NEJM**: New England Journal of Medicine
- **JAMA**: Journal of American Medical Association
- **Live Science**: Science news
- **Knowable Magazine**: Annual science review
- **KFF Health News**: US health policy
- **OHSU News**: Research institution news
- **ACSH**: American Council on Science and Health
- **JMIR**: Digital health research

### Environment/Climate Sources Found
- **Carbon Brief**: https://www.carbonbrief.org/ - Excellent climate analysis, daily briefings
- **Inside Climate News**: Climate reporting
- **Yale Climate Connections**: Climate science communication
- **Skeptical Science**: https://skepticalscience.com/ - Climate myth debunking
- **IPCC**: Official reports and publications
- **Copernicus/ECMWF**: European climate data
- **Energy.gov**: US DOE climate reports

### Defense/Security Sources Found
- **Janes**: https://www.janes.com/ - Defense intelligence
- **RAND Corporation**: Defense policy research
- **Newsweek**: Defense coverage
- **WIONews**: Defense/security
- **GeoEnglish**: Pakistan defense
- **Military Mechanics**: Defense tech

### Reddit Subreddits for Political/Economic/Social
- r/worldnews - Global news
- r/geopolitics - Strategic analysis
- r/politics - US/world politics
- r/economics - Economic discussion
- r/investing - Finance/investment
- r/news - General news
- r/science - Science discussion
- r/technology - Tech news
- r/MiddleEast - Regional news
- r/collapse - Societal risk discussion
- r/india, r/pakistan - Regional
- r/AskConservatives - Political discourse

### Twitter/X Accounts
- @ForeignPolicy - Global politics/economics
- @Nidhi - Foreign policy analysis
- @praffulgarg97 - Geopolitics/politics/economy
- @mehdirhasan - Journalism
- @allenanalysis - Economic analysis

### International Law Sources
- ICJ (International Court of Justice)
- ICC (International Criminal Court)
- WTO Dispute Settlement
- UN OHCHR
- Human Rights Watch
- Amnesty International

### Cultural/Sociology Sources
- Berghahn Books (cultural studies)
- UCLA Luskin Center
- Academic journals (Cornell guide)
- Jim Rutt Show (complexity/culture)

## Current IGS Structure
- 12 parsers: article_content, generic_html, json_feed, newslaundry, ofac, pdf-extractor, pdf-to-markdown, rss, semantic_scholar, sitemap, ussf_cfc, who_dons
- Reddit API already exists: `src/utils/reddit-api.ts`
- Source config: `config/sources.yml` (4481 lines)
- Pool config: `config/pools.yml`
- Domain tags exist but need expansion

## Identified Gaps
1. Social/Cultural pool - only 4 active sources
2. Health/Science - no dedicated pool
3. Environment/Climate - no dedicated pool
4. International legal bodies - inactive
5. Defense/Military - completely absent
6. No source quality scoring
7. No health monitoring automation
8. Social-media sources underutilized (Reddit exists but not configured as sources)
9. Twitter/X sources absent
