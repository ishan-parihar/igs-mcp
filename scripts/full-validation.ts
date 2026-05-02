#!/usr/bin/env bun
/**
 * full-validation.ts — Comprehensive IGS configuration validation suite.
 *
 * Runs ALL of the following checks:
 *   1. YAML Syntax     — All YAML files parse without errors
 *   2. Schema          — Sources & pools validated against Zod schemas
 *   3. Source IDs      — No duplicate source IDs
 *   4. Pool references — Every source.pools entry references a valid pool
 *   5. Required fields — Every source has id, name, (url or platform), pools not empty
 *   6. Tier values     — All tier values are 1, 2, or 3 if present
 *   7. Rate limits     — All social_media sources have rate_limit config
 *   8. URL format      — All URL sources have parseable URLs
 *
 * Usage:
 *   bun run scripts/full-validation.ts
 *
 * Exit code: 0 = all pass, 1 = any failure
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// ── Paths ─────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(ROOT, 'config');
const CONFIG_FILES = ['pools.yml', 'sources.yml', 'settings.yml', 'countries.yml'];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValidationCheck {
  name: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
}

interface ValidationReport {
  timestamp: string;
  totalChecks: number;
  passed: number;
  failed: number;
  checks: ValidationCheck[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCheck(name: string): ValidationCheck {
  return { name, passed: true, errors: [], warnings: [] };
}

function fail(check: ValidationCheck, msg: string): void {
  check.passed = false;
  check.errors.push(msg);
}

function warn(check: ValidationCheck, msg: string): void {
  check.warnings.push(msg);
}

function makeReport(checks: ValidationCheck[]): ValidationReport {
  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed).length;
  return {
    timestamp: new Date().toISOString(),
    totalChecks: checks.length,
    passed,
    failed,
    checks,
  };
}

interface YamlFile {
  name: string;
  data: unknown;
  raw: string;
  error?: string;
}

async function loadYamlFiles(): Promise<YamlFile[]> {
  const results: YamlFile[] = [];

  for (const filename of CONFIG_FILES) {
    const filePath = path.join(CONFIG_DIR, filename);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      try {
        const data = yaml.load(raw);
        results.push({ name: filename, data, raw });
      } catch (err: any) {
        results.push({ name: filename, data: null, raw, error: `YAML parse error: ${err.message}` });
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        results.push({ name: filename, data: null, raw: '', error: `File not found: ${filePath}` });
      } else {
        results.push({ name: filename, data: null, raw: '', error: `Read error: ${err.message}` });
      }
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK 1: YAML Syntax
// ═══════════════════════════════════════════════════════════════════════════════

async function checkYamlSyntax(yamlFiles: YamlFile[]): Promise<ValidationCheck> {
  const check = makeCheck('YAML Syntax');

  for (const file of yamlFiles) {
    if (file.error) {
      fail(check, `${file.name}: ${file.error}`);
    }
  }

  if (check.passed && check.errors.length === 0) {
    check.warnings.push(`All ${CONFIG_FILES.length} YAML files parsed successfully`);
  }

  return check;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK 2: Schema Validation (Zod)
// ═══════════════════════════════════════════════════════════════════════════════

async function checkSchema(yamlFiles: YamlFile[]): Promise<ValidationCheck> {
  const check = makeCheck('Schema Validation');

  // Dynamically import schemas — use compiled .js for bun/tsx compatibility
  let SourcesFileSchema: any;
  let PoolsFileSchema: any;
  try {
    const schemas = await import('../src/config/schemas.js');
    SourcesFileSchema = schemas.SourcesFileSchema;
    PoolsFileSchema = schemas.PoolsFileSchema;
  } catch (err: any) {
    fail(check, `Failed to import schemas module: ${err.message}`);
    return check;
  }

  // ── Validate sources ───────────────────────────────────────────────

  const sourcesFile = yamlFiles.find(f => f.name === 'sources.yml');
  if (!sourcesFile || sourcesFile.error) {
    fail(check, 'sources.yml not available for schema validation');
  } else {
    const result = SourcesFileSchema.safeParse(sourcesFile.data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        const msg = issue.message;
        fail(check, `sources.yml: path="${path}" — ${msg}`);
      }
    } else {
      check.warnings.push(`sources.yml: ${result.data.sources.length} sources validated against SourcesFileSchema`);
    }
  }

  // ── Validate pools ─────────────────────────────────────────────────

  const poolsFile = yamlFiles.find(f => f.name === 'pools.yml');
  if (!poolsFile || poolsFile.error) {
    fail(check, 'pools.yml not available for schema validation');
  } else {
    const result = PoolsFileSchema.safeParse(poolsFile.data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        const msg = issue.message;
        fail(check, `pools.yml: path="${path}" — ${msg}`);
      }
    } else {
      check.warnings.push(`pools.yml: ${result.data.pools.length} pools validated against PoolsFileSchema`);
    }
  }

  return check;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK 3: No Duplicate Source IDs
// ═══════════════════════════════════════════════════════════════════════════════

async function checkSourceIds(yamlFiles: YamlFile[]): Promise<ValidationCheck> {
  const check = makeCheck('Source IDs — No Duplicates');

  const sourcesFile = yamlFiles.find(f => f.name === 'sources.yml');
  if (!sourcesFile || sourcesFile.error) {
    fail(check, 'sources.yml not available');
    return check;
  }

  const doc = sourcesFile.data as any;
  const sources: any[] = doc?.sources ?? [];

  const seen = new Map<string, number[]>();

  for (let i = 0; i < sources.length; i++) {
    const id = sources[i]?.id;
    if (id === undefined || id === null) {
      fail(check, `Source at index ${i} has no id field`);
      continue;
    }
    const sid = String(id);
    if (!seen.has(sid)) {
      seen.set(sid, []);
    }
    seen.get(sid)!.push(i);
  }

  for (const [id, indices] of seen) {
    if (indices.length > 1) {
      fail(check, `Duplicate source id "${id}" at indices: ${indices.join(', ')}`);
    }
  }

  if (check.errors.length === 0) {
    check.warnings.push(`All ${sources.length} source IDs are unique`);
  }

  return check;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK 4: Pool References — Every pool value in sources.pools matches a pool ID
// ═══════════════════════════════════════════════════════════════════════════════

async function checkPoolReferences(yamlFiles: YamlFile[]): Promise<ValidationCheck> {
  const check = makeCheck('Pool References');

  const sourcesFile = yamlFiles.find(f => f.name === 'sources.yml');
  const poolsFile = yamlFiles.find(f => f.name === 'pools.yml');

  if (!sourcesFile || sourcesFile.error) {
    fail(check, 'sources.yml not available');
    return check;
  }
  if (!poolsFile || poolsFile.error) {
    fail(check, 'pools.yml not available');
    return check;
  }

  // Collect valid pool IDs
  const poolsDoc = poolsFile.data as any;
  const poolEntries: any[] = poolsDoc?.pools ?? [];
  const validPoolIds = new Set<string>(poolEntries.map(p => p.id));

  // Check each source's pools
  const sourcesDoc = sourcesFile.data as any;
  const sources: any[] = sourcesDoc?.sources ?? [];

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    if (!src) continue;
    const pools: string[] = src.pools ?? [];

    for (let p = 0; p < pools.length; p++) {
      const poolId = pools[p];
      if (!validPoolIds.has(poolId)) {
        fail(check, `Source "${src.id || `#${i}`}" references unknown pool "${poolId}"`);
      }
    }
  }

  if (check.errors.length === 0) {
    check.warnings.push(`All source pool references point to valid pools (${validPoolIds.size} pools)`);
  }

  return check;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK 5: Required Fields — every source has id, name, (url or platform),
//          and pools array is not empty
// ═══════════════════════════════════════════════════════════════════════════════

async function checkRequiredFields(yamlFiles: YamlFile[]): Promise<ValidationCheck> {
  const check = makeCheck('Required Fields');

  const sourcesFile = yamlFiles.find(f => f.name === 'sources.yml');
  if (!sourcesFile || sourcesFile.error) {
    fail(check, 'sources.yml not available');
    return check;
  }

  const doc = sourcesFile.data as any;
  const sources: any[] = doc?.sources ?? [];

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    if (!src) {
      fail(check, `Source at index ${i} is null or undefined`);
      continue;
    }

    const label = `Source #${i}${src.id ? ` (id="${src.id}")` : ''}`;

    // id
    if (!src.id || (typeof src.id === 'string' && src.id.trim() === '')) {
      fail(check, `${label}: missing or empty "id"`);
    }

    // name
    if (!src.name || (typeof src.name === 'string' && src.name.trim() === '')) {
      fail(check, `${label}: missing or empty "name"`);
    }

    // url or platform
    const hasUrl = typeof src.url === 'string' && src.url.trim().length > 0;
    const hasPlatform = typeof src.platform === 'string' && src.platform.trim().length > 0;
    if (!hasUrl && !hasPlatform) {
      fail(check, `${label}: missing both "url" (for RSS/HTTP) and "platform" (for social_media) — at least one required`);
    }

    // pools not empty
    if (!src.pools || !Array.isArray(src.pools) || src.pools.length === 0) {
      fail(check, `${label}: "pools" array is missing or empty`);
    }

    // type validity
    if (src.type && !['rss', 'http', 'social_media'].includes(src.type)) {
      fail(check, `${label}: invalid type "${src.type}" (must be rss, http, or social_media)`);
    }
  }

  if (check.errors.length === 0) {
    check.warnings.push(`All ${sources.length} sources have required fields`);
  }

  return check;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK 6: Tier Values — only 1, 2, or 3 if present
// ═══════════════════════════════════════════════════════════════════════════════

async function checkTierValues(yamlFiles: YamlFile[]): Promise<ValidationCheck> {
  const check = makeCheck('Tier Values');

  const sourcesFile = yamlFiles.find(f => f.name === 'sources.yml');
  if (!sourcesFile || sourcesFile.error) {
    fail(check, 'sources.yml not available');
    return check;
  }

  const doc = sourcesFile.data as any;
  const sources: any[] = doc?.sources ?? [];
  const VALID_TIERS = new Set([1, 2, 3]);
  let tieredCount = 0;

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    if (!src) continue;

    if (src.tier !== undefined && src.tier !== null) {
      tieredCount++;
      if (!VALID_TIERS.has(src.tier)) {
        fail(check, `Source "${src.id || `#${i}`}" has invalid tier value: ${src.tier} (must be 1, 2, or 3)`);
      }
    }
  }

  check.warnings.push(`${tieredCount}/${sources.length} sources have tier values`);
  if (check.errors.length === 0) {
    check.warnings.push('All tier values are valid (1, 2, or 3)');
  }

  return check;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK 7: Rate Limits — every social_media source has rate_limit config
// ═══════════════════════════════════════════════════════════════════════════════

async function checkRateLimits(yamlFiles: YamlFile[]): Promise<ValidationCheck> {
  const check = makeCheck('Rate Limits (social_media)');

  const sourcesFile = yamlFiles.find(f => f.name === 'sources.yml');
  if (!sourcesFile || sourcesFile.error) {
    fail(check, 'sources.yml not available');
    return check;
  }

  const doc = sourcesFile.data as any;
  const sources: any[] = doc?.sources ?? [];
  let socialCount = 0;
  let missingRateLimit = 0;

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    if (!src) continue;

    if (src.type === 'social_media') {
      socialCount++;

      // Must have rate_limit object
      if (!src.rate_limit || typeof src.rate_limit !== 'object') {
        fail(check, `social_media source "${src.id || `#${i}`}" is missing "rate_limit"`);
        missingRateLimit++;
        continue;
      }

      // interval_seconds must be positive
      if (!src.rate_limit.interval_seconds || typeof src.rate_limit.interval_seconds !== 'number' || src.rate_limit.interval_seconds < 1) {
        fail(check, `social_media source "${src.id || `#${i}`}" has invalid or missing rate_limit.interval_seconds`);
      }

      // batch_size should be positive if present
      if (src.rate_limit.batch_size !== undefined && (typeof src.rate_limit.batch_size !== 'number' || src.rate_limit.batch_size < 1)) {
        fail(check, `social_media source "${src.id || `#${i}`}" has invalid rate_limit.batch_size (must be positive integer)`);
      }
    }
  }

  if (socialCount === 0) {
    warn(check, 'No social_media sources found — rate limit check skipped');
  } else if (missingRateLimit === 0) {
    check.warnings.push(`All ${socialCount} social_media sources have valid rate_limit config`);
  }

  return check;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK 8: URL Format — all non-social_media sources have valid, parseable URLs
// ═══════════════════════════════════════════════════════════════════════════════

async function checkUrlFormat(yamlFiles: YamlFile[]): Promise<ValidationCheck> {
  const check = makeCheck('URL Format');

  const sourcesFile = yamlFiles.find(f => f.name === 'sources.yml');
  if (!sourcesFile || sourcesFile.error) {
    fail(check, 'sources.yml not available');
    return check;
  }

  const doc = sourcesFile.data as any;
  const sources: any[] = doc?.sources ?? [];
  let checkedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    if (!src) continue;

    // Skip social_media sources — they use identifiers, not URLs
    if (src.type === 'social_media') {
      skippedCount++;
      continue;
    }

    // Must have a url field
    if (!src.url || typeof src.url !== 'string' || src.url.trim() === '') {
      fail(check, `Source "${src.id || `#${i}`}" (type: ${src.type || 'unknown'}) has missing or empty "url"`);
      continue;
    }

    // Must be parseable as URL
    checkedCount++;
    try {
      new URL(src.url);
    } catch {
      fail(check, `Source "${src.id || `#${i}`}" has invalid URL: "${src.url}"`);
    }
  }

  if (check.errors.length === 0) {
    check.warnings.push(`All ${checkedCount} non-social_media sources have valid URLs (${skippedCount} social_media sources skipped)`);
  }

  return check;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTING
// ═══════════════════════════════════════════════════════════════════════════════

function printReport(report: ValidationReport): void {
  // Summary line (stderr) for human reading
  const icon = report.failed === 0 ? '✅' : '❌';
  process.stderr.write(`\n${icon} Full Validation Report\n`);
  process.stderr.write(`   Timestamp: ${report.timestamp}\n`);
  process.stderr.write(`   Checks:    ${report.totalChecks} total, ${report.passed} passed, ${report.failed} failed\n\n`);

  // Detailed output per check
  for (const check of report.checks) {
    const status = check.passed ? '✅ PASS' : '❌ FAIL';
    process.stderr.write(`  ${status}  ${check.name}\n`);

    if (check.warnings.length > 0) {
      for (const w of check.warnings) {
        process.stderr.write(`       ⚠  ${w}\n`);
      }
    }

    if (check.errors.length > 0) {
      for (const e of check.errors) {
        process.stderr.write(`       ✗  ${e}\n`);
      }
    }
    process.stderr.write('\n');
  }

  // JSON output (stdout) for programmatic consumption
  console.log(JSON.stringify(report, null, 2));
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  // Load all YAML files once
  const yamlFiles = await loadYamlFiles();

  // Run all checks
  const checks = await Promise.all([
    checkYamlSyntax(yamlFiles),
    checkSchema(yamlFiles),
    checkSourceIds(yamlFiles),
    checkPoolReferences(yamlFiles),
    checkRequiredFields(yamlFiles),
    checkTierValues(yamlFiles),
    checkRateLimits(yamlFiles),
    checkUrlFormat(yamlFiles),
  ]);

  const report = makeReport(checks);
  printReport(report);

  process.exit(report.failed > 0 ? 1 : 0);
}

main().catch(err => {
  process.stderr.write(`Fatal error: ${err.stack || err.message || String(err)}\n`);
  process.exit(1);
});
