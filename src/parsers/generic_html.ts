import { load as loadHtml } from 'cheerio';
import { stripHtml } from '../normalize/html.js';
import type { NewsItem, Source } from '../types/news.js';
import type { HttpClient } from '../http/client.js';

export type SelectorConfig = {
  item: string;
  title?: string;
  link?: string;
  date?: string;
  desc?: string;
};

export async function parseWithSelectors(source: Source, html: string, selectors: SelectorConfig): Promise<NewsItem[]> {
  const $ = loadHtml(html);
  const out: NewsItem[] = [];
  $(selectors.item).each((_i, el) => {
    try {
      const scope = $(el);
      let link = selectors.link ? scope.find(selectors.link).attr('href') : scope.find('a').attr('href');
      if (!link) return;
      const abs = new URL(link, source.url).toString();
      const titleText = selectors.title ? scope.find(selectors.title).text() : scope.find('a, h1, h2, h3').first().text();
      const title = stripHtml(titleText).slice(0, 500) || 'Untitled';
      let pubDate = new Date().toISOString();
      if (selectors.date) {
        const dateVal = scope.find(selectors.date).attr('datetime') || scope.find(selectors.date).text();
        if (dateVal) {
          const d = new Date(dateVal);
          if (!isNaN(d.getTime())) pubDate = d.toISOString();
        }
      } else {
        const timeEl = scope.find('time');
        const dt = timeEl.attr('datetime') || timeEl.text();
        if (dt) {
          const d = new Date(dt);
          if (!isNaN(d.getTime())) pubDate = d.toISOString();
        }
      }
      const descRaw = selectors.desc ? scope.find(selectors.desc).text() : scope.find('p').first().text();
      const content_snippet = stripHtml(descRaw).slice(0, 600);
      out.push({
        id: abs,
        title,
        link: abs,
        pubDate,
        source_name: source.name,
        pool_id: source.pools[0] || 'UNKNOWN',
        content_snippet,
      });
    } catch {}
  });
  return out;
}

// Heuristic auto parser for HTML pages without RSS: try common item containers and scoring
const ITEM_CANDIDATE_SELECTORS = [
  'article',
  'div[class*=article]',
  'div[class*=post]',
  'div[class*=card]',
  'div[class*=listing]',
  'div[class*=story]',
  'div[class*=headline]',
  'div[class*=teaser]',
  'div.views-row',
  'div[class*=node]',
  'li[class*=article]',
  'li[class*=post]',
  'section[class*=list] article',
  'section[class*=list] li',
  'a.card',
  'a[href*="/news/"]',
];

function scoreItem($: any, el: any): number {
  const scope = $(el as any);
  const a = scope.find('a').first();
  const href = a.attr('href');
  const text = stripHtml(a.text() || '') || stripHtml(scope.text() || '');
  let score = 0;
  if (href) score += 2;
  if (text.length > 20) score += 2;
  const timeEl = scope.find('time');
  if (timeEl.length) score += 1;
  if (/\/(20\d{2}|19\d{2})\//.test(href || '')) score += 1;
  return score;
}

export async function autoParseHtml(source: Source, html: string): Promise<{ items: NewsItem[]; usedSelector?: string }> {
  const $ = loadHtml(html);
  let best: { selector: string; items: NewsItem[]; score: number } | null = null;
  for (const sel of ITEM_CANDIDATE_SELECTORS) {
    const nodes = $(sel);
    if (!nodes.length) continue;
    const items: NewsItem[] = [];
    nodes.each((_i, el: any) => {
      const s = scoreItem($ as any, el as any);
      if (s < 3) return;
      try {
        const scope = $(el);
        const a = (el?.name === 'a') ? scope : scope.find('a').first();
        let href = a.attr('href');
        if (!href) return;
        const abs = new URL(href, source.url).toString();
        const titleText = a.text() || scope.find('h1,h2,h3').first().text();
        const title = stripHtml(titleText).slice(0, 500) || 'Untitled';
        let pubDate = new Date().toISOString();
        const timeEl = scope.find('time');
        const dt = timeEl.attr('datetime') || timeEl.text();
        if (dt) {
          const d = new Date(dt);
          if (!isNaN(d.getTime())) pubDate = d.toISOString();
        }
        const para = scope.find('p').first().text();
        const content_snippet = stripHtml(para).slice(0, 600);
        items.push({ id: abs, title, link: abs, pubDate, source_name: source.name, pool_id: source.pools[0] || 'UNKNOWN', content_snippet });
      } catch {}
    });
    const good = items.length;
    const avgTitleLen = items.reduce((a, b) => a + b.title.length, 0) / (good || 1);
    const score = good * 2 + (avgTitleLen > 30 ? 1 : 0);
    if (!best || score > best.score) best = { selector: sel, items, score };
  }
  return { items: best?.items || [], usedSelector: best?.selector };
}

// Explore common site routes to find a good list page, then parse
const COMMON_PATHS = ['/', '/news', '/latest', '/world', '/politics', '/business', '/technology', '/tech', '/opinion', '/opinions', '/culture', '/india', '/international', '/world-news', '/latest-news', '/economy', '/analysis'];

export async function autodiscoverList(source: Source, http: HttpClient): Promise<{ kind: 'rss'|'atom'|'html'|'none'; url?: string; selectors?: SelectorConfig; sample?: NewsItem[] }> {
  // Fetch base page first
  for (const p of COMMON_PATHS) {
    try {
      const url = new URL(p, source.url).toString();
      const res = await http.fetch(url, {}, 'bypass');
      if (!('response' in res)) continue;
      const ctype = (res.response.headers['content-type'] || '').toLowerCase();
      const body = res.response.bodyText;
      if (ctype.includes('xml') || /<rss[\s>/]/i.test(body) || /<feed[\s>/]/i.test(body)) {
        return { kind: 'rss', url, sample: [] };
      }
      // Try rel=alternate for RSS on this page
      const $ = loadHtml(body);
      const linkEl = $("link[rel='alternate'][type*='rss'], link[rel='alternate'][type*='atom']").first();
      const href = linkEl.attr('href');
      if (href) {
        const feedUrl = new URL(href, url).toString();
        return { kind: 'rss', url: feedUrl };
      }
      // Otherwise attempt autoParseHtml
      const { items, usedSelector } = await autoParseHtml(source, body);
      if ((items?.length || 0) >= 5 && usedSelector) {
        return { kind: 'html', url, selectors: { item: usedSelector }, sample: items.slice(0, 10) };
      }
    } catch {}
  }
  return { kind: 'none' };
}
