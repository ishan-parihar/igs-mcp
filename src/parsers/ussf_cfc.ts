import type { NewsItem, Source } from '../types/news.js';
import { stripHtml, decodeEntities } from '../normalize/html.js';

// Extract <article class="article-listing-item ..."> blocks
export function parseUssfcfcHtml(source: Source, html: string): NewsItem[] {
  const baseUrl = 'https://www.ussf-cfc.spaceforce.mil';
  const blocks = html.split('<article class="article-listing-item');
  const out: NewsItem[] = [];
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    try {
      const titleMatch = block.match(/<h1>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h1>/);
      if (!titleMatch) continue;
      let link = titleMatch[1].trim();
      if (!link.startsWith('http')) link = baseUrl + (link.startsWith('/') ? link : '/' + link);
      const title = decodeEntities(titleMatch[2].replace(/<[^>]*>/g, '').trim());
      const dateMatch = block.match(/<time[^>]*datetime="([^"]+)"/);
      const pubDate = dateMatch ? new Date(dateMatch[1].trim()).toISOString() : new Date().toISOString();
      const descMatch = block.match(/<h1>[\s\S]*?<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/);
      const description = descMatch ? stripHtml(descMatch[1]) : '';
      out.push({
        id: link,
        title,
        link,
        pubDate,
        source_name: source.name,
        pool_id: source.pools[0] || 'POOL_C_TECH',
        content_snippet: description.slice(0, 600),
      });
    } catch {}
  }
  return out;
}
