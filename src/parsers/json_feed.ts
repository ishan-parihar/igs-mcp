import type { NewsItem, Source } from '../types/news.js';
import { stripHtml } from '../normalize/html.js';

export function parseJsonFeed(source: Source, body: string): NewsItem[] {
  let data: any;
  try { data = JSON.parse(body); } catch { return []; }

  const items: any[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : Array.isArray(data?.value) ? data.value : [];
  const out: NewsItem[] = [];

  for (const it of items) {
    try {
      // JSON Feed (https://jsonfeed.org/version/1): items[] with url/id/title/date_published/summary/content_html
      // rss2json: items[] with title, link, pubDate, description/content, thumbnail
      const title = it.title || stripHtml(it.summary || '') || 'Untitled';
      const link = it.url || it.link || it.guid || '';
      if (!link) continue;
      const pubRaw = it.date_published || it.pubDate || it.date || it.updated || it.published;
      let pubDate = new Date().toISOString();
      if (pubRaw) {
        const d = new Date(pubRaw);
        if (!isNaN(d.getTime())) pubDate = d.toISOString();
      }
      const desc = it.content_text || it.content || it.description || it.summary || it['content:encoded'] || '';
      const content_snippet = stripHtml(String(desc)).slice(0, 600);
      const media = it.image || it.banner_image || it.thumbnail || (it.enclosure && it.enclosure.url);
      out.push({
        id: String(it.id || link),
        title,
        link,
        pubDate,
        source_name: source.name,
        pool_id: source.pools[0] || 'UNKNOWN',
        content_snippet,
        media_url: media,
        raw: it,
      });
    } catch {}
  }
  return out;
}
