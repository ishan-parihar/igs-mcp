import type { NewsItem, Source } from '../types/news.js';
import { stripHtml } from '../normalize/html.js';

// Parse <script id="static-page"> JSON payload and extract stories
export function parseNewslaundryHtml(source: Source, html: string): NewsItem[] {
  const scriptRegex = /<script[^>]*id="static-page"[^>]*>([\s\S]*?)<\/script>/i;
  const m = html.match(scriptRegex);
  if (!m || !m[1]) return [];
  let jsonData: any;
  try { jsonData = JSON.parse(m[1]); } catch { return []; }
  const rootItems = jsonData?.qt?.data?.collection?.items || [];
  const stories: any[] = [];
  const extractStories = (arr: any[]) => {
    for (const it of arr) {
      if (it.type === 'story' && it.story) stories.push(it.story);
      else if (it.type === 'collection' && Array.isArray(it.items)) extractStories(it.items);
    }
  };
  extractStories(rootItems);
  const out: NewsItem[] = [];
  for (const s of stories) {
    try {
      const title = s.headline || 'Untitled';
      const link = s.url || '';
      const description = s.subheadline || '';
      const author = s['author-name'] || '';
      let isoDate = new Date().toISOString();
      if (s['last-published-at']) {
        isoDate = new Date(s['last-published-at']).toISOString();
      }
      const snippet = stripHtml(description).slice(0, 600);
      out.push({
        id: link || title + '_' + isoDate,
        title,
        link,
        pubDate: isoDate,
        source_name: source.name,
        pool_id: source.pools[0] || 'POOL_D_CULTURE',
        content_snippet: snippet,
        author,
        raw: s,
      });
    } catch {}
  }
  return out;
}
