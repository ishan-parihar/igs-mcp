IGS MCP Server

Purpose
- Local-only MCP server that manages Intelligence Gathering System (IGS) news pools and sources (RSS/HTTP) and fetches normalized articles on demand.
- YAML configuration; concurrency; local timezone; robust caching; parsers ported from n8n code nodes (OFAC, USSF CFC, WHO DONs, Newslaundry) plus generic RSS.

Quick Start
- Install: npm install
- Dev: npm run dev
- Build: npm run build && npm start

Config (YAML)
- Defaults (read-only, in repo): config/*.yml
- Primary (writable, global):
  - Linux/macOS: ~/.config/igs-mcp/*.yml (or $XDG_CONFIG_HOME/igs-mcp)
  - Override via env: IGS_CONFIG_DIR=/custom/path
On first run, the server bootstraps ~/.config/igs-mcp from repo defaults. All updates (pool/source changes) write only to the global config, never to repo defaults.

Tools (MCP)
- pools.list / pools.upsert / pools.delete
- sources.list / sources.upsert / sources.delete
- parsers.list
- news.fetch  # fetches from live sources within [start,end]

Cache Policy (summary)
- Feed cache (per-source): honors ETag/Last-Modified; TTL fallback; modes: prefer|bypass|only
- Query cache (per request shape): optional short-lived index to avoid refetch for identical timeframe & source set; invalidated when any feed cache updates.
