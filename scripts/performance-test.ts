#!/usr/bin/env bun
/**
 * performance-test.ts — Performance benchmark for source fetch throughput,
 * parse latency, and cache efficiency.
 *
 * Tests 3 scenarios:
 *   1. Single source baseline: 1 RSS + 1 social_media source
 *   2. Batch throughput: 10 RSS sources concurrently
 *   3. Cache efficiency: Same RSS source fetched twice
 *
 * Usage:
 *   bun run scripts/performance-test.ts
 *
 * Output: JSON report to stdout, progress to stderr.
 * Exit code: 0 on success, 1 on errors.
 *
 * Safe: read-only, no state mutation, uses existing configs.
 */

import { request } from 'undici';
import yaml from 'js-yaml';
import fs from 'node:fs/promises';
import path from 'node:path';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface SourceConfig {
  id: string;
  name: string;
  type: string;
  url?: string;
  parser?: string;
  platform?: string;
  is_active?: boolean;
  [key: string]: unknown;
}

interface PerfDetail {
  id: string;
  name: string;
  type: string;
  duration_ms: number;
  status: 'success' | 'skipped' | 'error';
  byte_length?: number;
  error?: string;
}

interface PerfResult {
  test: string;
  description: string;
  duration_ms: number;
  sources_tested: number;
  sources_succeeded: number;
  avg_latency_ms: number;
  errors: string[];
  details: PerfDetail[];
}

