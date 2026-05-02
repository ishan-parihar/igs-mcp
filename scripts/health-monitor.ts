#!/usr/bin/env bun
/**
 * health-monitor.ts — Health monitoring for all sources in sources.yml
 *
 * Periodically checks all sources and reports which are healthy, failing, or stale.
 * Can be run standalone: bun run scripts/health-monitor.ts
 *
 * Exit code:
 *   0 — All sources healthy (no failures)
 *   1 — One or more sources are failing
 */

import { request } from 'undici';
import yaml from 'js-yaml';
import fs from 'node:fs/promises';
import path from 'node:path';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SourceEntry {
  id: string;
  name: string;
  type: string;
  url?: string;
  platform?: string;
  parser?: string;
  is_active?: boolean;
  rate_limit?: { interval_seconds?: number; batch_size?: number };
  [key: string]: unknown;
}

interface HealthResult {
  timestamp: string;
  summary: {
    total: number;
    healthy: number;
    failing: number;
    stale: number;
    inactive: number;
  };
  sources: Array<{
    id: string;
    name: string;
    status: 'healthy' | 'failing' | 'stale' | 'inactive';
    responseTime?: number;
    error?: string;
    sourceType?: string;
  }>;
}

type SourceStatus = 'healthy' | 'failing' | 'stale' | 'inactive';

// ── Config resolution ─────────────────────────────────────────────────────────

function resolveConfigPath(): string {
  const envDir = process.env.IGS_CONFIG_DIR;
  if (envDir) {
    return path.join(envDir, 'sources.yml');
  }
  // Default: look relative to script location
  const scriptDir = path.dirname(import.meta.path);
  const repoRoot = path.resolve(scriptDir, '..');
  return path.join(repoRoot, 'config', 'sources.yml');
}

// ── Health check for RSS/HTTP sources ─────────────────────────────────────────

interface CheckResult {
  status: SourceStatus;
  responseTime?: number;
  error?: string;
}

async function checkHttpSource(source: SourceEntry): Promise<CheckResult> {
  const url = source.url;
  if (!url) {
    return { status: 'failing', error: 'No URL configured' };
  }

  const startTime = performance.now();

  try {
    const resp = await request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'IGS-HealthMonitor/1.0 (+https://github.com/ishan-parihar/igs-mcp)',
        Accept: 'application/rss+xml, application/json, text/html, application/xml, */*',
      },
      headersTimeout: 10_000,
      bodyTimeout: 5_000,
    });

    const elapsed = performance.now() - startTime;
    const elapsedSeconds = elapsed / 1000;

    if (resp.statusCode !== 200) {
      return { status: 'failing', responseTime: elapsedSeconds, error: `HTTP ${resp.statusCode}` };
    }

    // Check if body is non-empty for confidence
    const contentLength = resp.headers['content-length'];
    if (contentLength !== undefined && contentLength !== null) {
      const length = typeof contentLength === 'string' ? parseInt(contentLength, 10) : Number(contentLength);
      if (length === 0) {
        return { status: 'stale', responseTime: elapsedSeconds, error: 'Content-Length is 0' };
      }
    }

    if (elapsedSeconds < 3) {
      return { status: 'healthy', responseTime: elapsedSeconds };
    } else if (elapsedSeconds <= 10) {
      return { status: 'stale', responseTime: elapsedSeconds, error: `Slow response (${elapsedSeconds.toFixed(1)}s)` };
    } else {
      // Shouldn't reach here with the 10s timeout, but just in case
      return { status: 'stale', responseTime: elapsedSeconds, error: `Response time ${elapsedSeconds.toFixed(1)}s exceeds 10s threshold` };
    }
  } catch (err: any) {
    const elapsed = performance.now() - startTime;
    const elapsedSeconds = elapsed / 1000;

    let errorMsg: string;
    if (err.name === 'AbortError' || err.type === 'aborted' || err.message?.includes('abort')) {
      errorMsg = 'timeout (10s)';
    } else if (err.code === 'ENOTFOUND') {
      errorMsg = `DNS resolution failed`;
    } else if (err.code === 'ECONNREFUSED') {
      errorMsg = `Connection refused`;
    } else if (err.code === 'ECONNRESET') {
      errorMsg = `Connection reset`;
    } else if (err.code === 'UND_ERR_HEADERS_TIMEOUT') {
      errorMsg = 'Headers timeout';
    } else if (err.code === 'UND_ERR_BODY_TIMEOUT') {
      errorMsg = 'Body timeout';
    } else {
      errorMsg = err.message?.slice(0, 200) || String(err);
    }

    return { status: 'failing', responseTime: elapsedSeconds, error: errorMsg };
  }
}

