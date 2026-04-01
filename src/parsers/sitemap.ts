import { load as loadXml } from 'cheerio';
import type { NewsItem, Source } from '../types/news.js';
import type { HttpClient } from '../http/client.js';
import { stripHtml } from '../normalize/html.js';

async function tryFetch(http: HttpClient, url: string) {
  try { const res = await http.fetch(url, {}, 'bypass'); return ('response' in res) ? res.response.bodyText : null; } catch { return null; }
}

export async function findSitemaps(baseUrl: string, http: HttpClient): Promise<string[]> {
  const urls: string[] = [];
  const robots = await tryFetch(http, new URL('/robots.txt', baseUrl).toString());
  if (robots) {
    for (const line of robots.split(/\r?\n/)) {
      const m = line.match(/Sitemap:\s*(\S+)/i);
      if (m) urls.push(m[1]);
    }
  }
  if (urls.length === 0) {
    urls.push(new URL('/sitemap.xml', baseUrl).toString());
    urls.push(new URL('/sitemap_index.xml', baseUrl).toString());
  }
  return Array.from(new Set(urls));
}

export function parseSitemapXml(xml: string): { loc: string; lastmod?: string }[] {
  const $ = loadXml(xml, { xmlMode: true });
  const out: { loc: string; lastmod?: string }[] = [];
  // sitemapindex -> sitemap
  $('sitemapindex sitemap loc').each((_i, el) => {
    const loc = $(el).text().trim();
    if (loc) out.push({ loc });
  });
  if (out.length) return out;
  // urlset -> url
  const out2: { loc: string; lastmod?: string }[] = [];
  $('urlset url').each((_i, el) => {
    const loc = $(el).find('loc').text().trim();
    if (!loc) return;
    const lastmod = $(el).find('lastmod').text().trim();
    out2.push({ loc, lastmod });
  });
  return out2;
}

export async function sampleFromSitemap(source: Source, http: HttpClient): Promise<NewsItem[] | null> {
  const candidates = await findSitemaps(source.url, http);
  for (const smUrl of candidates.slice(0, 3)) {
    const xml = await tryFetch(http, smUrl);
    if (!xml) continue;
    const entries = parseSitemapXml(xml);
    if (!entries.length) continue;
    // If this is a sitemap index, try to pick likely news sitemap
    if (entries[0].loc && !entries[0].lastmod && entries.length && entries[0].loc.endsWith('.xml')) {
      const filtered = entries.filter(e => /news|latest|world|article|stories/i.test(e.loc));
      const pick = (filtered[0] || entries[0]).loc;
      const xml2 = await tryFetch(http, pick);
      if (!xml2) continue;
      const urls = parseSitemapXml(xml2).slice(0, 50);
      if (!urls.length) continue;
      return urls.map(u => toItem(source, u.loc, u.lastmod));
    }
    // Already a urlset
    const urls = entries.slice(0, 50);
    if (urls.length) return urls.map(u => toItem(source, u.loc, u.lastmod));
  }
  return null;
}

function toItem(source: Source, loc: string, lastmod?: string): NewsItem {
  const title = stripHtml(decodeURIComponent(loc.split('/').pop() || '')).replace(/[-_]/g, ' ').slice(0, 120) || 'Untitled';
  let pubDate = new Date().toISOString();
  if (lastmod) {
    const d = new Date(lastmod);
    if (!isNaN(d.getTime())) pubDate = d.toISOString();
  }
  return {
    id: loc,
    title,
    link: loc,
    pubDate,
    source_name: source.name,
    pool_id: source.pools[0] || 'UNKNOWN',
    content_snippet: '',
  };
}
