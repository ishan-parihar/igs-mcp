# IGS MCP Server

**Intelligence Gathering System** — Local-only MCP server for real-time news monitoring and academic research.

[![npm](https://img.shields.io/npm/v/igs-mcp-server)](https://www.npmjs.com/package/igs-mcp-server)
[![License](https://img.shields.io/github/license/ishan-parihar/igs-mcp)](https://github.com/ishan-parihar/igs-mcp/blob/main/LICENSE)

---

## The Problem
Fragmented intelligence is an operational bottleneck for AI agents. High-authority news and research are scattered across hundreds of disparate RSS feeds, HTML sites, and niche APIs (arXiv, Semantic Scholar, Reddit). Manually aggregating this into a coherent "intelligence picture" is nearly impossible for an agent in a single turn, as it requires complex filtering, deduplication, and the ability to cross-reference entities across completely different data formats and domains.

## Engineering Highlights

### Multi-Tiered Intelligence Aggregation
I implemented a system that monitors 223+ curated sources across 45 countries and 23 domains. By utilizing a pool-based organization system, the agent can pivot from "Global Breaking News" to "India Regional" in a single tool call. A specialized parser layer normalizes varied formats (RSS, Atom, JSON, HTML) into a consistent schema, allowing the agent to treat the entire global news web as a single, queryable database.

### Local-First NLP Enrichment
To avoid the latency and cost of external LLM calls for basic data cleaning, I built a local NLP enrichment layer. This system extracts entities, topics, and sentiment directly on the host machine using optimized pattern matching and keyword extraction. This allows the agent to perform high-speed pre-filtering and "triage" of intelligence sources before requesting a deep-dive analysis.

### Hybrid Research Pipeline
The server integrates disparate research modalities—combining real-time news with academic archives (arXiv/Semantic Scholar) and community discourse (Reddit). This enables a "triangulation" workflow: the agent can identify a breaking trend in the news, verify the underlying theory via a Semantic Scholar paper, and gauge real-world sentiment via Reddit—all within a single reasoning loop.

---

## 🚀 Quick Start

### 1. Install & Configure (Recommended)

```bash
git clone https://github.com/ishan-parihar/igs-mcp.git
cd igs-mcp
./setup.sh
```

The setup script checks prerequisites (Node.js v20+), installs dependencies, builds, bootstraps config files, and prints your Claude Desktop config at the end — ready to copy-paste.

### Manual Install

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
- 🛠️ Added `setup.sh` one-line installer with auto-config

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

---

Developed by [Ishan Parihar](https://github.com/ishanparihar) — If you find this useful, [consider supporting](https://rzp.io/rzp/ishan-parihar)
