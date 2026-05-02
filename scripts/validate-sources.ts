#!/usr/bin/env bun
/**
 * validate-sources.ts — Pre-validation script for RSS/JSON feeds and other sources.
 *
 * Tests each source URL for:
 *   1. HTTP 200 status
 *   2. Content-Type header inspection
 *   3. Parsing simulation (where possible)
 *
 * Usage:
 *   bun run scripts/validate-sources.ts --url <url> --parser <parser>
 *   bun run scripts/validate-sources.ts --url <url> --parser <parser> [--url <url2> --parser <parser2> ...]
 *   bun run scripts/validate-sources.ts --file <path-to-yaml>
 *
 * YAML file format (matching sources.yml):
 *   sources:
 *     - url: https://example.com/feed
 *       parser: rss
 *       name: optional label
 *
 * Or a flat list:
 *   - url: https://example.com/feed
 *     parser: rss
 *
 * Exit code: 0 if all pass, 1 if any fail
 */

import RSSParser from 'rss-parser';
import { request } from 'undici';
import yaml from 'js-yaml';
import fs from 'node:fs/promises';

const rssParser = new RSSParser({ timeout: 15000 });

// ── Types ─────────────────────────────────────────────────────────────────────

interface SourceEntry {
  url: string;
  parser: string;
  name?: string;
}

interface ValidationResult {
  url: string;
  parser: string;
  status: 'ok' | 'fail' | 'partial';
  items_count: number;
  error?: string;
  content_type?: string;
  feed_type?: string;
  sample_title?: string;
}

interface Summary {
  total: number;
  passed: number;
  failed: number;
  partial: number;
}

interface Report {
  summary: Summary;
  results: ValidationResult[];
}

// ── CLI argument parsing ─────────────────────────────────────────────────────

function parseArgs(): { entries: SourceEntry[]; filePath: string | null } {
  const args = process.argv.slice(2);
  const entries: SourceEntry[] = [];
  let filePath: string | null = null;

  const fileIndex = args.indexOf('--file');
  if (fileIndex !== -1 && fileIndex + 1 < args.length) {
    filePath = args[fileIndex + 1];
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && i + 1 < args.length) {
      const url = args[i + 1];
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.error(`Invalid URL: ${url}`);
        process.exit(1);
      }
      let parser = 'rss';
      for (let j = i + 2; j < args.length; j++) {
        if (args[j] === '--url' || args[j] === '--file') break;
        if (args[j] === '--parser' && j + 1 < args.length) {
          parser = args[j + 1];
          break;
        }
      }
      entries.push({ url, parser });
    }
  }

  return { entries, filePath };
}

async function loadSourcesFromYaml(filePath: string): Promise<SourceEntry[]> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const data = yaml.load(raw) as any;

  if (!data) throw new Error(`Empty or invalid YAML file: ${filePath}`);

  const list: any[] = data.sources ?? (Array.isArray(data) ? data : null);
  if (!list) throw new Error(`YAML file must have a "sources" key or be a flat list`);

  return list.map((entry: any, idx: number) => {
    if (!entry.url) throw new Error(`Entry ${idx} is missing "url"`);
    if (!entry.parser) throw new Error(`Entry ${idx} is missing "parser"`);
    return { url: entry.url, parser: entry.parser, name: entry.name };
  });
}

// ── Feed type detection helpers ──────────────────────────────────────────────

function detectFeedType(body: string, contentType: string): string {
  const trimmed = body.trim();
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed')) {
    if (/<rss[\s>/]/i.test(trimmed)) return 'rss';
    if (/<feed[\s>/]/i.test(trimmed)) return 'atom';
    if (contentType.includes('xml')) return 'xml';
    return 'xml';
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.version && parsed?.items) return 'json_feed';
      if (parsed?.items) return 'json_feed_like';
      return 'json';
    } catch {
      return 'json_like';
    }
  }
  if (trimmed.startsWith('%PDF')) return 'pdf';
  return 'html';
}

// ── Validation per parser type ───────────────────────────────────────────────