// ── Health check for social_media sources ────────────────────────────────────

const VALID_PLATFORMS = new Set(['reddit', 'twitter']);

function checkSocialMediaSource(source: SourceEntry): CheckResult {
  const platform = source.platform;

  if (!platform) {
    return { status: 'failing', error: 'Missing platform field' };
  }

  if (!VALID_PLATFORMS.has(platform)) {
    return { status: 'failing', error: `Unknown platform: "${platform}"` };
  }

  // Check rate_limit config completeness
  const rateLimit = source.rate_limit;
  if (!rateLimit) {
    return { status: 'stale', error: 'Missing rate_limit config' };
  }

  if (typeof rateLimit.interval_seconds !== 'number' || typeof rateLimit.batch_size !== 'number') {
    return { status: 'stale', error: 'Incomplete rate_limit config (needs interval_seconds and batch_size)' };
  }

  return { status: 'healthy' };
}

// ── Main health check ─────────────────────────────────────────────────────────

async function checkSource(source: SourceEntry): Promise<{
  status: SourceStatus;
  responseTime?: number;
  error?: string;
}> {
  // Inactive sources are excluded from active count
  if (source.is_active === false) {
    return { status: 'inactive' };
  }

  switch (source.type) {
    case 'rss':
    case 'http':
      return checkHttpSource(source);

    case 'social_media':
      return checkSocialMediaSource(source);

    default:
      return { status: 'stale', error: `Unknown source type: "${source.type}"` };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const configPath = resolveConfigPath();

  let sourcesYaml: string;
  try {
    sourcesYaml = await fs.readFile(configPath, 'utf-8');
  } catch (err: any) {
    console.error(`Error reading config file "${configPath}": ${err.message}`);
    process.exit(1);
  }

  let data: any;
  try {
    data = yaml.load(sourcesYaml);
  } catch (err: any) {
    console.error(`Error parsing YAML: ${err.message}`);
    process.exit(1);
  }

  if (!data || !Array.isArray(data.sources)) {
    console.error('sources.yml must contain a "sources" array');
    process.exit(1);
  }

  const sources: SourceEntry[] = data.sources;
  const results: HealthResult['sources'] = [];

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const label = `[${i + 1}/${sources.length}] ${source.name || source.id}`;
    process.stderr.write(`${label}... `);

    const check = await checkSource(source);

    results.push({
      id: source.id || `unknown-${i}`,
      name: source.name || source.id || `Source ${i}`,
      status: check.status,
      responseTime: check.responseTime,
      error: check.error,
      sourceType: source.type,
    });

    const icons: Record<string, string> = {
      healthy: '✓',
      failing: '✗',
      stale: '~',
      inactive: '-',
    };
    process.stderr.write(`${icons[check.status] || '?'} ${check.status}`);
    if (check.responseTime !== undefined) {
      process.stderr.write(` (${check.responseTime.toFixed(1)}s)`);
    }
    if (check.error) {
      process.stderr.write(` — ${check.error.slice(0, 100)}`);
    }
    process.stderr.write('\n');
  }

  // Build summary — inactive are not counted in "total"
  const activeSources = results.filter(r => r.status !== 'inactive');
  const summary = {
    total: activeSources.length,
    healthy: results.filter(r => r.status === 'healthy').length,
    failing: results.filter(r => r.status === 'failing').length,
    stale: results.filter(r => r.status === 'stale').length,
    inactive: results.filter(r => r.status === 'inactive').length,
  };

  const report: HealthResult = {
    timestamp: new Date().toISOString(),
    summary,
    sources: results,
  };

  console.log(JSON.stringify(report, null, 2));

  const anyFailing = results.some(r => r.status === 'failing');
  process.exit(anyFailing ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