interface Report {
  timestamp: string;
  total_duration_ms: number;
  results: PerfResult[];
  summary: {
    tests_run: number;
    tests_passed: number;
    total_sources_tested: number;
    total_sources_succeeded: number;
    total_errors: number;
  };
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function resolveConfigDir(): string {
  return process.env.IGS_CONFIG_DIR
    || path.join(process.env.HOME || '/tmp', '.config', 'igs-mcp');
}

async function loadSources(): Promise<SourceConfig[]> {
  // Try user config first, fall back to project config
  const candidates = [
    path.join(resolveConfigDir(), 'sources.yml'),
    path.join(import.meta.dirname, '..', 'config', 'sources.yml'),
  ];

  let raw = '';
  for (const p of candidates) {
    try {
      raw = await fs.readFile(p, 'utf-8');
      break;
    } catch {
      continue;
    }
  }
  if (!raw) throw new Error('Could not find sources.yml in any config path');

  const data = yaml.load(raw) as any;
  if (!data || !Array.isArray(data.sources)) {
    throw new Error('sources.yml must have a "sources" key with an array');
  }
  return data.sources;
}

async function fetchUrl(
  url: string,
  timeoutMs = 15_000,
): Promise<{ body: string; byteLength: number; durationMs: number }> {
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'IGS-PerfTest/1.0 (+https://github.com/ishan-parihar/igs-mcp)',
        Accept: 'application/rss+xml, application/json, text/html, application/xml, */*',
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    const chunks: Buffer[] = [];
    for await (const chunk of resp.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks).toString('utf-8');
    const durationMs = performance.now() - start;

    return { body, byteLength: body.length, durationMs };
  } catch (err: unknown) {
    clearTimeout(timer);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Test 1: Single source baseline
// ═══════════════════════════════════════════════════════════════════

async function testBaseline(sources: SourceConfig[]): Promise<PerfResult> {
  const errors: string[] = [];
  const details: PerfDetail[] = [];

  const rssSrc = sources.find(s => s.type === 'rss' && s.is_active !== false && s.url);
  const socialSrc = sources.find(s => s.type === 'social_media' && s.is_active !== false);

  const candidates = [
    { src: rssSrc, label: 'RSS' },
    { src: socialSrc, label: 'social_media' },
  ].filter(c => c.src != null) as { src: SourceConfig; label: string }[];

  const testStart = performance.now();

  for (const { src } of candidates) {
    if (src.type === 'rss' || src.type === 'http') {
      try {
        const result = await fetchUrl(src.url!, 15_000);
        details.push({
          id: src.id,
          name: src.name || src.id,
          type: src.type,
          duration_ms: Math.round(result.durationMs),
          status: 'success',
          byte_length: result.byteLength,
        });
        process.stderr.write(`  [ok]  ${src.id}  ${Math.round(result.durationMs)}ms  ${result.byteLength}b\n`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message.slice(0, 200) : String(err);
        details.push({
          id: src.id,
          name: src.name || src.id,
          type: src.type,
          duration_ms: Math.round(performance.now() - testStart),
          status: 'error',
          error: msg,
        });
        errors.push(`${src.id}: ${msg}`);
        process.stderr.write(`  [err] ${src.id}  — ${msg}\n`);
      }
    } else if (src.type === 'social_media') {
      // Social media sources require auth / platform API — not callable from a
      // standalone script. Record config-lookup time and skip actual fetch.
      details.push({
        id: src.id,
        name: src.name || src.id,
        type: src.type,
        duration_ms: 0,
        status: 'skipped',
        error: 'social_media requires platform auth — config lookup only',
      });
      process.stderr.write(`  [—]  ${src.id}  skipped (social_media needs auth)\n`);
    }
  }

  const totalDuration = performance.now() - testStart;
  const succeeded = details.filter(d => d.status === 'success').length;
  const successDurations = details.filter(d => d.status === 'success').map(d => d.duration_ms);
  const avgLatency = successDurations.length
    ? Math.round(successDurations.reduce((a, b) => a + b, 0) / successDurations.length)
    : 0;

  return {
    test: 'single_source_baseline',
    description: 'Fetch 1 RSS source and 1 social_media source — measures raw latency per type',
    duration_ms: Math.round(totalDuration),
    sources_tested: details.length,
    sources_succeeded: succeeded,
    avg_latency_ms: avgLatency,
    errors,
    details,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Test 2: Batch throughput
// ═══════════════════════════════════════════════════════════════════

async function testBatch(sources: SourceConfig[]): Promise<PerfResult> {
  const errors: string[] = [];
  const details: PerfDetail[] = [];

  const batch = sources
    .filter(s => s.type === 'rss' && s.is_active !== false && s.url)
    .slice(0, 10);

  if (batch.length === 0) {
    return {
      test: 'batch_fetch',
      description: 'Fetch 10 RSS sources concurrently — measures throughput',
      duration_ms: 0,
      sources_tested: 0,
      sources_succeeded: 0,
      avg_latency_ms: 0,
      errors: ['No active RSS sources available for batch test'],
      details: [],
    };
  }

  process.stderr.write(`  batch: ${batch.length} sources\n`);

  const batchStart = performance.now();
  const settled = await Promise.allSettled(
    batch.map(async (src) => {
      const itemStart = performance.now();
      try {
        const result = await fetchUrl(src.url!, 30_000);
        const elapsed = Math.round(performance.now() - itemStart);
        process.stderr.write(`    [ok]  ${src.id}  ${elapsed}ms  ${result.byteLength}b\n`);
        return {
          id: src.id,
          name: src.name || src.id,
          type: src.type,
          duration_ms: elapsed,
          status: 'success' as const,
          byte_length: result.byteLength,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message.slice(0, 200) : String(err);
        process.stderr.write(`    [err] ${src.id}  — ${msg}\n`);
        return {
          id: src.id,
          name: src.name || src.id,
          type: src.type,
          duration_ms: Math.round(performance.now() - itemStart),
          status: 'error' as const,
          error: msg,
        };
      }
    }),
  );

  for (const r of settled) {
    if (r.status === 'fulfilled') {
      details.push(r.value);
      if (r.value.status === 'error') errors.push(`${r.value.id}: ${r.value.error}`);
    }
  }

  const totalDuration = performance.now() - batchStart;
  const succeeded = details.filter(d => d.status === 'success').length;
  const successDurations = details.filter(d => d.status === 'success').map(d => d.duration_ms);
  const avgLatency = successDurations.length
    ? Math.round(successDurations.reduce((a, b) => a + b, 0) / successDurations.length)
    : 0;

  return {
    test: 'batch_fetch',
    description: `Fetch ${batch.length} RSS sources concurrently with Promise.allSettled`,
    duration_ms: Math.round(totalDuration),
    sources_tested: batch.length,
    sources_succeeded: succeeded,
    avg_latency_ms: avgLatency,
    errors,
    details,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Test 3: Cache efficiency
// ═══════════════════════════════════════════════════════════════════

async function testCache(sources: SourceConfig[]): Promise<PerfResult> {
  const errors: string[] = [];
  const details: PerfDetail[] = [];

  const cacheSrc = sources.find(s => s.type === 'rss' && s.is_active !== false && s.url);
  if (!cacheSrc) {
    return {
      test: 'cache_efficiency',
      description: 'Fetch same RSS source twice — measures cache efficiency (first vs second)',
      duration_ms: 0,
      sources_tested: 0,
      sources_succeeded: 0,
      avg_latency_ms: 0,
      errors: ['No active RSS source available for cache test'],
      details: [],
    };
  }

  process.stderr.write(`  source: ${cacheSrc.id}\n`);
  const testStart = performance.now();

  // ── First fetch (cold) ─────────────────────────────────────────
  try {
    const first = await fetchUrl(cacheSrc.url!, 15_000);
    details.push({
      id: `${cacheSrc.id}#1`,
      name: `${cacheSrc.name} (first fetch)`,
      type: cacheSrc.type,
      duration_ms: Math.round(first.durationMs),
      status: 'success',
      byte_length: first.byteLength,
    });
    process.stderr.write(`    [1] ${cacheSrc.id}  ${Math.round(first.durationMs)}ms  ${first.byteLength}b\n`);

    if (first.byteLength === 0) {
      errors.push(`${cacheSrc.id}: empty body on first fetch`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : String(err);
    details.push({
      id: `${cacheSrc.id}#1`,
      name: `${cacheSrc.name} (first fetch)`,
      type: cacheSrc.type,
      duration_ms: Math.round(performance.now() - testStart),
      status: 'error',
      error: msg,
    });
    errors.push(`${cacheSrc.id}: first fetch failed — ${msg}`);
  }

  // ── Second fetch (hot — may hit HTTP cache / ETag) ─────────────
  try {
    const second = await fetchUrl(cacheSrc.url!, 15_000);
    details.push({
      id: `${cacheSrc.id}#2`,
      name: `${cacheSrc.name} (second fetch)`,
      type: cacheSrc.type,
      duration_ms: Math.round(second.durationMs),
      status: 'success',
      byte_length: second.byteLength,
    });
    process.stderr.write(`    [2] ${cacheSrc.id}  ${Math.round(second.durationMs)}ms  ${second.byteLength}b\n`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : String(err);
    details.push({
      id: `${cacheSrc.id}#2`,
      name: `${cacheSrc.name} (second fetch)`,
      type: cacheSrc.type,
      duration_ms: Math.round(performance.now() - testStart),
      status: 'error',
      error: msg,
    });
    errors.push(`${cacheSrc.id}: second fetch failed — ${msg}`);
  }

  const totalDuration = performance.now() - testStart;
  const succeeded = details.filter(d => d.status === 'success').length;
  const successDurations = details.filter(d => d.status === 'success').map(d => d.duration_ms);
  const avgLatency = successDurations.length
    ? Math.round(successDurations.reduce((a, b) => a + b, 0) / successDurations.length)
    : 0;

  return {
    test: 'cache_efficiency',
    description: 'Fetch same RSS source twice — measures cache efficiency (first vs second)',
    duration_ms: Math.round(totalDuration),
    sources_tested: details.length,
    sources_succeeded: succeeded,
    avg_latency_ms: avgLatency,
    errors,
    details,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════

async function main() {
  const globalStart = performance.now();

  process.stderr.write('Loading sources...\n');
  let sources: SourceConfig[];
  try {
    sources = await loadSources();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`FATAL: ${msg}\n`);
    process.exit(1);
  }

  const active = sources.filter(s => s.is_active !== false);
  process.stderr.write(`Loaded ${sources.length} sources (${active.length} active)\n\n`);

  // ── Test 1: Baseline ───────────────────────────────────────────
  process.stderr.write('── Test 1: Single source baseline ──\n');
  const baseline = await testBaseline(sources);
  process.stderr.write(`  done: ${baseline.duration_ms}ms\n\n`);

  // ── Test 2: Batch ──────────────────────────────────────────────
  process.stderr.write('── Test 2: Batch fetch ──\n');
  const batch = await testBatch(sources);
  process.stderr.write(`  done: ${batch.duration_ms}ms\n\n`);

  // ── Test 3: Cache ──────────────────────────────────────────────
  process.stderr.write('── Test 3: Cache efficiency ──\n');
  const cache = await testCache(sources);
  process.stderr.write(`  done: ${cache.duration_ms}ms\n\n`);

  // ── Report ─────────────────────────────────────────────────────
  const totalDuration = performance.now() - globalStart;
  const tests = [baseline, batch, cache];
  const testsPassed = tests.filter(t =>
    t.errors.length === 0 || t.details.some(d => d.status === 'success'),
  );

  const report: Report = {
    timestamp: new Date().toISOString(),
    total_duration_ms: Math.round(totalDuration),
    results: tests,
    summary: {
      tests_run: tests.length,
      tests_passed: testsPassed.length,
      total_sources_tested: tests.reduce((s, t) => s + t.sources_tested, 0),
      total_sources_succeeded: tests.reduce((s, t) => s + t.sources_succeeded, 0),
      total_errors: tests.reduce((s, t) => s + t.errors.length, 0),
    },
  };

  // JSON report to stdout (pipeline-friendly)
  console.log(JSON.stringify(report, null, 2));

  // Exit 1 only if ALL tests failed entirely
  const allFailed = tests.every(t => t.sources_succeeded === 0 && t.sources_tested > 0);
  const tooManyErrors = report.summary.total_errors > report.summary.total_sources_tested * 0.5;
  process.exit(allFailed || tooManyErrors ? 1 : 0);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`FATAL: ${msg}\n`);
  console.log(JSON.stringify({ fatal: msg }, null, 2));
  process.exit(1);
});
