import type { NewsItem, Source } from '../types/news.js';
import { stripHtml } from '../normalize/html.js';

// WHO API returns JSON with items/value; reconstruct title/link/content date.
export function parseWhoJson(source: Source, jsonText: string): NewsItem[] {
  let data: any;
  try { data = JSON.parse(jsonText); } catch { return []; }
  let items: any[] = [];
  if (Array.isArray(data?.value)) items = data.value;
  else if (Array.isArray(data)) items = data;
  const baseUrl = 'https://www.who.int/emergencies/disease-outbreak-news/item/';
  const out: NewsItem[] = [];
  for (const it of items) {
    try {
      const title = (it.UseOverrideTitle && it.OverrideTitle) ? it.OverrideTitle : (it.Title || 'Untitled');
      let slug = it.UrlName || it.ItemDefaultUrl || '';
      slug = String(slug).replace(/^\//, '');
      const link = baseUrl + slug;
      const pubRaw = it.PublicationDateAndTime || it.PublicationDate || it.DateCreated || new Date().toISOString();
      const pubDate = new Date(pubRaw).toISOString();
      const description = [it.Summary, it.Overview, it.Assessment, it.Advice].filter(Boolean).join(' ');
      const snippet = stripHtml(description).slice(0, 600);
      out.push({
        id: link,
        title,
        link,
        pubDate,
        source_name: source.name,
        pool_id: source.pools[0] || 'POOL_E_ENV_HEALTH',
        content_snippet: snippet,
        raw: it,
      });
    } catch {}
  }
  return out;
}
