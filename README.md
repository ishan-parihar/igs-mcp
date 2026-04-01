# IGS MCP Server

**Intelligence Gathering System** — Local-only MCP server for real-time news monitoring and academic research.

[![npm](https://img.shields.io/npm/v/igs-mcp-server)](https://www.npmjs.com/package/igs-mcp-server)
[![License](https://img.shields.io/github/license/ishan-parihar/igs-mcp)](https://github.com/ishan-parihar/igs-mcp/blob/main/LICENSE)

---

## 🎯 What It Does

IGS is an MCP (Model Context Protocol) server that provides AI assistants with:

1. **News Monitoring** — Fetch from 223 curated RSS/HTTP sources (Reuters, BBC, Indian Express, etc.)
2. **Reddit Search** — Search any subreddit with time/sort filters
3. **Academic Research** — Search arXiv + Semantic Scholar papers with PDF extraction
4. **Historical Queries** — Access news from specific date ranges via Google News

All processing happens **locally on your machine**. No data is sent to external servers except the news sources themselves.

---

## 🚀 Quick Start

### 1. Install

```bash
git clone https://github.com/ishan-parihar/igs-mcp.git
cd igs-mcp
npm install
npm run build
```

### 2. Configure Claude Desktop

Edit `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "igs": {
      "command": "node",
      "args": ["/absolute/path/to/igs-mcp/dist/server.js"]
    }
  }
}
```

### 3. Restart Claude Desktop

Completely quit and relaunch Claude Desktop.

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [INSTALL.md](INSTALL.md) | Complete installation guide |
| [AUDIT_REPORT.md](AUDIT_REPORT.md) | Installation audit & verification |
| `docs/plans/` | Architecture & design documents |

---

## 🛠️ Available Tools

### News Monitoring

| Tool | Description | Example |
|------|-------------|---------|
| `news.fetch` | Fetch from curated sources | `news.fetch(pools=['GLOBAL_BREAKING'], keywords=['AI'], limit=10)` |
| `news.testSource` | Test single source | `news.testSource(id='reuters')` |

### Research Tools

| Tool | Description | Example |
|------|-------------|---------|
| `reddit.search` | Search Reddit | `reddit.search(query='technology', subreddits=['news'], limit=10)` |
| `research.search` | Search papers | `research.search(query='transformer', sources=['arxiv'], limit=10)` |
| `research.paper` | Paper details + PDF | `research.paper(paperId='arxiv:2401.12345', extractPDF=true)` |

### Source Management

| Tool | Description |
|------|-------------|
| `sources.list` | List all sources |
| `sources.upsert` | Add/update source |
| `sources.delete` | Remove source |
| `sources.countries` | Countries with source counts |
| `sources.cities` | Cities with source counts |
| `sources.domains` | Topic domains |

### Pool Management

| Tool | Description |
|------|-------------|
| `pools.list` | List all pools |
| `pools.upsert` | Create/update pool |
| `pools.delete` | Delete pool |

---

## 📊 Pre-configured Content

### News Pools (14)

| Pool | Description | Sources |
|------|-------------|---------|
| `GLOBAL_BREAKING` | Fast breaking news | Reuters, BBC, FT, Al Jazeera |
| `GLOBAL_GEOECON` | Geopolitics & geoeconomics | Foreign Affairs, RAND, Brookings |
| `GLOBAL_LAW_REG` | Law & regulation | OFAC, Lawfare, SCOTUSblog |
| `GLOBAL_TECH_CYBER` | Tech & cyber | MIT Tech Review, Ars Technica, CISA |
| `GLOBAL_ENV_HEALTH` | Environment & health | WHO, Mongabay, Nature |
| `GLOBAL_CULT_SOC` | Culture & society | Aeon, UnHerd, Noema |
| `INDIA_NATIONAL_BASE` | India national | The Hindu, Indian Express, Economic Times |
| `INDIA_WATCHDOG` | India investigative | Scroll.in, The Wire, Article 14 |
| `INDIA_FACTCHECK_DATA` | India fact-check | Alt News, BOOM Live, IndiaSpend |
| `INDIA_BUSINESS_REG` | India business | Moneycontrol, NSE, RBI, SEBI |
| `INDIA_REGION` | India regional | IE South/East/Northeast |
| `INDIA_CITIES` | India cities | Delhi, Mumbai, Bengaluru feeds |
| `GLOBAL_COUNTRIES` | Country feeds | Guardian/France24 country feeds |
| `GLOBAL_CITIES` | Global cities | London, NYC, Singapore |

### Source Inventory

- **Total Sources:** 223
- **Countries Covered:** 45
- **Cities Covered:** 23
- **Topic Domains:** 23 (geopolitics, finance, tech, science, etc.)

---

## 🔧 Configuration

### User Config Directory

IGS stores configuration in:

- **Linux/macOS:** `~/.config/igs-mcp/`
- **Windows:** `%APPDATA%\igs-mcp\`
- **Custom:** Set `IGS_CONFIG_DIR` environment variable

### Files

```
~/.config/igs-mcp/
├── pools.yml      # Pool definitions
├── sources.yml    # News sources (223 configured)
└── settings.yml   # HTTP/cache settings
```

### Add Custom Source

Edit `~/.config/igs-mcp/sources.yml`:

```yaml
- id: my_tech_blog
  name: My Tech Blog
  type: rss
  url: https://example.com/feed.xml
  parser: rss
  pools: [GLOBAL_TECH_CYBER]
  countries: [US]
  domains: [tech]
  is_active: true
```

No restart required — changes load automatically.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│           MCP Client (Claude)               │
└─────────────────┬───────────────────────────┘
                  │ stdio
┌─────────────────▼───────────────────────────┐
│         IGS MCP Server (Node.js)            │
├─────────────────────────────────────────────┤
│  Tools: 11 MCP tools                        │
│  • news.fetch      • research.search        │
│  • reddit.search   • research.paper         │
│  • sources.*       • pools.*                │
├─────────────────────────────────────────────┤
│  Parsers: 9 parsers                         │
│  • RSS/Atom        • Generic HTML           │
│  • Semantic Scholar• PDF extraction         │
│  • OFAC, WHO, USSF (custom HTML)            │
├─────────────────────────────────────────────┤
│  APIs:                                      │
│  • Reddit Search   • arXiv OAI-PMH          │
│  • Semantic Scholar• Google News proxy      │
└─────────────────────────────────────────────┘
```

---

## ⚡ Performance

| Metric | Value |
|--------|-------|
| Cold start | ~2 seconds |
| news.fetch (9 sources) | ~3 seconds |
| news.fetch (223 sources) | ~25 seconds |
| Cache hit ratio | ~90% (warm) |
| Memory usage | 50-150 MB |

---

## 🔒 Security

- ✅ **Local-only** — Runs on your machine
- ✅ **No telemetry** — No data collection
- ✅ **HTTPS only** — All external requests encrypted
- ✅ **No API keys required** — For basic functionality
- ✅ **User-controlled config** — You own your data

---

## 📦 Dependencies

### Runtime (15)

- @modelcontextprotocol/sdk — MCP protocol
- cheerio — HTML parsing
- pdf-parse — PDF text extraction
- xml2js — arXiv XML parsing
- p-queue — Concurrency control
- undici — HTTP client
- zod — Schema validation
- js-yaml — YAML parsing
- rss-parser — RSS/Atom parsing
- pino — Logging
- compromise — NLP (enrichment)
- sentiment — Sentiment analysis
- keyword-extractor — Keyword extraction
- date-fns + date-fns-tz — Date handling

### Development (5)

- typescript
- @types/node
- @types/js-yaml
- @types/xml2js
- ts-node-dev

---

## 🧪 Development

```bash
# Install
npm install

# Development mode (auto-reload)
npm run dev

# Build
npm run build

# Type check
npm run typecheck

# Start production
npm start
```

---

## 🐛 Troubleshooting

### Server won't start

```bash
# Check Node version (must be v20+)
node --version

# Rebuild
rm -rf dist/
npm run build
```

### Config not loading

```bash
# Check user config directory
ls -la ~/.config/igs-mcp/

# Force bootstrap
rm -rf ~/.config/igs-mcp/
npm start
```

### Cache issues

```bash
# Clear all caches
rm -rf ~/.config/igs-mcp/cache/
rm -rf ./cache/
```

### Rate limiting

- **Semantic Scholar:** 100 requests/day (free tier)
- **Reddit:** ~60 requests/minute
- **arXiv:** 3000 requests/day

Tool includes automatic retry with backoff.

---

## 📝 Changelog

### v0.2.0 (April 2026)

**Major Upgrade: Research Tools**

- ✨ NEW: `reddit.search` — Dynamic Reddit search
- ✨ NEW: `research.search` — arXiv + Semantic Scholar
- ✨ NEW: `research.paper` — PDF extraction with citations
- 🔧 Parallel source fetching (6 concurrent)
- 🔧 Historical date queries via Google News URL rewriting
- 🗑️ REMOVED: RSS-based Reddit/arXiv/Semantic Scholar sources
- 📚 Added INSTALL.md and AUDIT_REPORT.md

### v0.1.0 (Initial Release)

- Core news fetching with pools/sources
- RSS/HTTP parsers
- YAML configuration
- Local caching with ETag support

---

## 📄 License

MIT License — See [LICENSE](LICENSE) file.

---

## 🙏 Acknowledgments

- MCP SDK: [Model Context Protocol](https://modelcontextprotocol.io/)
- arXiv API: [arXiv.org](https://arxiv.org/)
- Semantic Scholar: [Allen Institute for AI](https://www.semanticscholar.org/)
- Reddit API: [Reddit](https://www.reddit.com/dev/api/)

---

## 📬 Support

- **Issues:** https://github.com/ishan-parihar/igs-mcp/issues
- **Discussions:** https://github.com/ishan-parihar/igs-mcp/discussions
