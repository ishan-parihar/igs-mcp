IGS MCP Server

Purpose
- Local-only MCP server that manages Intelligence Gathering System (IGS) news pools and sources (RSS/HTTP) and fetches normalized articles on demand.
- YAML configuration; concurrency; local timezone; robust caching; parsers ported from n8n code nodes (OFAC, USSF CFC, WHO DONs, Newslaundry) plus generic RSS.

Quick Start
- Install: npm install
- Dev: npm run dev
- Build: npm run build && npm start

Config (YAML)
- config/pools.yml         # pools and default activation
- config/sources.yml       # list of sources, their parser, and pool links
- config/settings.yml      # concurrency, cache policy, time settings

Tools (MCP)
- pools.list / pools.upsert / pools.delete
- sources.list / sources.upsert / sources.delete
- parsers.list
- news.fetch  # fetches from live sources within [start,end]

Cache Policy (summary)
- Feed cache (per-source): honors ETag/Last-Modified; TTL fallback; modes: prefer|bypass|only
- Query cache (per request shape): optional short-lived index to avoid refetch for identical timeframe & source set; invalidated when any feed cache updates.