async function validateSource(entry: SourceEntry): Promise<ValidationResult> {
  const { url, parser } = entry;
  const result: ValidationResult = {
    url,
    parser,
    status: 'fail',
    items_count: 0,
  };

  let body: string;
  let statusCode: number;
  let rawContentType: string;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const resp = await request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'IGS-Validator/1.0 (+https://github.com/ishan-parihar/igs-mcp)',
        Accept: 'application/rss+xml, application/json, text/html, application/xml, application/pdf, */*',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    statusCode = resp.statusCode;
    rawContentType = (resp.headers['content-type'] as string) || '';
    result.content_type = rawContentType;

    if (statusCode !== 200) {
      result.status = 'fail';
      result.error = `HTTP ${statusCode}`;
      return result;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of resp.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    body = Buffer.concat(chunks).toString('utf-8');

    if (body.length === 0) {
      result.status = 'fail';
      result.error = 'Empty response body';
      return result;
    }
  } catch (err: any) {
    result.status = 'fail';
    if (err.name === 'AbortError') {
      result.error = 'timeout (15s)';
    } else if (err.code === 'ENOTFOUND') {
      result.error = `DNS resolution failed: ${err.message}`;
    } else if (err.code === 'ECONNREFUSED') {
      result.error = `Connection refused: ${err.message}`;
    } else if (err.code === 'ECONNRESET') {
      result.error = `Connection reset: ${err.message}`;
    } else if (err.code === 'UND_ERR_HEADERS_TIMEOUT') {
      result.error = 'Headers timeout';
    } else if (err.type === 'aborted' || err.message?.includes('abort')) {
      result.error = 'timeout (15s)';
    } else {
      result.error = err.message?.slice(0, 200) || String(err);
    }
    return result;
  }

  result.feed_type = detectFeedType(body, rawContentType);

  try {
    await simulateParse(parser, body, result);
  } catch (parseErr: any) {
    result.status = 'fail';
    result.error = `Parse error: ${parseErr.message?.slice(0, 200) || String(parseErr)}`;
  }

  return result;
}

