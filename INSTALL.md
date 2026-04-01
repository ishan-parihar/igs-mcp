# IGS MCP Server — Installation & Setup Guide

Complete installation guide for setting up the Intelligence Gathering System (IGS) MCP server on a clean system.

---

## System Requirements

- **Node.js**: v20.x or later (LTS recommended)
- **npm**: v10.x or later
- **OS**: Linux, macOS, or Windows (WSL2 recommended for Windows)
- **RAM**: 512MB minimum (1GB recommended)
- **Disk**: 200MB for installation + cache

---

## Quick Install (5 minutes)

### Step 1: Clone Repository

```bash
git clone https://github.com/ishan-parihar/igs-mcp.git
cd igs-mcp
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Build

```bash
npm run build
```

### Step 4: Verify Installation

```bash
npm start
```

Server should start and wait for MCP client connection. Press `Ctrl+C` to stop.

---

## MCP Client Configuration

### Claude Desktop (claude_desktop_config.json)

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "igs": {
      "command": "node",
      "args": ["/absolute/path/to/igs-mcp/dist/server.js"],
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Replace `/absolute/path/to/igs-mcp/` with your actual installation path.**

### Restart Claude Desktop

After adding configuration, completely restart Claude Desktop (not just refresh).

---

## Configuration Files

### Default Location

IGS stores user configuration in:

- **Linux/macOS:** `~/.config/igs-mcp/`
- **Windows:** `%APPDATA%\igs-mcp\`
- **Custom:** Set `IGS_CONFIG_DIR` environment variable

### Bootstrap Process

On first run, IGS automatically copies default configuration from the repo to your user config directory:

```
~/.config/igs-mcp/
├── pools.yml      # Pool definitions
├── sources.yml    # News sources (223 configured)
└── settings.yml   # HTTP/cache settings
```

**Important:** Always edit files in `~/.config/igs-mcp/`, NOT in the repo's `config/` directory.

### Override Config Directory

```bash
export IGS_CONFIG_DIR=/custom/path
npm start
```

---

## Available Tools

### News Monitoring

| Tool | Description |
|------|-------------|
| `news.fetch` | Fetch news from curated sources with filters |
| `news.testSource` | Test a single source for debugging |

**Example:**
```
news.fetch(pools=['GLOBAL_BREAKING'], keywords=['AI'], limit=10)
```

### Research Tools

| Tool | Description |
|------|-------------|
| `reddit.search` | Search Reddit (any subreddit, any query) |
| `research.search` | Search academic papers (arXiv + Semantic Scholar) |
| `research.paper` | Get paper details with PDF extraction |

**Example:**
```
reddit.search(query='AI', subreddits=['technology'], limit=10)
research.search(query='transformer', sources=['arxiv'], limit=10)
```

### Source Management

| Tool | Description |
|------|-------------|
| `sources.list` | List all configured sources |
| `sources.upsert` | Add or update a source |
| `sources.delete` | Remove a source |
| `sources.countries` | List countries with source counts |
| `sources.cities` | List cities with source counts |
| `sources.domains` | List topic domains |

### Pool Management

| Tool | Description |
|------|-------------|
| `pools.list` | List all pools |
| `pools.upsert` | Create or update a pool |
| `pools.delete` | Delete a pool |

---

## Troubleshooting

### Build Fails

**Error:** `Cannot find module 'xml2js'`

**Fix:**
```bash
npm install
npm run build
```

### Server Won't Start

**Check Node version:**
```bash
node --version  # Must be v20+
```

**Rebuild:**
```bash
rm -rf dist/
npm run build
```

### Config Not Loading

**Check user config directory:**
```bash
ls -la ~/.config/igs-mcp/
```

**Force bootstrap:**
```bash
rm -rf ~/.config/igs-mcp/
npm start  # Will recreate configs
```

### Cache Issues

**Clear all caches:**
```bash
rm -rf ~/.config/igs-mcp/cache/
rm -rf ./cache/
```

### Rate Limiting

Some APIs have rate limits:

- **Semantic Scholar:** 100 requests/day (free tier)
- **Reddit:** ~60 requests/minute
- **arXiv:** 3000 requests/day

**Solution:** Tool includes automatic retry with backoff.

---

## Development

### Run in Development Mode

```bash
npm run dev
```

Auto-reloads on source file changes.

### Run Type Check

```bash
npm run typecheck
```

### Add New Source

Edit `~/.config/igs-mcp/sources.yml`:

```yaml
- id: my_custom_source
  name: My Custom Source
  type: rss
  url: https://example.com/feed.xml
  parser: rss
  pools: [GLOBAL_BREAKING]
  countries: [US]
  domains: [tech]
  is_active: true
```

No restart required — changes load automatically.

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│           MCP Client (Claude)               │
└─────────────────┬───────────────────────────┘
                  │ stdio
┌─────────────────▼───────────────────────────┐
│         IGS MCP Server (dist/server.js)     │
├─────────────────────────────────────────────┤
│  Tools:                                     │
│  • news.fetch      • research.search        │
│  • reddit.search   • research.paper         │
│  • sources.*       • pools.*                │
├─────────────────────────────────────────────┤
│  Parsers:                                   │
│  • RSS/Atom        • Generic HTML           │
│  • Semantic Scholar• PDF extraction         │
├─────────────────────────────────────────────┤
│  APIs:                                      │
│  • Reddit Search   • arXiv OAI-PMH          │
│  • Semantic Scholar• Google News            │
└─────────────────────────────────────────────┘
```

---

## Performance Tuning

### Adjust Concurrency

Edit `~/.config/igs-mcp/settings.yml`:

```yaml
http:
  concurrency: 8      # Default: 6 (increase for faster fetches)
  timeoutMs: 20000    # Default: 15000
```

### Cache Duration

```yaml
cache:
  ttlMs: 1800000      # 30 minutes (default)
  queryTtlMs: 600000  # 10 minutes (default)
```

---

## Security Notes

- **No API keys required** for basic functionality
- **Local-only**: Server runs on your machine, no data sent to external servers except news sources
- **HTTPS**: All external requests use HTTPS
- **No authentication**: MCP protocol handles access control

---

## Support

- **GitHub Issues:** https://github.com/ishan-parihar/igs-mcp/issues
- **Documentation:** `docs/` directory
- **Config Examples:** `config/` directory in repo

---

## Changelog

### v0.2.0 (April 2026)
- Added `reddit.search`, `research.search`, `research.paper` tools
- Removed RSS-based Reddit/arXiv/Semantic Scholar sources
- Added token-efficient PDF extraction
- Parallel source fetching (6 concurrent)
- Historical date queries via Google News URL rewriting

### v0.1.0 (Initial Release)
- Core news fetching with pools/sources
- RSS/HTTP parsers
- YAML configuration
- Local caching with ETag support
