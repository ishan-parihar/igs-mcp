/**
 * test_all_sources.ts — Comprehensive test of ALL active news sources.
 *
 * Iterates every active source, fetches its URL, parses the response,
 * and reports pass/fail per pool. Designed for bulk verification.
 *
 * Usage: npx tsx scripts/test_all_sources.ts
 */
import path from 'node:path';
import { loadSettings, loadSources, getUserConfigDir } from '../src/config/loader.js';
import { HttpClient } from '../src/http/client.js';
import { parseRss } from '../src/parsers/rss.js';
import { parseOfacHtml } from '../src/parsers/ofac.js';
import { parseUssfcfcHtml } from '../src/parsers/ussf_cfc.js';
import { parseWhoJson } from '../src/parsers/who_dons.js';
import { parseNewslaundryHtml } from '../src/parsers/newslaundry.js';
import { parseSemanticScholarJson } from '../src/parsers/semantic_scholar.js';
import { parseWithSelectors, autoParseHtml } from '../src/parsers/generic_html.js';
import { parseJsonFeed } from '../src/parsers/json_feed.js';
import { load as loadHtml } from 'cheerio';
import type { Source, NewsItem } from '../src/types/news.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function parseBySource(source: Source, http: HttpClient): Promise<{ items: NewsItem[]; succeeded: boolean; error?: string }> {
  try {
    const headers = source.headers || {};
    const res = await http.fetch(source.url, headers, 'bypass');

    if (!('response' in res)) {
      return { items: [], succeeded: false, error: 'No response (304 or network error)' };
    }

    const body = res.response.bodyText;
    const ctype = (res.response.headers['content-type'] || '').toLowerCase();
    let items: NewsItem[] = [];

    if (source.parser === 'ofac') {
      items = parseOfacHtml(source, body);
    } else if (source.parser === 'ussf_cfc') {
      items = parseUssfcfcHtml(source, body);
    } else if (source.parser === 'who_dons') {
      items = parseWhoJson(source, body);
    } else if (source.parser === 'newslaundry') {
      items = parseNewslaundryHtml(source, body);
    } else if (source.parser === 'semantic_scholar') {
      items = parseSemanticScholarJson(source, body);
    } else if (source.parser === 'generic_html' && source.parserConfig?.selectors) {
      items = await parseWithSelectors(source, body, source.parserConfig.selectors as any);
    } else {
      const looksXml = ctype.includes('xml') || ctype.includes('rss') || ctype.includes('atom')
        || /<rss[\s>/]/i.test(body) || /<feed[\s>/]/i.test(body);
      if (looksXml) {
        items = await parseRss(source, body, true);
      } else if (ctype.includes('json') || /^[\[{]/.test(body.trim())) {
        items = parseJsonFeed(source, body);
      } else {
        try {
          const $ = loadHtml(body);
          const linkEl = $("link[rel='alternate'][type*='rss'], link[rel='alternate'][type*='atom']").first();
          const href = linkEl.attr('href');
          if (href) {
            const rssUrl = new URL(href, source.url).toString();
            const res2 = await http.fetch(rssUrl, headers, 'bypass');
            if ('response' in res2) {
              items = await parseRss(source, res2.response.bodyText, true);
            }
          } else {
            const auto = await autoParseHtml(source, body);
            items = auto.items;
          }
        } catch { items = []; }
      }
    }

    const succeeded = items.length > 0;
    return { items, succeeded, error: succeeded ? undefined : '0 items returned (empty feed/parse)' };
  } catch (e: any) {
    return { items: [], succeeded: false, error: e?.message?.slice(0, 120) || String(e) };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

interface PoolStats {
  pool: string;
  total: number;
  passed: number;
  failed: number;
  failures: { id: string; name: string; error: string }[];
}

async function main() {
  console.log('═'.repeat(72));
  console.log('  IGS — Full Source Health Audit');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═'.repeat(72));

  // Load config
  const settings = await loadSettings();
  const baseCfg = getUserConfigDir();
  const cacheDir = path.isAbsolute(settings.cache.dir)
    ? settings.cache.dir
    : path.join(baseCfg, settings.cache.dir);
  const http = new HttpClient(settings.http, cacheDir);
  const sf = await loadSources();

  const sources = sf.sources.filter(s => s.is_active !== false);
  console.log(`\nLoaded ${sf.sources.length} sources total, ${sources.length} active.\n`);

  // Per-pool tracking
  const poolMap = new Map<string, PoolStats>();
  function getPoolStats(pool: string): PoolStats {
    if (!poolMap.has(pool)) {
      poolMap.set(pool, { pool, total: 0, passed: 0, failed: 0, failures: [] });
    }
    return poolMap.get(pool)!;
  }

  // Track grand total
  let totalPassed = 0;
  let totalFailed = 0;
  const allFailures: { id: string; name: string; pool: string; error: string }[] = [];
  const sourceResults: { id: string; name: string; pool: string; ok: boolean; items: number; error?: string }[] = [];

  // Process each source sequentially to avoid overwhelming hosts
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const primaryPool = src.pools?.[0] || '(no pool)';

    process.stdout.write(`[${i + 1}/${sources.length}] ${src.id.padEnd(30)} `);

    const { items, succeeded, error } = await parseBySource(src, http);

    const stats = getPoolStats(primaryPool);
    stats.total++;

    if (succeeded) {
      totalPassed++;
      stats.passed++;
      process.stdout.write(`✅ ${items.length} items\n`);
    } else {
      totalFailed++;
      stats.failed++;
      stats.failures.push({ id: src.id, name: src.name, error: error || 'Unknown' });
      allFailures.push({ id: src.id, name: src.name, pool: primaryPool, error: error || 'Unknown' });
      process.stdout.write(`❌ ${error || 'FAILED'}\n`);
    }

    sourceResults.push({ id: src.id, name: src.name, pool: primaryPool, ok: succeeded, items: items.length, error });
  }

  // ── Report ──────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log('  RESULTS');
  console.log('═'.repeat(72));
  console.log(`  Total: ${sources.length} sources`);
  console.log(`  Passed: ${totalPassed}`);
  console.log(`  Failed: ${totalFailed}`);
  console.log(`  Pass rate: ${(totalPassed / sources.length * 100).toFixed(1)}%`);

  // Per-pool breakdown
  console.log('\n' + '─'.repeat(72));
  console.log('  PER-POOL BREAKDOWN');
  console.log('─'.repeat(72));
  const sortedPools = [...poolMap.entries()].sort((a, b) => b[1].total - a[1].total);
  for (const [, stats] of sortedPools) {
    const rate = stats.total > 0 ? (stats.passed / stats.total * 100).toFixed(0) : 'N/A';
    const status = stats.failed === 0 ? '✅' : '⚠️';
    console.log(`  ${status} ${stats.pool.padEnd(25)} ${stats.passed.toString().padStart(3)}/${stats.total.toString().padStart(3)}  (${rate}%)`);
  }

  // Detailed failures
  if (allFailures.length > 0) {
    console.log('\n' + '─'.repeat(72));
    console.log(`  FAILED SOURCES (${allFailures.length})`);
    console.log('─'.repeat(72));

    // Group by pool for readability
    const failuresByPool = new Map<string, typeof allFailures>();
    for (const f of allFailures) {
      if (!failuresByPool.has(f.pool)) failuresByPool.set(f.pool, []);
      failuresByPool.get(f.pool)!.push(f);
    }

    for (const [pool, failures] of failuresByPool) {
      console.log(`\n  📁 ${pool} (${failures.length} failed):`);
      for (const f of failures) {
        console.log(`    ❌ ${f.id.padEnd(30)} ${f.name.slice(0, 40).padEnd(42)} ${f.error.slice(0, 80)}`);
      }
    }
  }

  console.log('\n' + '═'.repeat(72));
  console.log(`  Audit complete: ${totalPassed}/${sources.length} passed`);
  console.log('═'.repeat(72));
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