async function simulateParse(
  parser: string,
  body: string,
  result: ValidationResult,
): Promise<void> {
  switch (parser) {
    case 'rss': {
      let feed;
      try {
        feed = await rssParser.parseString(body);
      } catch {
        // rss-parser may also handle Atom; if it fails, try as raw XML
        feed = { items: [] };
      }
      const items = feed.items || [];
      result.items_count = items.length;

      if (items.length > 0) {
        result.status = 'ok';
        result.sample_title = items[0]?.title?.slice(0, 120);
      } else {
        // Check if body at least looks like valid RSS/XML
        if (body.includes('<item>') || body.includes('<entry>') || body.includes('<rss') || body.includes('<feed')) {
          result.status = 'partial';
          result.error = 'Feed parsed but 0 items';
        } else {
          result.status = 'fail';
          result.error = 'Content does not appear to be RSS/Atom XML';
        }
      }
      break;
    }

    case 'json_feed': {
      let data: any;
      try {
        data = JSON.parse(body);
      } catch {
        result.status = 'fail';
        result.error = 'Invalid JSON';
        return;
      }

      const items = Array.isArray(data?.items) ? data.items
        : Array.isArray(data) ? data
        : Array.isArray(data?.value) ? data.value
        : [];

      result.items_count = items.length;

      const hasVersion = typeof data?.version === 'string' || data?.version !== undefined;
      const hasTitle = typeof data?.title === 'string';

      if (items.length > 0) {
        result.status = 'ok';
        result.sample_title = items[0]?.title || items[0]?.url || '(no title)';
        result.sample_title = String(result.sample_title).slice(0, 120);
      } else if (hasVersion || hasTitle) {
        result.status = 'partial';
        result.error = 'JSON feed structure recognized but 0 items';
      } else if (Array.isArray(data) && data.length > 0) {
        // Could be an array of items (some APIs return this)
        result.status = 'ok';
        result.items_count = data.length;
        result.sample_title = String(data[0]?.title || data[0]?.url || '').slice(0, 120);
      } else {
        result.status = 'fail';
        result.error = 'JSON does not match feed structure (missing version/items)';
      }
      break;
    }

    case 'generic_html':
    case 'article_content': {
      const stripped = body.replace(/<[^>]+>/g, '').trim();
      if (stripped.length > 0) {
        result.status = 'partial';
        result.items_count = 0;
        result.feed_type = result.feed_type || 'html';
      } else {
        result.status = 'fail';
        result.error = 'Empty or whitespace-only HTML body';
      }
      break;
    }

    case 'sitemap': {
      const trimmed = body.trim();
      if (trimmed.includes('<urlset') || trimmed.includes('<sitemapindex')) {
        const locMatches = body.match(/<loc>/g);
        result.items_count = locMatches ? locMatches.length : 0;
        result.status = result.items_count > 0 ? 'ok' : 'partial';
        if (result.items_count === 0) result.error = 'Sitemap parsed but 0 URLs found';
      } else if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
        result.status = 'partial';
        result.items_count = 0;
        result.error = 'XML content but not a recognized sitemap format';
      } else {
        result.status = 'fail';
        result.error = 'Not a sitemap XML';
      }
      break;
    }

    case 'ofac':
    case 'ussf_cfc':
    case 'newslaundry': {
      const stripped = body.replace(/<[^>]+>/g, '').trim();
      if (stripped.length > 100) {
        result.status = 'partial';
        result.items_count = 0;
      } else {
        result.status = 'fail';
        result.error = `Body too short for ${parser} parser (${stripped.length} chars text)`;
      }
      break;
    }

    case 'who_dons':
    case 'semantic_scholar': {
      try {
        const data = JSON.parse(body);
        result.status = 'partial';
        result.items_count = Array.isArray(data) ? data.length
          : Array.isArray(data?.items) ? data.items.length
          : Array.isArray(data?.results) ? data.results.length
          : 0;
        if (result.items_count === 0) result.error = 'JSON parsed but 0 items found in expected fields';
      } catch {
        result.status = 'fail';
        result.error = 'Invalid JSON for parser type';
      }
      break;
    }

    case 'pdf-extractor':
    case 'pdf-to-markdown': {
      if (body.startsWith('%PDF') || body.charCodeAt(0) === 0x25) {
        result.status = 'partial';
        result.items_count = 0;
        result.feed_type = 'pdf';
      } else {
        result.status = 'fail';
        result.error = 'Not a PDF file (missing %PDF header)';
      }
      break;
    }

    default: {
      result.status = 'partial';
      result.items_count = 0;
      result.error = `Unknown parser type "${parser}" — only connectivity verified`;
      break;
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

function printReport(results: ValidationResult[]): void {
  const summary: Summary = { total: 0, passed: 0, failed: 0, partial: 0 };

  for (const r of results) {
    summary.total++;
    if (r.status === 'ok') summary.passed++;
    else if (r.status === 'fail') summary.failed++;
    else if (r.status === 'partial') summary.partial++;
  }

  const report: Report = { summary, results };
  console.log(JSON.stringify(report, null, 2));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { entries: cliEntries, filePath } = parseArgs();
  let allEntries: SourceEntry[] = [...cliEntries];

  if (filePath) {
    try {
      const fileEntries = await loadSourcesFromYaml(filePath);
      allEntries = allEntries.concat(fileEntries);
    } catch (err: any) {
      console.error(`Error loading YAML file "${filePath}": ${err.message}`);
      process.exit(1);
    }
  }

  if (allEntries.length === 0) {
    console.error('No sources to validate. Provide --url/--parser pairs or --file.');
    console.error('');
    console.error('Usage:');
    console.error('  bun run scripts/validate-sources.ts --url <url> --parser <parser>');
    console.error('  bun run scripts/validate-sources.ts --file <path-to-yaml>');
    process.exit(1);
  }

  const results: ValidationResult[] = [];

  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i];
    const label = entry.name || entry.url;
    process.stderr.write(`[${i + 1}/${allEntries.length}] ${label}... `);

    const result = await validateSource(entry);
    results.push(result);

    const icons: Record<string, string> = { ok: '✓', fail: '✗', partial: '~' };
    process.stderr.write(`${icons[result.status] || '?'} ${result.status}`);
    if (result.items_count > 0) process.stderr.write(` (${result.items_count} items)`);
    if (result.error) process.stderr.write(` — ${result.error.slice(0, 80)}`);
    process.stderr.write('\n');
  }

  printReport(results);

  const anyFailed = results.some(r => r.status === 'fail');
  process.exit(anyFailed ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
